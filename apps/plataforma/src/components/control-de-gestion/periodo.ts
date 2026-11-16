import type { DatosDashboard } from "@/lib/dashboard";


/**
 * Qué período se está mirando.
 *
 * O un rango que se cuenta hacia atrás desde el último mes con datos —"3", "6",
 * "todo"— o un mes concreto, que viaja como "mes:2026-08-01". Un solo control
 * para las dos cosas: si fueran dos, se podrían contradecir entre ellos.
 */
export type Periodo = "3" | "6" | "todo" | `mes:${string}`;

export const rangos: { id: Periodo; titulo: string }[] = [
  { id: "todo", titulo: "Todos los meses cerrados" },
  { id: "3", titulo: "Últimos 3 meses cerrados" },
  { id: "6", titulo: "Últimos 6 meses cerrados" },
];

export const esMes = (p: Periodo) => p.startsWith("mes:");
export const mesDe = (p: Periodo) => p.slice(4);

/** El primer día del mes que está corriendo, "2026-10-01". */
export function mesEnCurso() {
  const hoy = new Date();
  return hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-01";
}

/** Los meses con movimientos, de contratos o de Oficina Central, del más viejo al más nuevo. */
export function periodosDe(datos: DatosDashboard) {
  return [...new Set([
    ...datos.meses.map((f) => f.periodo),
    ...datos.oficina.map((f) => f.fecha.slice(0, 7) + "-01"),
    ...datos.personalOficina.map((f) => f.periodo),
  ])].sort();
}

/**
 * Para analizar se abre en el último mes CERRADO: el mes corriente aún está
 * a medias y distorsiona los márgenes. Se puede elegir igual desde el selector.
 */
export function periodoInicial(datos: DatosDashboard): Periodo {
  const cerrado = periodosDe(datos).filter((p) => p < mesEnCurso()).pop();
  return cerrado ? ("mes:" + cerrado) as Periodo : "todo";
}
