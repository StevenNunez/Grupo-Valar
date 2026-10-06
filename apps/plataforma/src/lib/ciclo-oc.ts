"use client";

import { siguienteIdDeCompra } from "./pagos";
import { supabase } from "./supabase";

/**
 * El ciclo de una OC: lo que llegó, lo que se facturó, lo que se acreditó con
 * nota de crédito y lo que se cerró sin llegar.
 *
 * Las cantidades las calcula la base (`items_avance`, migración 0051) y las
 * reglas viven allá: no se recibe más de lo pedido, no se factura más de lo
 * pedido, la NC no acredita más de lo que cobró su factura, y lo que llegó no
 * se puede cerrar. Acá solo se lee y se llama a las funciones que registran
 * cada documento entero.
 */

export type LineaCiclo = {
  id: string;
  descripcion: string;
  unidad: string;
  precioUnitario: number;
  pedida: number;
  recibida: number;
  facturada: number;
  acreditada: number;
  cerrada: number;
  /** Pedida − acreditada − cerrada: lo que sigue siendo costo. */
  vigente: number;
  facturadaNeta: number;
  /** Facturado y no llegó. */
  sinRecibir: number;
  recibidaSinFacturar: number;
  porRecibir: number;
  /** Del catálogo de Pagnol, si la línea salió de ahí: al recibirla se informa. */
  pagnolMaterialId: string | null;
};

export type RecepcionCiclo = {
  id: string;
  fecha: string;
  guia: string | null;
  recibidoPor: string | null;
  observaciones: string | null;
  lineas: { itemId: string; cantidad: number }[];
  /** Lo que se le informó a Pagnol de esta recepción (0055). Null si no tenía líneas de Pagnol. */
  pagnol: { total: number; enviados: number; errores: string[] } | null;
};

export type NotaCreditoCiclo = {
  id: string;
  numero: string;
  fecha: string;
  neto: number;
  iva: number;
  lineas: { itemId: string; cantidad: number }[];
};

export type FacturaCiclo = {
  id: string;
  documento: string;
  fechaFactura: string | null;
  vencimiento: string | null;
  neto: number;
  iva: number;
  estadoPago: string;
  lineas: { itemId: string; cantidad: number }[];
  notas: NotaCreditoCiclo[];
};

export type CicloOrden = {
  lineas: LineaCiclo[];
  recepciones: RecepcionCiclo[];
  facturas: FacturaCiclo[];
};

const n = (v: unknown) => Number(v ?? 0);

export async function cargarCiclo(ordenId: string): Promise<CicloOrden> {
  const [items, avance, recepciones, facturas] = await Promise.all([
    supabase.from("items_compra").select("id, descripcion, unidad, precio_unitario, pagnol_material_id").eq("orden_id", ordenId).order("id"),
    supabase.from("items_avance").select("*").eq("orden_id", ordenId),
    supabase
      .from("recepciones")
      .select("id, fecha, guia_despacho, recibido_por, observaciones, recepcion_items(item_id, cantidad)")
      .eq("orden_id", ordenId)
      .order("fecha", { ascending: false }),
    supabase
      .from("compras")
      .select(
        "id, documento, fecha_factura, fecha_vencimiento, neto, iva, estado_pago, " +
          "factura_items(item_id, cantidad), notas_credito(id, numero, fecha, neto, iva, nota_credito_items(item_id, cantidad))",
      )
      .eq("orden_id", ordenId)
      .order("fecha_factura", { ascending: false }),
  ]);
  const fallo = items.error ?? avance.error ?? recepciones.error ?? facturas.error;
  if (fallo) throw new Error(fallo.message);

  const porId = new Map((avance.data ?? []).map((a) => [a.id as string, a]));

  /* Lo informado a Pagnol, por recepción. Si la tabla no existe todavía (0055
     sin aplicar) la pantalla sigue igual, sin el estado de Pagnol. */
  const idsRecepcion = (recepciones.data ?? []).map((r) => (r as { id: string }).id);
  const envios = idsRecepcion.length
    ? await supabase.from("pagnol_envios").select("recepcion_id, tipo, estado, error, external_ref").in("recepcion_id", idsRecepcion)
    : { data: [], error: null };
  const enviosPor = new Map<string, { tipo: string; estado: string; error: string | null; external_ref: string }[]>();
  for (const e of (envios.error ? [] : envios.data ?? []) as { recepcion_id: string; tipo: string; estado: string; error: string | null; external_ref: string }[]) {
    if (e.tipo !== "activo" && e.tipo !== "ingreso") continue;
    enviosPor.set(e.recepcion_id, [...(enviosPor.get(e.recepcion_id) ?? []), e]);
  }
  type Detalle = { item_id: string; cantidad: unknown }[] | null;
  const lineasDe = (d: Detalle) => (d ?? []).map((x) => ({ itemId: x.item_id, cantidad: n(x.cantidad) }));

  return {
    lineas: (items.data ?? []).map((i) => {
      const a = porId.get(i.id) ?? {};
      return {
        id: i.id,
        descripcion: i.descripcion,
        unidad: i.unidad,
        precioUnitario: n(i.precio_unitario),
        pedida: n(a.cantidad),
        recibida: n(a.recibida),
        facturada: n(a.facturada),
        acreditada: n(a.acreditada),
        cerrada: n(a.cerrada),
        vigente: n(a.vigente),
        facturadaNeta: n(a.facturada_neta),
        sinRecibir: n(a.sin_recibir),
        recibidaSinFacturar: n(a.recibida_sin_facturar),
        porRecibir: n(a.por_recibir),
        pagnolMaterialId: (i.pagnol_material_id as string | null) ?? null,
      };
    }),
    recepciones: ((recepciones.data ?? []) as unknown as {
      id: string; fecha: string; guia_despacho: string | null; recibido_por: string | null;
      observaciones: string | null; recepcion_items: Detalle;
    }[]).map((r) => ({
      id: r.id,
      fecha: r.fecha,
      guia: r.guia_despacho,
      recibidoPor: r.recibido_por,
      observaciones: r.observaciones,
      lineas: lineasDe(r.recepcion_items),
      pagnol: enviosPor.has(r.id)
        ? {
            total: enviosPor.get(r.id)!.length,
            enviados: enviosPor.get(r.id)!.filter((e) => e.estado === "enviado").length,
            errores: [...new Set(enviosPor.get(r.id)!.filter((e) => e.estado === "error").map((e) => e.error ?? "Error sin detalle"))],
          }
        : null,
    })),
    facturas: ((facturas.data ?? []) as unknown as {
      id: string; documento: string | null; fecha_factura: string | null; fecha_vencimiento: string | null;
      neto: number; iva: number; estado_pago: string; factura_items: Detalle;
      notas_credito: { id: string; numero: string; fecha: string; neto: number; iva: number; nota_credito_items: Detalle }[] | null;
    }[]).map((c) => ({
      id: c.id,
      documento: c.documento ?? "",
      fechaFactura: c.fecha_factura,
      vencimiento: c.fecha_vencimiento,
      neto: n(c.neto),
      iva: n(c.iva),
      estadoPago: c.estado_pago,
      lineas: lineasDe(c.factura_items),
      notas: (c.notas_credito ?? []).map((nc) => ({
        id: nc.id,
        numero: nc.numero,
        fecha: nc.fecha,
        neto: n(nc.neto),
        iva: n(nc.iva),
        lineas: lineasDe(nc.nota_credito_items),
      })),
    })),
  };
}

