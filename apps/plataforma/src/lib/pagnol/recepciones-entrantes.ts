import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fase 5 · B: lo que el pañolero recibe en Pagnol llega a Valar por webhook.
 *
 *   compra.recibida             → una línea recibida en una recepción
 *   compra.recepcion_corregida  → "esto no venía": se quitó cantidad de una recepción
 *
 * Valar registra la recepción para el costo y la facturación y NO escribe stock:
 * Pagnol ya lo hizo (la recepción de Pagnol no se informa de vuelta). Las
 * cantidades de la línea se recalculan solas con los triggers de
 * `recepcion_items` (0051), así que una corrección que baja lo recibido reabre
 * la OC si estaba recibida o cerrada.
 *
 * Una recepción de Pagnol trae una línea por evento, todas con el mismo
 * `recepcion_id`: caen en una sola fila de `recepciones`. Cada evento fija la
 * cantidad de SU línea (no la suma), así que un reenvío no la duplica.
 *
 * Corre con la clave de servicio: no hay sesión de ninguna persona.
 */

export type ResultadoEntrante = { ok: true; detalle: string } | { ok: false; error: string; permanente: boolean };

type Linea = { id?: string; external_ref?: string; cantidad_recibida_ahora?: number; cantidad_recibida_acumulada?: number; cantidad_quitada?: number };

type DatosRecibida = {
  compra_external_ref?: string;
  recepcion_id?: string;
  guia_despacho?: string;
  fecha_recepcion?: string;
  recibido_por?: { nombre?: string };
  panol?: { id?: string };
  linea?: Linea;
};

type DatosCorregida = {
  compra_external_ref?: string;
  recepcion_id?: string;
  correccion_id?: string;
  motivo?: string;
  corregido_por?: { nombre?: string };
  linea?: Linea;
};

