"use client";

import { supabase } from "./supabase";

/**
 * Anexos: las modificaciones al contrato original.
 *
 * El contrato base no se edita. Un contrato de servicios industriales siempre
 * muta —mayor obra, menor obra, extensiones de plazo— y editar el original
 * encima borra cuál era el trato, que es justo lo que hay que poder mostrar
 * cuando el mandante pregunta.
 *
 * El monto vigente lo calcula la base (`contratos_detalle`): presupuesto más lo
 * que sumen o resten los anexos vigentes.
 */

export type TipoAnexo =
  | "mayor_obra"
  | "menor_obra"
  | "extension_plazo"
  | "cambio_alcance"
  | "reajuste"
  | "otro";

export const tiposAnexo: { id: TipoAnexo; titulo: string; ayuda: string }[] = [
  { id: "mayor_obra", titulo: "Mayor obra", ayuda: "Se agrega alcance y monto." },
  { id: "menor_obra", titulo: "Menor obra", ayuda: "Se reduce el alcance. El monto va negativo." },
  { id: "extension_plazo", titulo: "Extensión de plazo", ayuda: "El mismo alcance, más tiempo." },
  { id: "cambio_alcance", titulo: "Cambio de alcance", ayuda: "Cambia lo que hay que hacer." },
  { id: "reajuste", titulo: "Reajuste", ayuda: "Se ajustan precios: IPC, UF o negociación." },
  { id: "otro", titulo: "Otro", ayuda: "" },
];

export const nombreTipoAnexo: Record<TipoAnexo, string> = Object.fromEntries(
  tiposAnexo.map((t) => [t.id, t.titulo]),
) as Record<TipoAnexo, string>;

export type EstadoAnexo = "borrador" | "vigente" | "anulado";

export const estadosAnexo: { id: EstadoAnexo; titulo: string }[] = [
  { id: "borrador", titulo: "En negociación" },
  { id: "vigente", titulo: "Vigente" },
  { id: "anulado", titulo: "Anulado" },
];

export type Anexo = {
  id: string;
  contratoId: string;
  numero: number;
  tipo: TipoAnexo;
  descripcion: string;
  monto: number;
  diasPlazo: number;
  nuevaFechaTermino: string | null;
  fecha: string;
  documento: string | null;
  estado: EstadoAnexo;
  observaciones: string | null;
  /** Nombre corto para elegirlo al cargar ("Carpas"). */
  nombre: string | null;
  /** Desde cuándo rige. */
  inicio: string | null;
  /** Lo propio de la forma de contratación del contrato (mismo formato que el contrato). */
  condiciones: Record<string, unknown>;
  /** Si es adenda de otro anexo del mismo contrato. */
  padreId: string | null;
};

/** Cómo se nombra un anexo en los selectores: "Anexo N°2 · Carpas". */
export function etiquetaAnexo(a: Pick<Anexo, "numero" | "nombre" | "descripcion">) {
  const nombre = a.nombre?.trim() || a.descripcion.trim();
  return `Anexo N°${a.numero}${nombre ? ` · ${nombre.length > 60 ? `${nombre.slice(0, 57)}…` : nombre}` : ""}`;
}

/** Lo que se imprime en la línea "Proyecto" de una OC hecha contra un anexo. */
export function proyectoDeAnexo(a: Anexo) {
  return `${nombreTipoAnexo[a.tipo]} N° ${a.numero} · ${a.nombre?.trim() || a.descripcion}`;
}

export async function cargarAnexos(contratoId: string): Promise<Anexo[]> {
  const { data, error } = await supabase
    .from("anexos")
    .select("*")
    .eq("contrato_id", contratoId)
    .order("numero");

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    contratoId: f.contrato_id as string,
    numero: Number(f.numero),
    tipo: f.tipo as TipoAnexo,
    descripcion: f.descripcion as string,
    monto: Number(f.monto),
    diasPlazo: Number(f.dias_plazo),
    nuevaFechaTermino: (f.nueva_fecha_termino as string | null) ?? null,
    fecha: f.fecha as string,
    documento: (f.documento as string | null) ?? null,
    estado: f.estado as EstadoAnexo,
    observaciones: (f.observaciones as string | null) ?? null,
    nombre: (f.nombre as string | null) ?? null,
    inicio: (f.inicio as string | null) ?? null,
    condiciones: (f.condiciones as Record<string, unknown> | null) ?? {},
    padreId: (f.anexo_padre_id as string | null) ?? null,
  }));
}

/**
 * Los anexos en árbol: cada uno seguido de sus adendas, con su profundidad.
 * Si la base aún no tiene la columna (0060 sin aplicar), todo queda en nivel 0.
 */
export function anexosEnArbol(anexos: Anexo[]): { anexo: Anexo; nivel: number }[] {
  const ids = new Set(anexos.map((a) => a.id));
  const hijos = new Map<string | null, Anexo[]>();
  for (const a of anexos) {
    const padre = a.padreId && ids.has(a.padreId) ? a.padreId : null;
    hijos.set(padre, [...(hijos.get(padre) ?? []), a]);
  }
  const salida: { anexo: Anexo; nivel: number }[] = [];
  const vistos = new Set<string>();
  const recorrer = (padre: string | null, nivel: number) => {
    for (const a of hijos.get(padre) ?? []) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      salida.push({ anexo: a, nivel });
      recorrer(a.id, nivel + 1);
    }
  };
  recorrer(null, 0);
  return salida;
}

/** El anexo principal del que cuelga (él mismo si no es adenda). */
export function anexoRaiz(anexos: Anexo[], id: string): string {
  const porId = new Map(anexos.map((a) => [a.id, a]));
  let actual = porId.get(id);
  for (let i = 0; actual?.padreId && porId.has(actual.padreId) && i < 20; i++) {
    actual = porId.get(actual.padreId);
  }
  return actual?.id ?? id;
}

/** El correlativo que le toca al próximo, dentro de su contrato. */
export function siguienteNumeroAnexo(anexos: Anexo[]) {
  return anexos.length === 0 ? 1 : Math.max(...anexos.map((a) => a.numero)) + 1;
}

/** "AD-MISC-02", legible y ordenable. */
export function idDeAnexo(contratoId: string, numero: number) {
  return `AD-${contratoId.replace(/^C-/, "")}-${String(numero).padStart(2, "0")}`;
}

/**
 * Una menor obra resta.
 *
 * En pantalla el monto se escribe siempre positivo —nadie teclea un menos— y
 * acá se le pone el signo según el tipo. Guardarlo con signo es lo que permite
 * sumar la columna sin preguntarse qué significa cada fila.
 */
export function montoConSigno(tipo: TipoAnexo, monto: number) {
  return tipo === "menor_obra" ? -Math.abs(monto) : Math.abs(monto);
}
