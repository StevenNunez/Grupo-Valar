"use client";

import { supabase } from "./supabase";
import { diasHastaFecha } from "./formato";

/**
 * Garantías pagadas a proveedores (0079).
 *
 * Un depósito en garantía sale de la caja pero no es un gasto: se devuelve. Por
 * eso tiene su propio registro y su propio ciclo, y no entra en ninguna vista
 * de costo:
 *
 *   pagada → pendiente de devolución → devuelta
 */

export type EstadoGarantia = "pagada" | "por_devolver" | "devuelta";

export const estadosGarantia: { id: EstadoGarantia; titulo: string }[] = [
  { id: "pagada", titulo: "Pagada" },
  { id: "por_devolver", titulo: "Pendiente de devolución" },
  { id: "devuelta", titulo: "Devuelta" },
];

export type Garantia = {
  id: string;
  /** Nulo = Oficina Central. */
  contratoId: string | null;
  anexoId: string | null;
  proveedorId: string | null;
  proveedor: string;
  concepto: string;
  monto: number;
  fechaPago: string;
  documento: string | null;
  devolucionEsperada: string | null;
  estado: EstadoGarantia;
  fechaDevolucion: string | null;
  /** Lo que volvió; menos que el monto si el proveedor retuvo algo. */
  montoDevuelto: number;
  observaciones: string | null;
};

/** Sigue en poder del proveedor: pagada o pendiente de devolución. */
export const abierta = (g: Garantia) => g.estado !== "devuelta";

/** Abierta y con la fecha de devolución ya cumplida. */
export const vencida = (g: Garantia) =>
  abierta(g) && !!g.devolucionEsperada && diasHastaFecha(g.devolucionEsperada) < 0;

export async function cargarGarantias(): Promise<Garantia[]> {
  const { data, error } = await supabase
    .from("garantias")
    .select("*")
    .order("fecha_pago", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    contratoId: (f.contrato_id as string | null) ?? null,
    anexoId: (f.anexo_id as string | null) ?? null,
    proveedorId: (f.proveedor_id as string | null) ?? null,
    proveedor: f.proveedor as string,
    concepto: f.concepto as string,
    monto: Number(f.monto),
    fechaPago: f.fecha_pago as string,
    documento: (f.documento as string | null) ?? null,
    devolucionEsperada: (f.devolucion_esperada as string | null) ?? null,
    estado: f.estado as EstadoGarantia,
    fechaDevolucion: (f.fecha_devolucion as string | null) ?? null,
    montoDevuelto: Number(f.monto_devuelto ?? 0),
    observaciones: (f.observaciones as string | null) ?? null,
  }));
}
