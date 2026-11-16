"use client";

import { supabase } from "../supabase";
import type { Solped } from "./solped";

/* ── Pedir cotización ─────────────────────────────────────────────────────── */

/**
 * El correlativo de la solicitud de cotización que se le manda al proveedor.
 *
 * Va aparte del id interno (`COT-SOLPED-100-01`): el proveedor menciona este
 * número al responder, y un identificador con el número de la solicitud interna
 * adentro le dice cosas de Valar que no le incumben.
 */
export function siguienteNumeroSolicitud(existentes: { numero: string | null }[]) {
  const usados = existentes
    .map((c) => Number(/^SC-(\d+)$/.exec(c.numero ?? "")?.[1] ?? 0))
    .filter((n) => n > 0);

  const siguiente = (usados.length > 0 ? Math.max(...usados) : 0) + 1;
  return `SC-${String(siguiente).padStart(4, "0")}`;
}

/**
 * Manda una solicitud de cotización a UN proveedor, con SOLO los ítems que se
 * le quieren pedir a él.
 *
 * Esto es lo que faltaba para poder cotizar de verdad: una solicitud no se le
 * pide entera al mismo proveedor —el ferretero no vende EPP y el de EPP no
 * vende fierro—, así que pedirle a cada uno la lista completa obligaba a que
 * respondiera "no tengo" en la mitad, o peor, a mandar tres correos a mano por
 * fuera de la plataforma.
 *
 * NO HAY TABLA NUEVA: una cotización en estado 'solicitada' y sin `recibida_en`
 * ES la solicitud enviada, y sus ítems son lo que se le pidió a ese proveedor.
 * Cuando responda, sobre esa misma fila se cargan los precios, y la diferencia
 * entre las dos fechas es su tiempo de respuesta.
 *
 * La SOLPED pasa a "en cotización" sola: lo hace un trigger de la base
 * (`marcar_solped_en_cotizacion`), para que valga aunque la solicitud entre por
 * un script y no por esta pantalla.
 */
export async function pedirCotizacion({
  solped,
  proveedorId,
  numero,
  items,
  validezHasta = null,
  observaciones = null,
}: {
  solped: Solped;
  proveedorId: string;
  numero: string;
  /** Qué se le pide a este proveedor: ítem de la solicitud y cuánto. */
  items: { solpedItemId: string; cantidad: number; nombrePedido?: string | null }[];
  validezHasta?: string | null;
  observaciones?: string | null;
}) {
  if (items.length === 0) {
    throw new Error("Elige al menos un ítem para pedirle a este proveedor.");
  }

  const cabecera = {
    numero,
    solped_id: solped.id,
    proveedor_id: proveedorId,
    solicitada_en: new Date().toISOString().slice(0, 10),
    // Sin respuesta todavía: es exactamente lo que la deja "esperando".
    recibida_en: null,
    validez_hasta: validezHasta,
    estado: "solicitada",
    observaciones,
  };
  const lineas = items.map((i) => ({
    solped_item_id: i.solpedItemId,
    cantidad: i.cantidad,
    // Solo si se corrigió (y así nada se rompe antes de aplicar la 0108): la solicitud de faena no se toca.
    ...(i.nombrePedido?.trim() ? { nombre_pedido: i.nombrePedido.trim() } : {}),
    // Nace sin precio: el proveedor todavía no responde.
    precio_unitario: 0,
    disponible: true,
  }));

  /* Todo en una transacción y con el código decidido por la base (0120). */
  const { data, error: falloRpc } = await supabase.rpc("pedir_cotizacion", { p_cotizacion: cabecera, p_items: lineas });
  if (!falloRpc) return data as string;
  throw new Error(falloRpc.message);
}

/**
 * Registra una cotización que llegó por fuera de la plataforma (correo, papel),
 * con sus ítems, en una transacción y con el código decidido por la base (0121).
 */
