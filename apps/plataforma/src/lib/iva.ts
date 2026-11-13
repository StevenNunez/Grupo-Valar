/**
 * El IVA en Chile, en un solo lugar.
 *
 * Antes había dos constantes (en el formulario y en las condiciones del
 * contrato) y diecinueve `0.19` escritos a mano por la plataforma. Si la tasa
 * cambiara, o si hubiera que redondear distinto, había que encontrarlos todos.
 */
export const TASA_IVA = 0.19;

/** El IVA de un neto, redondeado al peso. Exento, cero. */
export const ivaDe = (neto: number, afecto = true) => (afecto ? Math.round(neto * TASA_IVA) : 0);

/** El neto que hay dentro de un total con IVA ($119.000 → $100.000). */
export const netoDesdeTotal = (total: number) => Math.round(total / (1 + TASA_IVA));
