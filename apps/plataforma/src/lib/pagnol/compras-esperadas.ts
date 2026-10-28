import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PagnolNoConfigurado } from "./client";
import { mensajeEscritura } from "./recepcion";

/**
 * Fase 5 · B del contrato con Pagnol (docs/integracion-pagnol-valar.md):
 * una OC enviada al proveedor se ANUNCIA a Pagnol como compra esperada
 * (`POST /compras-esperadas`) y el pañolero la recibe allá.
 *
 *   enviar la OC              → se anuncia (solo si la empresa recibe en Pagnol)
 *   cambiar la OC             → PATCH mientras se pueda; Pagnol rechaza con 409
 *                               bajar una línea por debajo de lo ya recibido
 *   anular la OC              → PATCH { cancelar: true } (lo recibido se queda)
 *
 * Solo viajan las líneas que son del catálogo de Pagnol (`pagnol_material_id`).
 * La referencia de cada línea es `valar:oc:<id de la OC>:item:<id de la línea>`:
 * Pagnol le agrega `:unidad:<n>` o `:recepcion:<k>` a lo que crea. El prefijo
 * `valar:compra:` es de las compras directas y no se usa acá.
 *
 * El anuncio se anota en `ordenes_pagnol` ANTES de mandarlo, con su
 * `Idempotency-Key`; si algo falla queda en error y el reintento usa la misma.
 *
 * Los tipos de `/compras-esperadas` aún no están en `schema.d.ts` (sale de
 * `npm run gen:pagnol` cuando Pagnol despliegue la fase): por eso este módulo
 * habla con `fetch` y declara abajo lo poco que lee.
 */

const ESPERA_MAXIMA_MS = 8_000;

export type EstadoAnuncio = "pendiente" | "anunciada" | "cancelada" | "error";

export type AnuncioDeOrden = {
  estado: EstadoAnuncio | "sin_anunciar";
  panolId: string | null;
  pagnolCompraId: string | null;
  error: string | null;
  anunciadaEn: string | null;
};

type LineaAnunciada = { item_id: string; external_ref: string; cantidad: number };

type Orden = {
  id: string;
  numero: string;
  contrato_id: string;
  estado: string;
  proveedor_id: string | null;
  fecha_requerida: string | null;
};

type ItemOrden = { id: string; descripcion: string; cantidad: number; cantidad_cerrada: number; cantidad_recibida: number; precio_unitario: number; pagnol_material_id: string | null };

type Fila = {
  pagnol_compra_id: string | null;
  panol_id: string | null;
  estado: EstadoAnuncio;
  idempotency_key: string;
  lineas: LineaAnunciada[];
  fecha_estimada: string | null;
  error: string | null;
  anunciada_en: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refDeLinea = (ordenId: string, itemId: string) => `valar:oc:${ordenId}:item:${itemId}`;

/* ── La llamada a Pagnol ──────────────────────────────────────────────────── */

async function llamarPagnol(metodo: "POST" | "PATCH", ruta: string, cuerpo: unknown, llave: string) {
  const baseUrl = process.env.PAGNOL_API_URL;
  const apiKey = process.env.PAGNOL_API_KEY;
  if (!baseUrl || !apiKey) throw new PagnolNoConfigurado("Faltan PAGNOL_API_URL o PAGNOL_API_KEY en las variables del servidor.");
  const r = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": llave },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    cache: "no-store",
  });
  let json: unknown;
  try {
    json = await r.json();
  } catch {
    json = undefined;
  }
  return { estado: r.status, json };
}

/** El motivo, en claro, de un rechazo de Pagnol al anunciar o corregir. */
function motivoDeRechazo(estado: number, json: unknown) {
  const propio = (json as { error?: { message?: string } } | undefined)?.error?.message;
  if (estado === 409 && propio) return propio;
  if (estado === 403) return "La llave de Pagnol no tiene permiso para compras (compras:write).";
  return mensajeEscritura(estado, json);
}

/* ── Lectura en Valar ─────────────────────────────────────────────────────── */