export async function registrarCotizacion({
  cabecera,
  items,
}: {
  cabecera: Record<string, unknown>;
  items: Record<string, unknown>[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("registrar_cotizacion", { p_cotizacion: cabecera, p_items: items });
  if (!error) return data as string;
  throw new Error(error.message);
}

/**
 * Carga la respuesta del proveedor sobre una solicitud ya enviada.
 *
 * Es el otro lado de `pedirCotizacion`: la fila ya existe, lo que llega son los
 * precios. Se actualiza en vez de crear una nueva para que `solicitada_en` siga
 * siendo cuándo se pidió — de ahí sale el tiempo de respuesta, que es lo que
 * después dice qué proveedor contesta y cuál hace perder una semana.
 */
export async function cargarRespuesta({
  cotizacionId,
  recibidaEn,
  plazoEntregaDias,
  condicionPago,
  flete,
  descuento,
  precios,
  validezHasta = null,
  corregir = false,
}: {
  cotizacionId: string;
  /**
   * Corregir una cotización ya cargada (se equivocó un precio): se actualizan
   * los valores pero NO el estado, para no deselegir a un proveedor elegido.
   */
  corregir?: boolean;
  recibidaEn: string;
  plazoEntregaDias: number | null;
  condicionPago: string | null;
  flete: number;
  descuento: number;
  /** Por ítem de la solicitud: precio unitario y si lo tiene. */
  precios: {
    solpedItemId: string;
    precioUnitario: number;
    disponible: boolean;
    nombre?: string | null;
    /** Lo que de verdad se cotiza/compra: puede diferir de lo pedido (se vende por paquetes). */
    cantidad?: number;
  }[];
  validezHasta?: string | null;
}) {
  const { error } = await supabase
    .from("cotizaciones")
    .update({
      recibida_en: recibidaEn,
      plazo_entrega_dias: plazoEntregaDias,
      condicion_pago: condicionPago,
      flete,
      descuento,
      validez_hasta: validezHasta,
      ...(corregir ? {} : { estado: "recibida" }),
    })
    .eq("id", cotizacionId);

  if (error) throw new Error(error.message);

  const { data: existentes, error: falloLectura } = await supabase
    .from("cotizacion_items")
    .select("id, solped_item_id")
    .eq("cotizacion_id", cotizacionId);
  if (falloLectura) throw new Error(falloLectura.message);

  const yaCotizados = new Set((existentes ?? []).map((f) => f.solped_item_id as string));
  let ultimo = Math.max(0, ...(existentes ?? []).map((f) => Number(/-(\d+)$/.exec(f.id as string)?.[1] ?? 0)));

  for (const p of precios) {
    const cantidad = p.cantidad !== undefined && p.cantidad > 0 ? p.cantidad : null;

    /* Un ítem que la cotización no tenía (se sumó después, cuando faltaba por
       comprar) se agrega; si quedó sin precio se ignora, no se guarda en cero. */
    if (!yaCotizados.has(p.solpedItemId)) {
      if (!p.disponible || !(p.precioUnitario > 0) || cantidad === null) continue;
      ultimo += 1;
      const { error: fallo } = await supabase.from("cotizacion_items").insert({
        id: `${cotizacionId}-${String(ultimo).padStart(3, "0")}`,
        cotizacion_id: cotizacionId,
        solped_item_id: p.solpedItemId,
        cantidad,
        precio_unitario: p.precioUnitario,
        disponible: true,
        nombre_cotizado: p.nombre?.trim() || null,
      });
      if (fallo) throw new Error(mensajeDeNombreCotizado(fallo.message));
      continue;
    }

    const { error: fallo } = await supabase
      .from("cotizacion_items")
      .update({
        precio_unitario: p.disponible ? p.precioUnitario : 0,
        disponible: p.disponible,
        nombre_cotizado: p.nombre?.trim() || null,
        ...(cantidad !== null ? { cantidad } : {}),
      })
      .eq("cotizacion_id", cotizacionId)
      .eq("solped_item_id", p.solpedItemId);

    if (fallo) throw new Error(mensajeDeNombreCotizado(fallo.message));
  }
}

/**
 * Da por completo un ítem que se compró en menos cantidad que la pedida.
 *
 * Pasa cuando el proveedor lo vende por paquete: se pidieron 10 bolsas, el
 * paquete trae 10 y se compró 1. El pendiente sale de pedido − comprado, así que
 * sin corregir lo pedido el ítem queda "faltando" para siempre. Se ajusta la
 * cantidad pedida a lo comprado y se deja escrito qué se pidió y por qué, en la
 * observación del ítem: el cambio queda a la vista, no se pierde el original.
 */
export async function darPorCompletoItem({
  solpedId,
  solpedItemId,
  motivo,
}: {
  solpedId: string;
  solpedItemId: string;
  motivo: string;
}) {
  const limpio = motivo.trim();
  if (!limpio) throw new Error("Escribe el motivo: queda anotado en el ítem.");

  const { data: avance, error: falloAvance } = await supabase
    .from("solped_items_avance")
    .select("cantidad_pedida, cantidad_comprada, observacion, unidad")
    .eq("id", solpedItemId)
    .single();
  if (falloAvance) throw new Error(falloAvance.message);

  const pedida = Number(avance.cantidad_pedida);
  const comprada = Number(avance.cantidad_comprada);
  if (!(comprada > 0)) throw new Error("Este ítem todavía no se compra: no hay nada que dar por completo.");
  if (comprada >= pedida) return;

  /* Mientras la solicitud espera aprobación o compra, cambiar un ítem la devuelve
     a aprobación (trigger). Acá ya hay compra, pero si el estado fuera otro se avisa
     en vez de reabrirla sin querer. */
  const { data: solped, error: falloSolped } = await supabase
    .from("solped")
    .select("estado")
    .eq("id", solpedId)
    .single();
  if (falloSolped) throw new Error(falloSolped.message);
  if (["aprobada", "en-cotizacion", "cotizada"].includes(solped.estado as string)) {
    throw new Error("Esta solicitud todavía no está en compra: cambiar el ítem la devolvería a aprobación.");
  }

  const nota = `Se pidieron ${pedida} ${avance.unidad}; se compraron ${comprada}. ${limpio}`;
  const observacion = [avance.observacion as string | null, nota].filter(Boolean).join(" · ");

  const { error } = await supabase
    .from("solped_items")
    .update({ cantidad: comprada, observacion })
    .eq("id", solpedItemId);
  if (error) throw new Error(error.message);
}

/** Si la migración 0088 no está aplicada, decirlo en claro en vez de un error de columna. */
export function mensajeDeNombreCotizado(mensaje: string) {
  return /nombre_cotizado/.test(mensaje) ? "Falta aplicar la migración 0088 en la base." : mensaje;
}

