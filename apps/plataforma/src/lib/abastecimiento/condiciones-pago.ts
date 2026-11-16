"use client";

/* ── Condiciones de pago ──────────────────────────────────────────────────── */

/**
 * Con qué plazo se le paga a un proveedor. Es una lista corta y cerrada: al
 * contado, o crédito a 30, 60 o 90 días. No hay una quinta forma.
 *
 * ERA TEXTO LIBRE, y eso significaba que "30 días", "30 dias", "Crédito 30" y
 * "a 30 días" eran cuatro condiciones distintas para cualquier consulta, y que
 * el vencimiento de la factura —que se calcula con los DÍAS— podía no tener
 * nada que ver con lo que decía la orden impresa.
 *
 * El dato duro son los días: de ahí sale el vencimiento en `cuentas_por_pagar`.
 * El texto es la etiqueta, y existe porque es lo que se imprime en la OC.
 */
export const condicionesPago = [
  { id: "Contado", titulo: "Al contado", dias: 0 },
  { id: "Crédito 30 días", titulo: "Crédito a 30 días", dias: 30 },
  { id: "Crédito 60 días", titulo: "Crédito a 60 días", dias: 60 },
  { id: "Crédito 90 días", titulo: "Crédito a 90 días", dias: 90 },
] as const;

export type CondicionPago = (typeof condicionesPago)[number]["id"];

export const opcionesCondicionPago = condicionesPago.map((c) => ({
  id: c.id,
  titulo: c.titulo,
}));

/** Los días de crédito de una condición. Lo que no se reconoce va a contado. */
export function diasDeCondicion(condicion: string | null) {
  return condicionesPago.find((c) => c.id === condicion)?.dias ?? 0;
}

/**
 * La condición que corresponde a una ficha de proveedor.
 *
 * Las fichas viejas traen texto libre ("30 días", "Contado", null) y días por
 * separado. Mandan los días, porque son con los que se calcula el vencimiento;
 * el texto solo desempata cuando los días no calzan con ninguna condición.
 */
export function condicionDeProveedor(p: {
  condicionPago?: string | null;
  diasCredito?: number | null;
}): CondicionPago {
  const porDias = condicionesPago.find((c) => c.dias === (p.diasCredito ?? 0));
  if (porDias && (p.diasCredito ?? 0) > 0) return porDias.id;

  const texto = (p.condicionPago ?? "").toLowerCase();
  if (/90/.test(texto)) return "Crédito 90 días";
  if (/60/.test(texto)) return "Crédito 60 días";
  if (/30/.test(texto)) return "Crédito 30 días";
  return "Contado";
}

