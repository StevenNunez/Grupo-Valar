"use client";

import type { PlantillaEdp } from "./plantillas-edp";


/**
 * Datos del Dashboard.
 *
 * Ninguno se escribe a mano: salen de dos vistas que suman lo que se carga en
 * Ingresos y Egresos.
 *
 *   facturacion_mensual  ←  facturas emitidas
 *   contratos_resumen    ←  contratos + compras + servicios + personal
 *
 * Por eso el Dashboard no tiene "sus" números: si un total no cuadra, el dato
 * que hay que corregir está en la vista donde se carga, no acá.
 */

export type Periodo = "trimestre" | "semestre" | "anio";

export const periodos: { id: Periodo; titulo: string }[] = [
  { id: "trimestre", titulo: "Últimos 3 meses" },
  { id: "semestre", titulo: "Últimos 6 meses" },
  { id: "anio", titulo: "Todo el año" },
];

/** Cuántos meses toma cada período del final de la serie. */
export function mesesDelPeriodo(periodo: Periodo, disponibles: number) {
  if (periodo === "trimestre") return Math.min(3, disponibles);
  if (periodo === "semestre") return Math.min(6, disponibles);
  return disponibles;
}

/** Lo que el calendario no sabe: si se canceló antes de tiempo. Ver la 0047. */
export type EstadoContrato = "activo" | "cancelado";

export type Contrato = {
  id: string;
  plantillaEdp: PlantillaEdp;
  nombre: string;
  cliente: string;
  faena: string;
  /** Avance físico informado, 0–100. */
  avance: number;
  presupuesto: number;
  /** Compras ordinarias + costo de personal. Deducido, no almacenado. */
  costoReal: number;
  costoCompras: number;
  costoServicios: number;
  /** Se le recupera al mandante, así que va aparte del costo real. */
  costoReembolsable: number;
  costoPersonal: number;
  facturado: number;
  estado: EstadoContrato;
  termino: string;
  /** Puntual o permanente. */
  modalidad: Modalidad;
  /** Cómo se cobra, dentro de la modalidad. */
  forma: FormaContrato;
  /** Deducida de la fecha de término vigente, no se escribe. */
  vigencia: Vigencia;
  diasRestantes: number;
  /** Cuánto dura en total, si el inicio está cargado. */
  diasPlazoTotal: number | null;
  inicio: string | null;
  /** Cuántos anexos vigentes tiene. Un contrato muta. */
  anexos: number;
  montoAnexos: number;
  diasAnexos: number;
  /** Presupuesto más anexos. Nulo cuando el contrato no lleva monto total. */
  montoVigente: number | null;
  /** El término después de las extensiones de plazo. */
  terminoVigente: string;
};

/**
 * La modalidad va en dos niveles, y son dos preguntas distintas.
 *
 *   Modalidad → ¿es puntual o es permanente?  spot · largo plazo
 *   Forma     → ¿cómo se cobra?               suma alzada · precios unitarios ·
 *                                             administración delegada · arriendo
 *
 * Un contrato a largo plazo puede cobrarse a precios unitarios y uno spot a
 * suma alzada: por eso no caben en un solo campo.
 */
export type Modalidad = "spot" | "largo_plazo";

export const modalidades: { id: Modalidad; titulo: string; ayuda: string }[] = [
  { id: "largo_plazo", titulo: "Largo plazo", ayuda: "Permanente: se factura mes a mes mientras dure." },
  { id: "spot", titulo: "Spot", ayuda: "Puntual, por una vez." },
];

export type FormaContrato =
  | "suma_alzada"
  | "precios_unitarios"
  | "administracion_delegada"
  | "arriendo";

export const formasContrato: { id: FormaContrato; titulo: string; ayuda: string }[] = [
  { id: "suma_alzada", titulo: "Suma alzada", ayuda: "Precio fijo por el total, sin importar lo que cueste." },
  { id: "precios_unitarios", titulo: "Precios unitarios", ayuda: "Se paga lo ejecutado, a un precio por unidad o por hora." },
  { id: "administracion_delegada", titulo: "Administración delegada", ayuda: "Costo más honorario." },
  { id: "arriendo", titulo: "Arriendo", ayuda: "Equipos por período." },
];

/** La vigencia no se teclea: sale de la fecha de término que rige hoy. */
export type Vigencia = "vigente" | "por-vencer" | "cerrado" | "cancelado";

export const vigencias: Record<Vigencia, string> = {
  vigente: "Vigente",
  "por-vencer": "Por vencer",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

export type MesFacturado = {
  /** Día 1 del mes, en ISO. */
  periodo: string;
  /** "Ene", "Feb"… para el eje del gráfico. */
  etiqueta: string;
  monto: number;
  documentos: number;
};

export type Seguridad = {
  diasSinAccidentes: number;
  hhAcumuladas: number;
  ultimaAuditoria: string | null;
};