async function leerOrden(sb: SupabaseClient, ordenId: string) {
  const { data: orden, error } = await sb
    .from("ordenes_compra_proveedor")
    .select("id, numero, contrato_id, estado, proveedor_id, fecha_requerida")
    .eq("id", ordenId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!orden) return null;
  const { data: items, error: errItems } = await sb
    .from("items_compra")
    .select("id, descripcion, cantidad, cantidad_cerrada, cantidad_recibida, precio_unitario, pagnol_material_id")
    .eq("orden_id", ordenId)
    .order("id");
  if (errItems) throw new Error(errItems.message);
  return { orden: orden as Orden, items: (items ?? []) as unknown as ItemOrden[] };
}

async function filaDe(sb: SupabaseClient, ordenId: string): Promise<Fila | null> {
  const { data, error } = await sb
    .from("ordenes_pagnol")
    .select("pagnol_compra_id, panol_id, estado, idempotency_key, lineas, fecha_estimada, error, anunciada_en")
    .eq("orden_id", ordenId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Fila | null) ?? null;
}

/** El modo de recepción de la empresa de quien llama. */
export async function modoDeRecepcion(sb: SupabaseClient): Promise<"externa" | "pagnol"> {
  const { data: empresa } = await sb.rpc("empresa_actual");
  if (typeof empresa !== "string") return "externa";
  const { data } = await sb.from("empresas").select("pagnol_recepcion").eq("id", empresa).maybeSingle();
  return data?.pagnol_recepcion === "pagnol" ? "pagnol" : "externa";
}

/** El último pañol que se usó en el contrato: sirve de propuesta. */
async function panolHabitual(sb: SupabaseClient, contratoId: string) {
  const { data } = await sb
    .from("ordenes_pagnol")
    .select("panol_id")
    .eq("contrato_id", contratoId)
    .not("panol_id", "is", null)
    .order("anunciada_en", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data?.panol_id as string | null) ?? null;
}

async function proveedorEnPagnol(sb: SupabaseClient, proveedorId: string | null) {
  if (!proveedorId) return null;
  const { data } = await sb.from("proveedores").select("pagnol_proveedor_id").eq("id", proveedorId).maybeSingle();
  return (data?.pagnol_proveedor_id as string | null) ?? null;
}

/* ── El estado, para la pantalla ──────────────────────────────────────────── */

export async function anuncioDeOrden(sb: SupabaseClient, ordenId: string): Promise<AnuncioDeOrden> {
  const fila = await filaDe(sb, ordenId);
  if (!fila) return { estado: "sin_anunciar", panolId: null, pagnolCompraId: null, error: null, anunciadaEn: null };
  return { estado: fila.estado, panolId: fila.panol_id, pagnolCompraId: fila.pagnol_compra_id, error: fila.error, anunciadaEn: fila.anunciada_en };
}

/* ── Anunciar o corregir ──────────────────────────────────────────────────── */

export type ResultadoAnuncio = { ok: true; anuncio: AnuncioDeOrden; avisos: string[] } | { ok: false; error: string };

/**
 * Anuncia la OC a Pagnol; si ya estaba anunciada, le manda lo que cambió.
 * Se puede llamar las veces que haga falta.
 */
