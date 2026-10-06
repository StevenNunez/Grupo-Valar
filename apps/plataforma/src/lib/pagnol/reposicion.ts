import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clientePagnol } from "./client";

/**
 * Fase 4 del contrato con Pagnol: stock bajo el mínimo → borrador de solicitud.
 *
 * Reglas del usuario (06-10-2026):
 *   · el borrador va al contrato del PAÑOL donde bajó el stock
 *     (`pagnol_panoles_contratos`); pañol sin asociar → queda en la bandeja;
 *   · UN borrador de reposición abierto por contrato: cada aviso es una línea
 *     y el mismo material no se repite (se actualiza su cantidad);
 *   · cantidad sugerida = lo que falta para llegar al DOBLE del mínimo.
 *
 * Corre con la clave de servicio (el aviso no trae la sesión de nadie), así que
 * todo lo que inserta lleva `empresa_id` explícito: sin sesión, el valor por
 * defecto de la base (`empresa_actual()`) sería nulo.
 */

type DatosAviso = {
  material_id?: string;
  nombre?: string;
  unidad_medida?: string;
  stock_actual?: number | null;
  stock_minimo?: number | null;
  panol?: { id: string; nombre: string } | null;
  panol_id?: string | null;
};

export type FilaAviso = {
  webhook_id: string;
  empresa_id: string | null;
  payload: { data?: DatosAviso; created_at?: string };
};

const SOLICITANTE = "Reposición automática (Pagnol)";

/** Lo que falta para llegar al doble del mínimo; al menos 1. Entero hacia arriba. */
export function cantidadSugerida(actual: number, minimo: number) {
  return Math.max(1, Math.ceil(minimo * 2 - actual));
}

/** Nombre y unidad del material: del aviso si vienen, si no del catálogo. */
async function datosDelMaterial(d: DatosAviso) {
  if (d.nombre && d.unidad_medida) return { nombre: d.nombre, unidad: d.unidad_medida };
  const { data } = await clientePagnol("pagnol:materiales").GET("/materiales/{id}", { params: { path: { id: d.material_id! } } });
  return { nombre: d.nombre ?? data?.nombre ?? "Material de Pagnol", unidad: d.unidad_medida ?? data?.unidad_medida ?? "un" };
}

async function siguienteNumero(sb: SupabaseClient, empresa: string) {
  const { data } = await sb.from("solped").select("numero").eq("empresa_id", empresa);
  const numeros = (data ?? []).map((s) => Number(/(\d+)\s*$/.exec(s.numero as string)?.[1] ?? 0)).filter((n) => n > 0);
  return `SOLPED-${String((numeros.length ? Math.max(...numeros) : 0) + 1).padStart(3, "0")}`;
}

/**
 * Procesa un aviso de stock bajo. Devuelve null si quedó en una solicitud, o
 * el motivo por el que queda en la bandeja. Se puede repetir: el material no
 * se duplica en el borrador.
 */
export async function procesarAvisoDeStock(sb: SupabaseClient, aviso: FilaAviso): Promise<string | null> {
  const d = aviso.payload.data ?? {};
  const empresa = aviso.empresa_id;
  if (!empresa) return "El aviso es de una organización de Pagnol que no está enlazada a ninguna empresa de Valar.";
  if (!d.material_id) return "El aviso no indica el material.";
  const panolId = d.panol?.id ?? d.panol_id ?? null;
  if (!panolId) return "El aviso no indica en qué pañol bajó el stock.";

  const { data: asociacion } = await sb
    .from("pagnol_panoles_contratos")
    .select("contrato_id")
    .eq("empresa_id", empresa)
    .eq("panol_id", panolId)
    .maybeSingle();
  if (!asociacion) return `El pañol «${d.panol?.nombre ?? panolId}» no tiene un contrato asignado.`;
  const contrato = asociacion.contrato_id as string;

  const actual = Number(d.stock_actual ?? 0);
  const minimo = Number(d.stock_minimo ?? 0);
  const cantidad = cantidadSugerida(actual, minimo);
  const material = await datosDelMaterial(d);
  const nota = `Stock en Pagnol: ${actual} (mínimo ${minimo})${d.panol?.nombre ? ` en ${d.panol.nombre}` : ""}.`;

  // El borrador de reposición abierto de ese contrato, o uno nuevo.
  let { data: solped } = await sb
    .from("solped")
    .select("id")
    .eq("empresa_id", empresa)
    .eq("contrato_id", contrato)
    .eq("origen", "pagnol")
    .eq("estado", "borrador")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!solped) {
    const numero = await siguienteNumero(sb, empresa);
    const id = `SP-${contrato.replace(/^C-/, "")}-${numero.replace(/\D/g, "")}`;
    const { error } = await sb.from("solped").insert({
      empresa_id: empresa,
      id,
      numero,
      contrato_id: contrato,
      solicitante_nombre: SOLICITANTE,
      origen: "pagnol",
      estado: "borrador",
      prioridad: "normal",
      observaciones: "Armada sola con los avisos de stock bajo de Pagnol. Revisa las cantidades y envíala a aprobación.",
    });
    if (error) return `No se pudo crear la solicitud: ${error.message}`;
    solped = { id };
  }

  const { data: lineas } = await sb.from("solped_items").select("id, linea, pagnol_material_id").eq("empresa_id", empresa).eq("solped_id", solped.id);
  const existente = (lineas ?? []).find((l) => l.pagnol_material_id === d.material_id);
  if (existente) {
    // Mismo material otra vez: se actualiza con el último stock, no se duplica.
    const { error } = await sb.from("solped_items").update({ cantidad, observacion: nota }).eq("empresa_id", empresa).eq("id", existente.id);
    if (error) return `No se pudo actualizar la línea: ${error.message}`;
  } else {
    const n = Math.max(0, ...(lineas ?? []).map((l) => Number(l.linea))) + 1;
    const { error } = await sb.from("solped_items").insert({
      empresa_id: empresa,
      id: `SPI-${solped.id}-${String(n).padStart(3, "0")}`,
      solped_id: solped.id,
      linea: n,
      descripcion: material.nombre,
      unidad: material.unidad,
      cantidad,
      pagnol_material_id: d.material_id,
      observacion: nota,
    });
    if (error) return `No se pudo agregar la línea: ${error.message}`;
  }
  return null;
}

/** Procesa un aviso y deja anotado el resultado en `pagnol_webhooks_recibidos`. */
export async function procesarYAnotar(sb: SupabaseClient, aviso: FilaAviso) {
  let motivo: string | null;
  try {
    motivo = await procesarAvisoDeStock(sb, aviso);
  } catch (e) {
    motivo = e instanceof Error ? e.message : String(e);
  }
  await sb
    .from("pagnol_webhooks_recibidos")
    .update(motivo ? { error: motivo } : { procesado_en: new Date().toISOString(), error: null })
    .eq("webhook_id", aviso.webhook_id);
  return motivo;
}

/** La bandeja de una empresa: los avisos de stock que quedaron sin solicitud. Se reintentan todos. */
export async function procesarPendientes(sb: SupabaseClient, empresa: string) {
  const { data } = await sb
    .from("pagnol_webhooks_recibidos")
    .select("webhook_id, empresa_id, payload")
    .eq("empresa_id", empresa)
    .eq("tipo", "stock.bajo_minimo")
    .is("procesado_en", null)
    .order("recibido_en");
  let listos = 0;
  for (const aviso of (data ?? []) as FilaAviso[]) if ((await procesarYAnotar(sb, aviso)) === null) listos += 1;
  return { revisados: data?.length ?? 0, listos };
}
