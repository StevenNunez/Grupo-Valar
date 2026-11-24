/**
 * Boletas de honorarios y de prestación de servicios de terceros (BPST).
 *
 * No llevan IVA: llevan RETENCIÓN. Del monto bruto de la boleta, quien paga
 * retiene un porcentaje y lo entera al SII en el F29 del mes siguiente; al
 * prestador se le paga el resto (el líquido). Para el contrato el gasto es el
 * BRUTO: el líquido va al prestador y la retención al SII, pero sale todo de
 * la caja de Valar.
 *
 * La tasa sube por año desde 2020 (Ley 21.133) hasta llegar al 17% en 2028.
 * Se aplica la del año en que se emite la boleta.
 */

const TASAS: Record<number, number> = {
  2019: 10,
  2020: 10.75,
  2021: 11.5,
  2022: 12.25,
  2023: 13,
  2024: 13.75,
  2025: 14.5,
  2026: 15.25,
  2027: 16,
  2028: 17,
};

/** El porcentaje de retención (15,25 en 2026) del año de la boleta. */
export function tasaRetencion(fecha: string | null | undefined): number {
  const anio = Number((fecha || new Date().toISOString()).slice(0, 4));
  if (!Number.isFinite(anio) || anio <= 2019) return TASAS[2019];
  if (anio >= 2028) return TASAS[2028];
  return TASAS[anio];
}

/** La retención de un bruto, redondeada al peso como en la boleta del SII. */
export const retencionDe = (bruto: number, fecha: string | null | undefined) =>
  Math.round((bruto * tasaRetencion(fecha)) / 100);

/** Lo que se le paga al prestador: el bruto menos la retención. */
export const liquidoDe = (bruto: number, fecha: string | null | undefined) => bruto - retencionDe(bruto, fecha);

/**
 * El bruto que deja exactamente ese líquido. Sirve cuando se pactó «$300.000
 * líquidos»: el redondeo de la retención puede dejar el cálculo directo a un
 * peso, así que se prueba alrededor hasta que calce.
 */
export function brutoDesdeLiquido(liquido: number, fecha: string | null | undefined): number {
  if (liquido <= 0) return 0;
  const aprox = Math.round(liquido / (1 - tasaRetencion(fecha) / 100));
  for (const b of [aprox, aprox - 1, aprox + 1, aprox - 2, aprox + 2]) {
    if (b > 0 && liquidoDe(b, fecha) === liquido) return b;
  }
  return aprox;
}
