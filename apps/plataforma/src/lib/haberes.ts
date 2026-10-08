/**
 * Los haberes de una nómina: los mismos para el personal de un contrato
 * (`costos_personal`) y para el de Oficina Central
 * (`nominas_oficina_central`). Los nombres son los de las columnas, iguales
 * en las dos tablas desde la 0050. La ficha que los pide es `FichaHaberes`.
 */

/** Un "otro haber": qué es y cuánto (aguinaldo, bono de término, etc.). */
export type OtroHaber = { concepto: string; monto: number };

/** Lo que más se repite, para elegir rápido. Se puede escribir cualquier otro. */
export const conceptosOtrosHaberes = [
  "Aguinaldo fiestas patrias",
  "Aguinaldo navidad",
  "Bono de producción",
  "Bono de término de faena",
  "Bono de asistencia",
  "Asignación de herramientas",
  "Asignación de zona",
];

export type Haberes = {
  /** Sueldo base + gratificación: la remuneración imponible del mes. */
  sueldo_bruto: number;
  hh_reemplazo: number;
  hh_parada_planta: number;
  hh_feriado_compensado: number;
  hh_apoyo_oficina: number;
  hh_otras: number;
  /** Lo que se pagó por las HH extra de cada motivo, en pesos (0063). */
  monto_hh_reemplazo: number;
  monto_hh_parada_planta: number;
  monto_hh_feriado_compensado: number;
  monto_hh_apoyo_oficina: number;
  monto_hh_otras: number;
  /** Costo total de las HH extra: la suma de los cinco motivos. La recalcula la base. */
  horas_extra_monto: number;
  total_no_imponible: number;
  /** La suma de otros_haberes_detalle (0064). La recalcula la base. */
  otros_haberes: number;
  /** Qué son los otros haberes, uno por línea. */
  otros_haberes_detalle: OtroHaber[];
  /** Seguros y descuentos legales (pensión de alimentos, deudas retenidas por ley). No imposiciones ni anticipos. */
  descuento_trabajador: number;
  /** Imposiciones del trabajador (AFP, salud, cesantía): las "leyes sociales" de antes. Salen del bruto. */
  leyes_sociales: number;
  /** Lo que paga la empresa encima del bruto. */
  aporte_patronal: number;
};

export type HorasHh = "hh_reemplazo" | "hh_parada_planta" | "hh_feriado_compensado" | "hh_apoyo_oficina" | "hh_otras";
export type MontoHh =
  | "monto_hh_reemplazo"
  | "monto_hh_parada_planta"
  | "monto_hh_feriado_compensado"
  | "monto_hh_apoyo_oficina"
  | "monto_hh_otras";

/** Los motivos de HH extra, cada uno con sus horas y su costo. */
export const motivosHhExtra: { horas: HorasHh; monto: MontoHh; titulo: string; corto: string; ayuda?: string }[] = [
  { horas: "hh_reemplazo", monto: "monto_hh_reemplazo", titulo: "Reemplazo por vacaciones o licencias", corto: "Reemplazos" },
  { horas: "hh_parada_planta", monto: "monto_hh_parada_planta", titulo: "Parada de planta", corto: "Parada de planta" },
  { horas: "hh_feriado_compensado", monto: "monto_hh_feriado_compensado", titulo: "Feriado compensado", corto: "Feriado compensado" },
  { horas: "hh_apoyo_oficina", monto: "monto_hh_apoyo_oficina", titulo: "Apoyo oficina", corto: "Apoyo oficina" },
  {
    horas: "hh_otras",
    monto: "monto_hh_otras",
    titulo: "Otras",
    corto: "Otras",
    ayuda: "El resto de las horas extra. Acá va la diferencia si el total no calza con tu planilla.",
  },
];

export const haberesEnCero: Haberes = {
  sueldo_bruto: 0,
  hh_reemplazo: 0,
  hh_parada_planta: 0,
  hh_feriado_compensado: 0,
  hh_apoyo_oficina: 0,
  hh_otras: 0,
  monto_hh_reemplazo: 0,
  monto_hh_parada_planta: 0,
  monto_hh_feriado_compensado: 0,
  monto_hh_apoyo_oficina: 0,
  monto_hh_otras: 0,
  horas_extra_monto: 0,
  total_no_imponible: 0,
  otros_haberes: 0,
  otros_haberes_detalle: [],
  descuento_trabajador: 0,
  leyes_sociales: 0,
  aporte_patronal: 0,
};

