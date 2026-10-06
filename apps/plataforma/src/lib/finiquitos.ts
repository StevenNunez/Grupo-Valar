"use client";

import { supabase } from "./supabase";

/**
 * Finiquitos (0063): un registro por trabajador, en el mes en que se paga.
 *
 * No va dentro de la nómina del mes porque es otra cosa —un pago único al
 * terminar la relación laboral, con su propio documento firmado— pero sí suma
 * a lo que se gastó en personal ese mes. Con contrato, entra a su costo de
 * personal, al Dashboard y al resultado por anexo; sin contrato, es de Oficina
 * Central.
 */

export type CausalFiniquito =
  | "renuncia"
  | "mutuo_acuerdo"
  | "vencimiento_plazo"
  | "termino_obra"
  | "necesidades_empresa"
  | "despido_otra_causal"
  | "otro";

export const causalesFiniquito: { id: CausalFiniquito; titulo: string }[] = [
  { id: "termino_obra", titulo: "Término de obra o faena (art. 159 N°5)" },
  { id: "vencimiento_plazo", titulo: "Vencimiento del plazo (art. 159 N°4)" },
  { id: "renuncia", titulo: "Renuncia (art. 159 N°2)" },
  { id: "mutuo_acuerdo", titulo: "Mutuo acuerdo (art. 159 N°1)" },
  { id: "necesidades_empresa", titulo: "Necesidades de la empresa (art. 161)" },
  { id: "despido_otra_causal", titulo: "Despido por otra causal (art. 160)" },
  { id: "otro", titulo: "Otra" },
];

export type Finiquito = {
  id: string;
  /** Nulo = Oficina Central. */
  contratoId: string | null;
  anexoId: string | null;
  categoriaId: string | null;
  /** Primer día del mes en que se paga. */
  periodo: string;
  fechaPago: string | null;
  trabajador: string;
  rut: string | null;
  cargo: string | null;
  causal: CausalFiniquito | null;
  indemnizacionAnios: number;
  indemnizacionAviso: number;
  feriadoProporcional: number;
  otrosMontos: number;
  /** La suma de los cuatro. La calcula la base. */
  total: number;
  /** Firmó con reserva de derechos: puede reclamar lo reservado (0065). */
  conReserva: boolean;
  reservaDetalle: string | null;
  observaciones: string | null;
};

/** Los de los contratos o los de Oficina Central. */
export async function cargarFiniquitos(de: "contratos" | "oficina"): Promise<Finiquito[]> {
  let consulta = supabase
    .from("finiquitos")
    .select(
      "id, contrato_id, anexo_id, categoria_id, periodo, fecha_pago, trabajador, rut, cargo, causal, " +
        "indemnizacion_anios, indemnizacion_aviso, feriado_proporcional, otros_montos, total, con_reserva, reserva_detalle, observaciones",
    )
    .order("periodo", { ascending: false })
    .order("trabajador");
  consulta = de === "oficina" ? consulta.is("contrato_id", null) : consulta.not("contrato_id", "is", null);

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    contratoId: (f.contrato_id as string | null) ?? null,
    anexoId: (f.anexo_id as string | null) ?? null,
    categoriaId: (f.categoria_id as string | null) ?? null,
    periodo: f.periodo as string,
    fechaPago: (f.fecha_pago as string | null) ?? null,
    trabajador: f.trabajador as string,
    rut: (f.rut as string | null) ?? null,
    cargo: (f.cargo as string | null) ?? null,
    causal: (f.causal as CausalFiniquito | null) ?? null,
    indemnizacionAnios: Number(f.indemnizacion_anios ?? 0),
    indemnizacionAviso: Number(f.indemnizacion_aviso ?? 0),
    feriadoProporcional: Number(f.feriado_proporcional ?? 0),
    otrosMontos: Number(f.otros_montos ?? 0),
    total: Number(f.total ?? 0),
    conReserva: f.con_reserva === true,
    reservaDetalle: (f.reserva_detalle as string | null) ?? null,
    observaciones: (f.observaciones as string | null) ?? null,
  }));
}
