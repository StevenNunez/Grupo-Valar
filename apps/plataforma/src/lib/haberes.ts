/**
 * Los haberes de una nómina: los mismos para el personal de un contrato
 * (`costos_personal`) y para el de Oficina Central
 * (`nomina_oficina_trabajadores`). Los nombres son los de las columnas, iguales
 * en las dos tablas desde la 0050. La ficha que los pide es `FichaHaberes`.
 */

export type Haberes = {
  /** Sueldo base + gratificación: la remuneración imponible del mes. */
  sueldo_bruto: number;
  hh_reemplazo: number;
  hh_parada_planta: number;
  hh_feriado_compensado: number;
  hh_apoyo_oficina: number;
  hh_otras: number;
  /** Costo de las HH extra en pesos. No se deriva de las horas: el valor de la hora cambia mes a mes. */
  horas_extra_monto: number;
  total_no_imponible: number;
  otros_haberes: number;
  leyes_sociales: number;
};

export const haberesEnCero: Haberes = {
  sueldo_bruto: 0,
  hh_reemplazo: 0,
  hh_parada_planta: 0,
  hh_feriado_compensado: 0,
  hh_apoyo_oficina: 0,
  hh_otras: 0,
  horas_extra_monto: 0,
  total_no_imponible: 0,
  otros_haberes: 0,
  leyes_sociales: 0,
};

/** Los totales, igual que los calcula la base. */
export function totalesDe(h: Haberes) {
  const horasExtra = h.hh_reemplazo + h.hh_parada_planta + h.hh_feriado_compensado + h.hh_apoyo_oficina + h.hh_otras;
  const totalHaberes = h.sueldo_bruto + h.horas_extra_monto + h.total_no_imponible + h.otros_haberes;
  return { horasExtra, totalHaberes, costoTotal: totalHaberes + h.leyes_sociales };
}

/** Lo que no cuadra antes de guardar, o null. */
export function errorDeHaberes(h: Haberes): string | null {
  // Solo los montos de la ficha: el formulario que la usa trae además textos.
  const montos = (Object.keys(haberesEnCero) as (keyof Haberes)[]).map((k) => h[k]);
  if (montos.some((v) => !Number.isFinite(v) || v < 0)) {
    return "Los montos y las horas no pueden ser negativos.";
  }
  const { horasExtra } = totalesDe(h);
  if (horasExtra > 0 && h.horas_extra_monto === 0) {
    return "Hay horas extra sin su costo. Ingresa cuánto se pagó por ellas.";
  }
  return null;
}