export async function anunciarOrden(sb: SupabaseClient, ordenId: string, panolPedido: string | null): Promise<ResultadoAnuncio> {
  if (panolPedido !== null && !UUID.test(panolPedido)) return { ok: false, error: "Pañol no válido." };
  if ((await modoDeRecepcion(sb)) !== "pagnol") {
    return { ok: false, error: "Esta empresa recibe en Valar: la recepción de las OC no se hace en Pagnol." };
  }

  const leida = await leerOrden(sb, ordenId);
  if (!leida) return { ok: false, error: "No se encontró la orden, o tu acceso no la alcanza." };
  const { orden, items } = leida;
  if (orden.estado === "borrador") return { ok: false, error: "Un borrador no se anuncia: primero se envía al proveedor." };
  if (orden.estado === "anulada") return { ok: false, error: "La orden está anulada." };

  const avisos: string[] = [];
  const deLaOrden = items.filter((i) => i.pagnol_material_id);
  const sinCatalogo = items.length - deLaOrden.length;
  if (sinCatalogo > 0) avisos.push(`${sinCatalogo} ${sinCatalogo === 1 ? "línea no es" : "líneas no son"} del catálogo de Pagnol y no se anuncian.`);
  if (deLaOrden.length === 0) return { ok: false, error: "Ninguna línea de la orden es del catálogo de Pagnol." };

  const previa = await filaDe(sb, ordenId);
  const yaAnunciada = !!previa?.pagnol_compra_id && previa.estado !== "error";

  /* La primera vez, lo que ya se recibió en Valar no se pide de nuevo a Pagnol:
     el pañolero lo recibiría otra vez y la línea quedaría contada dos veces. Una
     vez anunciada, lo recibido ya es el de Pagnol y la cantidad es la de la orden. */
  const lineas: LineaAnunciada[] = deLaOrden
    .map((i) => ({
      item_id: i.id,
      external_ref: refDeLinea(orden.id, i.id),
      cantidad: Number(i.cantidad) - Number(i.cantidad_cerrada) - (yaAnunciada ? 0 : Number(i.cantidad_recibida)),
    }))
    .filter((l) => l.cantidad > 0);
  if (lineas.length === 0) {
    return { ok: false, error: "Todo lo enlazado ya se recibió en Valar o está cerrado: no queda nada que Pagnol espere." };
  }
  const yaRecibidoEnValar = !yaAnunciada && deLaOrden.some((i) => Number(i.cantidad_recibida) > 0);
  if (yaRecibidoEnValar) avisos.push("Parte de la orden ya se recibió en Valar: a Pagnol solo se anuncia lo que falta.");

  const panolId = panolPedido ?? previa?.panol_id ?? (await panolHabitual(sb, orden.contrato_id));
  if (!panolId) return { ok: false, error: "Elige el pañol de Pagnol donde va a llegar esta orden." };

  if (previa?.pagnol_compra_id && previa.estado !== "error") {
    if (previa.estado === "cancelada") return { ok: false, error: "Esta orden ya se canceló en Pagnol." };
    return corregir(sb, orden, items, lineas, previa, panolId, avisos);
  }
  return anunciar(sb, orden, items, lineas, previa, panolId, avisos);
}

async function anunciar(sb: SupabaseClient, orden: Orden, items: ItemOrden[], lineas: LineaAnunciada[], previa: Fila | null, panolId: string, avisos: string[]): Promise<ResultadoAnuncio> {
  // Anotado antes de mandar. Un reintento conserva la misma llave.
  const { data: fila, error: errFila } = previa
    ? await sb.from("ordenes_pagnol").update({ panol_id: panolId, lineas, fecha_estimada: orden.fecha_requerida, estado: "pendiente" }).eq("orden_id", orden.id).select("idempotency_key").single()
    : await sb
        .from("ordenes_pagnol")
        .insert({ orden_id: orden.id, contrato_id: orden.contrato_id, panol_id: panolId, lineas, fecha_estimada: orden.fecha_requerida })
        .select("idempotency_key")
        .single();
  if (errFila) return { ok: false, error: errFila.message };

  const proveedorId = await proveedorEnPagnol(sb, orden.proveedor_id);
  const precio = new Map(items.map((i) => [i.id, Number(i.precio_unitario)]));
  const material = new Map(items.map((i) => [i.id, i.pagnol_material_id as string]));
  const cuerpo = {
    external_ref: `valar:oc:${orden.id}`,
    ...(proveedorId ? { proveedor_id: proveedorId } : {}),
    panol_id: panolId,
    fecha_estimada: orden.fecha_requerida,
    contrato_ref: orden.contrato_id,
    lineas: lineas.map((l) => ({
      external_ref: l.external_ref,
      material_id: material.get(l.item_id)!,
      cantidad: l.cantidad,
      valor_unitario: precio.get(l.item_id) ?? null,
    })),
  };

  let respuesta: Awaited<ReturnType<typeof llamarPagnol>>;
  try {
    respuesta = await llamarPagnol("POST", "/compras-esperadas", cuerpo, fila.idempotency_key as string);
  } catch (e) {
    const error = mensajeEscritura(null, undefined, e);
    await sb.from("ordenes_pagnol").update({ estado: "error", error }).eq("orden_id", orden.id);
    return { ok: false, error };
  }

  const bien = respuesta.estado === 200 || respuesta.estado === 201;
  const compraId = (respuesta.json as { id?: string } | undefined)?.id ?? null;
  if (!bien || !compraId) {
    const error = motivoDeRechazo(respuesta.estado, respuesta.json);
    await sb.from("ordenes_pagnol").update({ estado: "error", error }).eq("orden_id", orden.id);
    return { ok: false, error };
  }
  await sb
    .from("ordenes_pagnol")
    .update({ estado: "anunciada", pagnol_compra_id: compraId, error: null, anunciada_en: new Date().toISOString() })
    .eq("orden_id", orden.id);
  return { ok: true, anuncio: await anuncioDeOrden(sb, orden.id), avisos };
}