const REF_COMPRA = /^valar:oc:([^:]+)$/;
const REF_LINEA = /^valar:oc:([^:]+):item:([^:]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const permanente = (error: string): ResultadoEntrante => ({ ok: false, error, permanente: true });
const transitorio = (error: string): ResultadoEntrante => ({ ok: false, error, permanente: false });

/** ¿La referencia es de una OC de Valar? Las demás compras no son de este módulo. */
function ubicar(compraRef: string | undefined, lineaRef: string | undefined) {
  const orden = compraRef ? REF_COMPRA.exec(compraRef)?.[1] : undefined;
  const linea = lineaRef ? REF_LINEA.exec(lineaRef) : null;
  if (!orden || !linea || linea[1] !== orden) return null;
  return { ordenId: orden, itemId: linea[2] };
}

async function ordenYLinea(sb: SupabaseClient, empresa: string, ordenId: string, itemId: string) {
  const { data: orden } = await sb.from("ordenes_compra_proveedor").select("id").eq("empresa_id", empresa).eq("id", ordenId).maybeSingle();
  if (!orden) return null;
  const { data: item } = await sb.from("items_compra").select("id").eq("empresa_id", empresa).eq("orden_id", ordenId).eq("id", itemId).maybeSingle();
  return item ? { ordenId, itemId } : null;
}

export async function registrarCompraRecibida(sb: SupabaseClient, empresa: string, d: DatosRecibida): Promise<ResultadoEntrante> {
  const donde = ubicar(d.compra_external_ref, d.linea?.external_ref);
  if (!donde) return { ok: true, detalle: "Ignorado: no es una línea de una OC de Valar." };
  const ahora = Number(d.linea?.cantidad_recibida_ahora);
  if (!d.recepcion_id || !UUID.test(d.recepcion_id) || !(ahora > 0)) return permanente("El aviso no trae la recepción o la cantidad.");

  const ubicada = await ordenYLinea(sb, empresa, donde.ordenId, donde.itemId);
  if (!ubicada) return permanente(`No existe la línea ${donde.itemId} de la OC ${donde.ordenId} en esta empresa.`);

  // La recepción de Pagnol: una fila, aunque lleguen varias líneas.
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(d.fecha_recepcion ?? "") ? (d.fecha_recepcion as string).slice(0, 10) : new Date().toISOString().slice(0, 10);
  let recepcionId: string | null = null;
  {
    const { data } = await sb.from("recepciones").select("id").eq("empresa_id", empresa).eq("pagnol_recepcion_id", d.recepcion_id).maybeSingle();
    recepcionId = (data?.id as string | undefined) ?? null;
  }
  if (!recepcionId) {
    const { data, error } = await sb
      .from("recepciones")
      .insert({
        empresa_id: empresa,
        orden_id: donde.ordenId,
        contrato_id: "", // lo copia la base desde la orden
        fecha,
        guia_despacho: d.guia_despacho?.trim() || null,
        recibido_por: d.recibido_por?.nombre?.trim() || null,
        observaciones: "Recibida en Pagnol",
        origen: "pagnol",
        pagnol_recepcion_id: d.recepcion_id,
        pagnol_panol_id: d.panol?.id && UUID.test(d.panol.id) ? d.panol.id : null,
      })
      .select("id")
      .single();
    if (error?.code === "23505") {
      // Otra línea del mismo aviso se nos adelantó: se usa la que creó.
      const { data: ya } = await sb.from("recepciones").select("id").eq("empresa_id", empresa).eq("pagnol_recepcion_id", d.recepcion_id).single();
      recepcionId = ya?.id as string;
    } else if (error) {
      return transitorio(error.message);
    } else {
      recepcionId = data.id as string;
    }
  }

  const { data: existente } = await sb
    .from("recepcion_items")
    .select("id")
    .eq("empresa_id", empresa)
    .eq("recepcion_id", recepcionId)
    .eq("item_id", donde.itemId)
    .maybeSingle();
  const { error } = existente
    ? await sb.from("recepcion_items").update({ cantidad: ahora }).eq("empresa_id", empresa).eq("id", existente.id)
    : await sb.from("recepcion_items").insert({ empresa_id: empresa, recepcion_id: recepcionId, item_id: donde.itemId, contrato_id: "", cantidad: ahora });
  if (error) {
    // Recibir más de lo pedido es una regla de la base: reintentar no lo arregla.
    return error.code === "23514" ? permanente(error.message) : transitorio(error.message);
  }
  return { ok: true, detalle: `Recepción registrada: ${ahora} de ${donde.itemId} (OC ${donde.ordenId}).` };
}

export async function registrarCorreccion(sb: SupabaseClient, empresa: string, d: DatosCorregida): Promise<ResultadoEntrante> {
  const donde = ubicar(d.compra_external_ref, d.linea?.external_ref);
  if (!donde) return { ok: true, detalle: "Ignorado: no es una línea de una OC de Valar." };
  const quitada = Number(d.linea?.cantidad_quitada);
  if (!d.recepcion_id || !UUID.test(d.recepcion_id) || !d.correccion_id || !UUID.test(d.correccion_id) || !(quitada > 0)) {
    return permanente("El aviso de corrección no trae la recepción, la corrección o la cantidad.");
  }

  const { data: recepcion } = await sb.from("recepciones").select("id").eq("empresa_id", empresa).eq("pagnol_recepcion_id", d.recepcion_id).maybeSingle();
  if (!recepcion) return permanente(`La recepción ${d.recepcion_id} no está registrada en Valar: no hay nada que descontar.`);
  const { data: fila } = await sb
    .from("recepcion_items")
    .select("id, cantidad")
    .eq("empresa_id", empresa)
    .eq("recepcion_id", recepcion.id)
    .eq("item_id", donde.itemId)
    .maybeSingle();
  if (!fila) return permanente(`La línea ${donde.itemId} no figura en esa recepción.`);

  // Se anota primero: una corrección ya aplicada no se aplica dos veces.
  const { error: errAnota } = await sb.from("recepciones_pagnol_correcciones").insert({
    empresa_id: empresa,
    correccion_id: d.correccion_id,
    recepcion_id: recepcion.id,
    item_id: donde.itemId,
    cantidad_quitada: quitada,
    motivo: d.motivo?.slice(0, 500) ?? null,
    corregido_por: d.corregido_por?.nombre ?? null,
  });
  if (errAnota?.code === "23505") return { ok: true, detalle: "Corrección ya aplicada." };
  if (errAnota) return transitorio(errAnota.message);

  const queda = Math.max(0, Number(fila.cantidad) - quitada);
  const { error } = queda > 0
    ? await sb.from("recepcion_items").update({ cantidad: queda }).eq("empresa_id", empresa).eq("id", fila.id)
    : await sb.from("recepcion_items").delete().eq("empresa_id", empresa).eq("id", fila.id);
  if (error) {
    await sb.from("recepciones_pagnol_correcciones").delete().eq("empresa_id", empresa).eq("correccion_id", d.correccion_id);
    return transitorio(error.message);
  }

  // Una recepción sin ninguna línea no dice nada: se retira.
  const { count } = await sb.from("recepcion_items").select("id", { count: "exact", head: true }).eq("empresa_id", empresa).eq("recepcion_id", recepcion.id);
  if (count === 0) await sb.from("recepciones").delete().eq("empresa_id", empresa).eq("id", recepcion.id);

  return { ok: true, detalle: `Corrección aplicada: −${quitada} de ${donde.itemId} (OC ${donde.ordenId}).` };
}