export type CantidadPorLinea = { item_id: string; cantidad: number }[];

/** Los mensajes de la base, en lo que se entiende frente a la pantalla. */
function traducir(mensaje: string) {
  if (/items_recibida_no_supera_pedida/.test(mensaje)) return "Se está recibiendo más de lo pedido en alguna línea.";
  if (/row-level security|permission denied/i.test(mensaje)) return "Tu acceso no permite registrar esto en este contrato.";
  if (/duplicate key/i.test(mensaje)) return "Ya existe un documento con ese número.";
  return mensaje;
}

async function llamar<T>(funcion: string, argumentos: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcion, argumentos);
  if (error) throw new Error(traducir(error.message));
  return data as T;
}

export async function registrarRecepcion(datos: {
  ordenId: string;
  fecha: string;
  guia: string;
  recibidoPor: string;
  observaciones: string;
  lineas: CantidadPorLinea;
  /** Pañol de Pagnol donde entra. Solo cuando hay líneas del catálogo de Pagnol. */
  panolId?: string | null;
}) {
  const id = await llamar<string>("registrar_recepcion", {
    p_orden_id: datos.ordenId,
    p_fecha: datos.fecha,
    p_guia: datos.guia,
    p_recibido_por: datos.recibidoPor,
    p_observaciones: datos.observaciones,
    p_lineas: datos.lineas,
  });
  if (datos.panolId) {
    const { error } = await supabase.from("recepciones").update({ pagnol_panol_id: datos.panolId }).eq("id", id);
    if (error) throw new Error(traducir(error.message));
  }
  return id;
}

export async function registrarFacturaOC(datos: {
  ordenId: string;
  contratoId: string;
  documento: string;
  fechaFactura: string;
  vencimiento: string | null;
  neto: number;
  iva: number;
  lineas: CantidadPorLinea;
}) {
  // El código de la compra sigue la serie de siempre: CO-<contrato>-<mes>[-n].
  const id = await siguienteIdDeCompra(datos.contratoId, `${datos.fechaFactura.slice(0, 7)}-01`);
  return llamar<string>("registrar_factura_oc", {
    p_id: id,
    p_orden_id: datos.ordenId,
    p_documento: datos.documento,
    p_fecha_factura: datos.fechaFactura,
    p_vencimiento: datos.vencimiento,
    p_neto: datos.neto,
    p_iva: datos.iva,
    p_lineas: datos.lineas,
  });
}

export function registrarNotaCredito(datos: {
  compraId: string;
  numero: string;
  fecha: string;
  neto: number;
  iva: number;
  observaciones: string;
  lineas: CantidadPorLinea;
}) {
  return llamar<string>("registrar_nota_credito", {
    p_compra_id: datos.compraId,
    p_numero: datos.numero,
    p_fecha: datos.fecha,
    p_neto: datos.neto,
    p_iva: datos.iva,
    p_observaciones: datos.observaciones,
    p_lineas: datos.lineas,
  });
}

/** Cerrar lo que no va a llegar: se suma a lo ya cerrado de cada línea. */
export async function cerrarSaldo(cierres: { linea: LineaCiclo; cantidad: number }[]) {
  for (const { linea, cantidad } of cierres) {
    if (cantidad <= 0) continue;
    const { error } = await supabase
      .from("items_compra")
      .update({ cantidad_cerrada: linea.cerrada + cantidad })
      .eq("id", linea.id);
    if (error) throw new Error(traducir(error.message));
  }
}

/** Lo que se puede cerrar de una línea: lo pedido que ni llegó ni está facturado. */
export const cerrable = (l: LineaCiclo) => Math.max(0, l.vigente - Math.max(l.recibida, l.facturadaNeta));
/** Lo que todavía se puede facturar de una línea. */
export const facturable = (l: LineaCiclo) => Math.max(0, l.vigente - l.facturadaNeta);