/** La OC ya está en Pagnol: se le manda solo lo que cambió. */
async function corregir(sb: SupabaseClient, orden: Orden, items: ItemOrden[], lineas: LineaAnunciada[], previa: Fila, panolId: string, avisos: string[]): Promise<ResultadoAnuncio> {
  const antes = new Map(previa.lineas.map((l) => [l.external_ref, l]));
  const ahora = new Map(lineas.map((l) => [l.external_ref, l]));

  const nuevas = lineas.filter((l) => !antes.has(l.external_ref));
  if (nuevas.length > 0) {
    const nombres = nuevas.map((l) => items.find((i) => i.id === l.item_id)?.descripcion ?? l.item_id).slice(0, 3).join(", ");
    return { ok: false, error: `Pagnol no permite agregar líneas a una compra ya anunciada (${nombres}). Anula esas líneas aquí, o emite una OC aparte.` };
  }

  const cambios: { external_ref: string; cantidad?: number; cancelar?: true }[] = [];
  for (const [ref, antigua] of antes) {
    const actual = ahora.get(ref);
    if (!actual) cambios.push({ external_ref: ref, cancelar: true });
    else if (actual.cantidad !== antigua.cantidad) cambios.push({ external_ref: ref, cantidad: actual.cantidad });
  }

  const cuerpo: Record<string, unknown> = {};
  if (panolId !== previa.panol_id) cuerpo.panol_id = panolId;
  if ((orden.fecha_requerida ?? null) !== (previa.fecha_estimada ?? null)) cuerpo.fecha_estimada = orden.fecha_requerida;
  if (cambios.length > 0) cuerpo.lineas = cambios;
  if (Object.keys(cuerpo).length === 0) return { ok: true, anuncio: await anuncioDeOrden(sb, orden.id), avisos: [...avisos, "Pagnol ya tiene la orden al día."] };

  let respuesta: Awaited<ReturnType<typeof llamarPagnol>>;
  try {
    respuesta = await llamarPagnol("PATCH", `/compras-esperadas/${previa.pagnol_compra_id}`, cuerpo, crypto.randomUUID());
  } catch (e) {
    return { ok: false, error: mensajeEscritura(null, undefined, e) };
  }
  if (respuesta.estado < 200 || respuesta.estado >= 300) return { ok: false, error: motivoDeRechazo(respuesta.estado, respuesta.json) };

  await sb
    .from("ordenes_pagnol")
    .update({ panol_id: panolId, lineas, fecha_estimada: orden.fecha_requerida, error: null })
    .eq("orden_id", orden.id);
  return { ok: true, anuncio: await anuncioDeOrden(sb, orden.id), avisos };
}

/** La OC se anuló: se cancela la compra en Pagnol (lo ya recibido se queda). */
export async function cancelarOrdenEnPagnol(sb: SupabaseClient, ordenId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const fila = await filaDe(sb, ordenId);
  if (!fila || !fila.pagnol_compra_id || fila.estado === "cancelada") return { ok: true }; // nada que cancelar
  let respuesta: Awaited<ReturnType<typeof llamarPagnol>>;
  try {
    respuesta = await llamarPagnol("PATCH", `/compras-esperadas/${fila.pagnol_compra_id}`, { cancelar: true }, crypto.randomUUID());
  } catch (e) {
    return { ok: false, error: mensajeEscritura(null, undefined, e) };
  }
  if (respuesta.estado < 200 || respuesta.estado >= 300) return { ok: false, error: motivoDeRechazo(respuesta.estado, respuesta.json) };
  const { error } = await sb.from("ordenes_pagnol").update({ estado: "cancelada", error: null }).eq("orden_id", ordenId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
