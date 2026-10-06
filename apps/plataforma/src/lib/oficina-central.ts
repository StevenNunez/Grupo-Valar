"use client";

import { detalleDeOtrosHaberes, type Haberes } from "./haberes";
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

/* ── Personal de Oficina Central ──────────────────────────────────────────── */

/**
 * La nómina de un mes del personal de Oficina Central. Es la misma ficha que
 * el personal de un contrato (`Haberes`, migración 0052): un registro por mes
 * con los totales, y el PDF de la nómina adjunto. `horas_extra_cantidad`,
 * `total_haberes` y `costo_total` los calcula la base.
 */
export type NominaOficina = Haberes & {
  id: string;
  /** ISO del primer día del mes: "2026-09-01". */
  periodo: string;
  dotacion: number;
  horas_hombre: number;
  horas_extra_cantidad: number;
  total_haberes: number;
  costo_total: number;
  observaciones: string | null;
};

const NUMERICAS = [
  "dotacion", "horas_hombre",
  "sueldo_bruto", "hh_reemplazo", "hh_parada_planta", "hh_feriado_compensado", "hh_apoyo_oficina", "hh_otras",
  "monto_hh_reemplazo", "monto_hh_parada_planta", "monto_hh_feriado_compensado", "monto_hh_apoyo_oficina", "monto_hh_otras",
  "horas_extra_monto", "total_no_imponible", "otros_haberes", "leyes_sociales",
  "horas_extra_cantidad", "total_haberes", "costo_total",
] as const;

export async function cargarNominasOficina(): Promise<NominaOficina[]> {
  const { data, error } = await supabase
    .from("nominas_oficina_central")
    .select(`id, periodo, observaciones, otros_haberes_detalle, ${NUMERICAS.join(", ")}`)
    .order("periodo", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((n) => ({
    id: n.id as string,
    periodo: n.periodo as string,
    observaciones: (n.observaciones as string | null) ?? null,
    // Numeric de Postgres llega como texto: se convierte una vez acá.
    ...(Object.fromEntries(NUMERICAS.map((k) => [k, Number(n[k] ?? 0)])) as Record<(typeof NUMERICAS)[number], number>),
    otros_haberes_detalle: detalleDeOtrosHaberes(n.otros_haberes_detalle, Number(n.otros_haberes ?? 0)),
  }));
}
