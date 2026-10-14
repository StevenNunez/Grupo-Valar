import { anexoRaiz, type Anexo } from "./anexos";
import type { ContratoBreve } from "./contratos";

/**
 * La unidad que se controla por separado: un contrato, o un anexo (que se
 * controla como un contrato aparte). Es lo que ofrecen los filtros "Contrato".
 *
 * El id de un anexo es `contrato#anexoRaíz`: las adendas cuentan con su anexo.
 */
export type Unidad = { id: string; titulo: string };

export function unidadDe(anexos: Anexo[], contratoId: string, anexoId: string | null | undefined): string {
  return anexoId ? `${contratoId}#${anexoRaiz(anexos, anexoId)}` : contratoId;
}

/** Todos los contratos y todos los anexos principales, ordenados por nombre. */
export function unidades(contratos: ContratoBreve[], anexos: Anexo[]): Unidad[] {
  const lista: Unidad[] = contratos.map((c) => ({ id: c.id, titulo: c.nombreCorto || c.nombre }));
  for (const a of anexos) {
    if (a.estado === "anulado" || anexoRaiz(anexos, a.id) !== a.id) continue;
    lista.push({ id: `${a.contratoId}#${a.id}`, titulo: a.nombre?.trim() || `Anexo N°${a.numero}` });
  }
  return lista.sort((x, y) => x.titulo.localeCompare(y.titulo, "es"));
}

/** Las opciones del filtro: "Todos" más cada unidad. Una unidad con datos pero fuera de la lista se agrega igual. */
export function opcionesDeUnidad(lista: Unidad[], usadas: Iterable<string> = []) {
  const conocidas = new Set(lista.map((u) => u.id));
  const extra = [...new Set(usadas)].filter((id) => !conocidas.has(id)).map((id) => ({ id, titulo: id }));
  return [{ id: "todos", titulo: "Todos" }, ...lista, ...extra];
}

/* ── Órdenes y facturas: su unidad sale de los estados de pago que cubren ───── */

type Cubierto = { unidadId: string; unidadNombre: string };
type Con = Cubierto & { ordenId: string | null; facturaId: string | null };

/** De qué unidades (contrato o anexo) son los estados de pago de cada orden o factura. */
export function unidadesCubiertas(ciclos: Con[], por: "ordenId" | "facturaId"): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const c of ciclos) {
    const clave = c[por];
    if (!clave) continue;
    const s = mapa.get(clave) ?? new Set<string>();
    s.add(c.unidadId);
    mapa.set(clave, s);
  }
  return mapa;
}

/** Si el documento es de la unidad elegida; sin estados de pago vinculados, vale su contrato. */
export function esDeLaUnidad(cubiertas: Map<string, Set<string>>, id: string, contratoId: string, elegida: string) {
  if (elegida === "todos") return true;
  const s = cubiertas.get(id);
  return s && s.size > 0 ? s.has(elegida) : contratoId === elegida;
}

/** Todos los contratos más cada anexo que tenga estados de pago (los nombres vienen de ellos). */
export function opcionesDeCiclos(contratos: ContratoBreve[], ciclos: Cubierto[]) {
  const lista = new Map<string, string>(contratos.map((c) => [c.id, c.nombreCorto || c.nombre]));
  for (const c of ciclos) if (c.unidadId.includes("#")) lista.set(c.unidadId, c.unidadNombre);
  return [...lista.entries()].map(([id, titulo]) => ({ id, titulo })).sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
}
