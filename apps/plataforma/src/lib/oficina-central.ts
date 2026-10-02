"use client";

import { supabase } from "./supabase";

export const categoriasOficina = [
  { id: "compras", titulo: "Compras" },
  { id: "arriendos", titulo: "Arriendos" },
  { id: "insumos", titulo: "Insumos" },
  { id: "activos", titulo: "Compra de activos" },
] as const;

export type CategoriaOficina = (typeof categoriasOficina)[number]["id"];
export type EstadoEgresoOficina = "pendiente" | "pagado";

export type EgresoOficina = {
  id: string;
  categoria: CategoriaOficina;
  fecha: string;
  proveedor: string;
  descripcion: string;
  documento: string | null;
  neto: number;
  iva: number;
  total: number;
  estado: EstadoEgresoOficina;
  observaciones: string | null;
};

export type DatosEgresoOficina = Omit<EgresoOficina, "id" | "total">;

export async function cargarEgresosOficina(): Promise<EgresoOficina[]> {
  const { data, error } = await supabase
    .from("egresos_oficina_central")
    .select("id, categoria, fecha, proveedor, descripcion, documento, neto, iva, total, estado, observaciones")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((fila) => ({
    ...fila,
    neto: Number(fila.neto),
    iva: Number(fila.iva),
    total: Number(fila.total),
  })) as EgresoOficina[];
}

export function totalOficina(filas: EgresoOficina[]) {
  return filas.reduce((total, fila) => total + fila.neto, 0);
}
