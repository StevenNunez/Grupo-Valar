import type { FormaContrato } from "./control-de-gestion";
import type { PlantillaEdp } from "./plantillas-edp";

/**
 * Lo propio de cada forma de contratación (0058, columna `contratos.condiciones`).
 *
 * Todo es OPCIONAL: describe el contrato, no lo bloquea. Un contrato se crea
 * aunque todavía no se sepan sus tarifas. Todos los montos son NETOS; el IVA
 * se calcula al mostrar y no se guarda.
 *
 *   arriendo                 equipos (tipo, cantidad, tarifa mensual) y servicios con tarifa
 *   precios_unitarios        dotación, HH al mes e itemizado de precios
 *   suma_alzada              anticipo, retención e hitos de pago
 *   administracion_delegada  costo estimado, honorario y tope
 */

export const IVA = 0.19;
export const conIva = (neto: number) => ({ iva: Math.round(neto * IVA), total: Math.round(neto * (1 + IVA)) });
/** En UF se redondea a dos decimales; en pesos, al peso. */
export const conIvaUf = (neto: number) => ({ iva: Math.round(neto * IVA * 100) / 100, total: Math.round(neto * (1 + IVA) * 100) / 100 });

export type Equipo = { tipo: string; cantidad: number; tarifa: number };
export type Servicio = { concepto: string; tarifa: number };
export type ItemPrecio = { concepto: string; unidad: string; precio: number };
export type Hito = { nombre: string; porcentaje: number; fecha: string };

export type Condiciones = {
  arriendo?: { equipos: Equipo[]; servicios: Servicio[] };
  precios_unitarios?: { dotacion: number; hh_mensuales: number; itemizado: ItemPrecio[] };
  suma_alzada?: { anticipo_pct: number; retencion_pct: number; hitos: Hito[] };
  administracion_delegada?: { costo_estimado: number; honorario_pct: number; tope: number };
};

/** Lo que se pone al elegir la forma por primera vez: listo para llenar. */
export function condicionesVacias(forma: FormaContrato): Condiciones {
  switch (forma) {
    case "arriendo":
      // Los servicios que cobra Valar en su arriendo de torres (planilla de control).
      return {
        arriendo: {
          equipos: [{ tipo: "", cantidad: 0, tarifa: 0 }],
          servicios: [
            { concepto: "Traslado", tarifa: 0 },
            { concepto: "Mantención preventiva", tarifa: 0 },
            { concepto: "Mantención correctiva", tarifa: 0 },
          ],
        },
      };
    case "precios_unitarios":
      return { precios_unitarios: { dotacion: 0, hh_mensuales: 0, itemizado: [{ concepto: "", unidad: "HH", precio: 0 }] } };
    case "suma_alzada":
      return { suma_alzada: { anticipo_pct: 0, retencion_pct: 0, hitos: [] } };
    case "administracion_delegada":
      return { administracion_delegada: { costo_estimado: 0, honorario_pct: 0, tope: 0 } };
  }
}

/** Lee lo guardado y lo completa con la forma vacía: nunca se rompe por un campo que falte. */
export function condicionesDe(guardadas: unknown, forma: FormaContrato): Condiciones {
  const base = condicionesVacias(forma);
  const g = (guardadas ?? {}) as Condiciones;
  const propia = g[forma as keyof Condiciones];
  return propia ? { ...base, [forma]: { ...base[forma as keyof Condiciones], ...propia } } : base;
}

/** Equipos × tarifa: lo que se cobra al mes por el arriendo base, neto. */
export const montoMensualArriendo = (c: Condiciones["arriendo"]) =>
  (c?.equipos ?? []).reduce((t, e) => t + (Number(e.cantidad) || 0) * (Number(e.tarifa) || 0), 0);

export const equiposArrendados = (c: Condiciones["arriendo"]) =>
  (c?.equipos ?? []).reduce((t, e) => t + (Number(e.cantidad) || 0), 0);

export const honorarioEstimado = (c: Condiciones["administracion_delegada"]) =>
  Math.round((Number(c?.costo_estimado) || 0) * (Number(c?.honorario_pct) || 0) / 100);

export const sumaHitos = (c: Condiciones["suma_alzada"]) =>
  (c?.hitos ?? []).reduce((t, h) => t + (Number(h.porcentaje) || 0), 0);

/** La plantilla de EDP que calza con cada forma. Se propone; se puede cambiar. */
export const plantillaSugerida: Record<FormaContrato, PlantillaEdp> = {
  arriendo: "torres",
  precios_unitarios: "miscelaneos",
  suma_alzada: "carpas",
  administracion_delegada: "general",
};

/** Solo la parte de la forma elegida: lo de otra forma no se guarda colgando. */
export function condicionesParaGuardar(c: Condiciones, forma: FormaContrato): Condiciones {
  const propia = c[forma as keyof Condiciones];
  return propia ? ({ [forma]: propia } as Condiciones) : {};
}
