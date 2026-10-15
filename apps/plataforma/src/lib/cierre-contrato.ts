"use client";

import { supabase } from "./supabase";
import { cargarFiniquitos, type Finiquito } from "./finiquitos";
import { cargarCategorias, type Categoria } from "./categorias";
import { cargarContratosBreve, type ContratoBreve } from "./contratos";
import { actualizar } from "./crud";

/**
 * Cierre económico de un contrato.
 *
 *   ingresos     lo vendido (estados de pago netos), todos los meses
 *   costos       el costo ordinario acumulado, el mismo del Dashboard
 *   finiquitos   lo pagado al terminar la relación laboral con su gente
 *   resultado    ingresos − costos − finiquitos
 *
 * Los finiquitos NO entran al costo mensual: acá, y solo acá, se restan.
 * Los reembolsables se le cobran al mandante y van aparte.
 */

export type MesCierre = { periodo: string; venta: number; costo: number };

export type DatosCierre = {
  ingresos: number;
  costos: number;
  reembolsable: number;
  finiquitos: number;
  resultado: number;
  /** Sobre los ingresos. Nulo si no hubo ventas. */
  rentabilidadPct: number | null;
  meses: MesCierre[];
  listaFiniquitos: Finiquito[];
  contratos: ContratoBreve[];
  categorias: Categoria[];
};

export async function cargarCierre(contratoId: string): Promise<DatosCierre> {
  const [resultado, finiquitos, contratos, categorias] = await Promise.all([
    supabase.from("resultado_por_anexo").select("periodo, venta, costo, reembolsable").eq("contrato_id", contratoId),
    cargarFiniquitos("contratos"),
    cargarContratosBreve(),
    cargarCategorias(),
  ]);
  if (resultado.error) throw new Error(resultado.error.message);

  const porMes = new Map<string, MesCierre>();
  let reembolsable = 0;
  for (const r of resultado.data ?? []) {
    reembolsable += Number(r.reembolsable ?? 0);
    if (!r.periodo) continue;
    const periodo = `${String(r.periodo).slice(0, 7)}-01`;
    const m = porMes.get(periodo) ?? { periodo, venta: 0, costo: 0 };
    m.venta += Number(r.venta ?? 0);
    m.costo += Number(r.costo ?? 0);
    porMes.set(periodo, m);
  }
  const meses = [...porMes.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const ingresos = meses.reduce((t, m) => t + m.venta, 0);
  const costos = meses.reduce((t, m) => t + m.costo, 0);

  const listaFiniquitos = finiquitos.filter((f) => f.contratoId === contratoId);
  const totalFiniquitos = listaFiniquitos.reduce((t, f) => t + f.total, 0);
  const res = ingresos - costos - totalFiniquitos;

  return {
    ingresos,
    costos,
    reembolsable,
    finiquitos: totalFiniquitos,
    resultado: res,
    rentabilidadPct: ingresos > 0 ? Math.round((res / ingresos) * 1000) / 10 : null,
    meses,
    listaFiniquitos,
    contratos,
    categorias,
  };
}

/** Pasa el contrato a la vista de cerrados. No toca ningún movimiento. */
export function cerrarContrato(id: string, fecha: string, observaciones: string) {
  return actualizar("contratos", id, {
    estado: "cerrado",
    cerrado_en: fecha,
    cierre_observaciones: observaciones.trim() || null,
  });
}

export function guardarObservacionesCierre(id: string, observaciones: string) {
  return actualizar("contratos", id, { cierre_observaciones: observaciones.trim() || null });
}

/** Vuelve a los vigentes: su vigencia se recalcula con las fechas. */
export function reabrirContrato(id: string) {
  return actualizar("contratos", id, { estado: "activo", cerrado_en: null });
}