/**
 * El detalle tal como se guardó. Los registros de antes de la 0064 tienen solo
 * el total: se muestran como una línea "Sin detalle" para que se pueda
 * nombrar sin perder el monto.
 */
export function detalleDeOtrosHaberes(guardado: unknown, total: number): OtroHaber[] {
  const lista = Array.isArray(guardado)
    ? (guardado as Partial<OtroHaber>[]).map((x) => ({ concepto: String(x.concepto ?? ""), monto: Number(x.monto ?? 0) }))
    : [];
  return lista.length === 0 && total > 0 ? [{ concepto: "Sin detalle", monto: total }] : lista;
}

/**
 * Los totales, igual que los calcula la base (0066). Primero sin HH extra
 * (líquido y costo base), después se suman las HH extra y los otros haberes.
 * El costo es lo que la empresa desembolsa: imposiciones y descuento bajan el
 * líquido, pero la empresa igual los paga (a la AFP, a la pensión de
 * alimentos, al seguro), así que no bajan el costo.
 */
export function totalesDe(h: Haberes) {
  const horasExtra = motivosHhExtra.reduce((t, m) => t + h[m.horas], 0);
  const costoHhExtra = motivosHhExtra.reduce((t, m) => t + h[m.monto], 0);
  const otros = h.otros_haberes_detalle.reduce((t, x) => t + (x.monto || 0), 0);
  const liquido = h.sueldo_bruto + h.total_no_imponible - h.descuento_trabajador - h.leyes_sociales;
  const costoBase = liquido + h.leyes_sociales + h.descuento_trabajador + h.aporte_patronal;
  const totalHaberes = h.sueldo_bruto + costoHhExtra + h.total_no_imponible + otros;
  return { horasExtra, costoHhExtra, otros, liquido, costoBase, totalHaberes, costoTotal: costoBase + costoHhExtra + otros };
}

/** Lo que se guarda: los totales van como la suma de su detalle, y las líneas vacías se descartan. */
export function haberesParaGuardar<T extends Haberes>(h: T): T {
  const detalle = h.otros_haberes_detalle
    .map((x) => ({ concepto: x.concepto.trim(), monto: Math.round(x.monto || 0) }))
    .filter((x) => x.concepto || x.monto);
  return {
    ...h,
    horas_extra_monto: totalesDe(h).costoHhExtra,
    otros_haberes_detalle: detalle,
    otros_haberes: detalle.reduce((t, x) => t + x.monto, 0),
  };
}

/** Lo que no cuadra antes de guardar, o null. */
export function errorDeHaberes(h: Haberes): string | null {
  // Solo los montos de la ficha: el formulario que la usa trae además textos.
  const montos = (Object.keys(haberesEnCero) as (keyof Haberes)[])
    .filter((k) => k !== "otros_haberes_detalle")
    .map((k) => h[k] as number)
    .concat(h.otros_haberes_detalle.map((x) => x.monto));
  if (montos.some((v) => !Number.isFinite(v) || v < 0)) {
    return "Los montos y las horas no pueden ser negativos.";
  }
  if (totalesDe(h).liquido < 0) {
    return "El descuento y las imposiciones superan el sueldo bruto más el no imponible. Revisa los montos.";
  }
  if (h.otros_haberes_detalle.some((x) => x.monto > 0 && !x.concepto.trim())) {
    return "En otros haberes, indica qué es cada monto (aguinaldo, bono, etc.).";
  }
  const sinCosto = motivosHhExtra.filter((m) => h[m.horas] > 0 && h[m.monto] === 0);
  if (sinCosto.length > 0) {
    return `Hay horas extra sin su costo: ${sinCosto.map((m) => m.corto.toLowerCase()).join(", ")}. Ingresa cuánto se pagó por ellas.`;
  }
  return null;
}
