"use client";

import { traerTodo } from "../paginar";
import { supabase } from "../supabase";

/* ── Avance por ítem ──────────────────────────────────────────────────────── */

export type EstadoItem =
  | "pendiente"
  | "cotizado"
  | "comprado-parcial"
  | "comprado"
  | "recibido";

export const nombreEstadoItem: Record<EstadoItem, string> = {
  pendiente: "Pendiente",
  cotizado: "Cotizado",
  "comprado-parcial": "Comprado en parte",
  comprado: "Comprado",
  recibido: "Recibido",
};

export type AvanceItem = {
  id: string;
  linea: number;
  descripcion: string;
  unidad: string;
  cantidadPedida: number;
  cantidadComprada: number;
  cantidadRecibida: number;
  cantidadPendiente: number;
  compradoNeto: number;
  ordenes: number;
  estado: EstadoItem;
};

/**
 * Cuánto va de cada ítem pedido.
 *
 * El estado vive por ítem y no por documento: una solicitud puede tener un ítem
 * recibido, otro comprado y otro esperando cotización, y las tres cosas son
 * ciertas al mismo tiempo. Nada de esto se guarda: se deduce de las órdenes.
 */
export async function cargarAvanceDeSolped(solpedId: string): Promise<AvanceItem[]> {
  const { data, error } = await supabase
    .from("solped_items_avance")
    .select("*")
    .eq("solped_id", solpedId)
    .order("linea");

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    linea: Number(f.linea),
    descripcion: f.descripcion as string,
    unidad: f.unidad as string,
    cantidadPedida: Number(f.cantidad_pedida),
    cantidadComprada: Number(f.cantidad_comprada),
    cantidadRecibida: Number(f.cantidad_recibida),
    cantidadPendiente: Number(f.cantidad_pendiente),
    compradoNeto: Number(f.comprado_neto),
    ordenes: Number(f.ordenes),
    estado: f.estado as EstadoItem,
  }));
}

/**
 * Cuántos ítems le faltan por comprar a cada solicitud (por id de solicitud).
 * Solo salen las que tienen alguno pendiente.
 */
export async function cargarPendientesPorSolped(): Promise<Record<string, number>> {
  // Una fila por ítem pendiente: pasa de 1000 con facilidad, y contar de menos
  // escondería el aviso «Faltan ítems por comprar».
  const data = await traerTodo<{ solped_id: string }>(
    (desde, hasta) =>
      supabase
        .from("solped_items_avance")
        .select("solped_id")
        .gt("cantidad_pendiente", 0)
        .order("solped_id")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: { solped_id: string }[] | null; error: { message: string } | null }>,
  );
  const cuenta: Record<string, number> = {};
  for (const f of data) cuenta[f.solped_id] = (cuenta[f.solped_id] ?? 0) + 1;
  return cuenta;
}

