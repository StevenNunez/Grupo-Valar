"use client";

import { supabase } from "./supabase";

/**
 * La planilla propia de cada contrato.
 *
 * Los contratos de Valar no se presentan igual: el estado de pago de
 * Misceláneos se arma con cargos, turnos y horas; el de Torres con número de
 * equipos y días de arriendo. Estos son los campos que cada contrato agrega a
 * los formularios de Personal, Servicios, Compras y Estados de Pago.
 *
 * LO QUE NO VIVE ACÁ: el neto, el IVA, la categoría y el tipo de gasto. Esos
 * son fijos y tipados en su tabla, porque son los que el Dashboard suma entre
 * contratos. Si el neto de un contrato viviera en un campo que ese contrato
 * inventó, no habría forma de consolidar dos contratos en un total —y
 * consolidar es para lo que existe el módulo—.
 *
 * Los campos propios describen; los fijos cuentan.
 */

export type Seccion = "personal" | "servicios" | "compras" | "estado_pago";

export const secciones: { id: Seccion; titulo: string; ayuda: string }[] = [
  { id: "personal", titulo: "Personal", ayuda: "Al cargar el costo de mano de obra del mes." },
  { id: "servicios", titulo: "Servicios", ayuda: "Al cargar un subcontrato, arriendo o flete." },
  { id: "compras", titulo: "Compras", ayuda: "Al cargar una compra de materiales." },
  { id: "estado_pago", titulo: "Estado de pago", ayuda: "Al presentar el EDP al mandante." },
];

export type TipoCampo = "texto" | "numero" | "moneda" | "fecha" | "opcion" | "booleano";

export const tiposCampo: { id: TipoCampo; titulo: string; ayuda: string }[] = [
  { id: "texto", titulo: "Texto", ayuda: "Una línea escrita." },
  { id: "numero", titulo: "Número", ayuda: "Cantidades: horas, unidades, días." },
  { id: "moneda", titulo: "Monto", ayuda: "Pesos, con separador de miles." },
  { id: "fecha", titulo: "Fecha", ayuda: "" },
  { id: "opcion", titulo: "Lista de opciones", ayuda: "Un desplegable con alternativas fijas." },
  { id: "booleano", titulo: "Sí o no", ayuda: "Una casilla que se marca." },
];

export type CampoContrato = {
  id: string;
  contratoId: string;
  seccion: Seccion;
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  unidad: string | null;
  opciones: string[];
  ayuda: string | null;
  obligatorio: boolean;
  sumaEnEdp: boolean;
  orden: number;
  activo: boolean;
};

/** Lo que se guarda en la columna `datos` de cada registro. */
export type Datos = Record<string, string | number | boolean | null>;

function mapear(f: Record<string, unknown>): CampoContrato {
  return {
    id: f.id as string,
    contratoId: f.contrato_id as string,
    seccion: f.seccion as Seccion,
    clave: f.clave as string,
    etiqueta: f.etiqueta as string,
    tipo: f.tipo as TipoCampo,
    unidad: (f.unidad as string | null) ?? null,
    opciones: (f.opciones as string[] | null) ?? [],
    ayuda: (f.ayuda as string | null) ?? null,
    obligatorio: Boolean(f.obligatorio),
    sumaEnEdp: Boolean(f.suma_en_edp),
    orden: Number(f.orden),
    activo: Boolean(f.activo),
  };
}

/**
 * Todos los campos de todos los contratos.
 *
 * Se traen de una vez y se filtran en memoria: son pocas filas —una decena por
 * contrato— y así el formulario cambia al instante cuando alguien cambia el
 * contrato en el desplegable, sin una consulta por cada cambio.
 */
export async function cargarCampos(): Promise<CampoContrato[]> {
  const { data, error } = await supabase
    .from("campos_contrato")
    .select("*")
    .eq("activo", true)
    .order("contrato_id")
    .order("orden");

  // Que falte la planilla no puede impedir cargar un costo: el núcleo del
  // formulario funciona igual.
  if (error) return [];
  return (data ?? []).map(mapear);
}

/** Los de un contrato y un formulario, en orden. */
export function camposDe(campos: CampoContrato[], contratoId: string, seccion: Seccion) {
  return campos
    .filter((c) => c.contratoId === contratoId && c.seccion === seccion)
    .sort((a, b) => a.orden - b.orden);
}

/** Para administrar la planilla: también los desactivados. */
export async function cargarCamposDeContrato(contratoId: string): Promise<CampoContrato[]> {
  const { data, error } = await supabase
    .from("campos_contrato")
    .select("*")
    .eq("contrato_id", contratoId)
    .order("seccion")
    .order("orden");

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapear);
}

/**
 * "HH del cargo" → "hh_del_cargo".
 *
 * La clave es el nombre con que el valor vive dentro del jsonb, y no se teclea:
 * si cada uno la escribiera, el mismo campo terminaría guardado como "turno" en
 * un contrato y "Turno " en otro, y no habría forma de compararlos.
 */
export function claveDesde(etiqueta: string) {
  return etiqueta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "c$1")
    .slice(0, 40);
}

/** El id de un campo: legible y único por contrato y sección. */
export function idDeCampo(contratoId: string, seccion: Seccion, clave: string) {
  return `CF-${contratoId.replace(/^C-/, "")}-${seccion}-${clave}`;
}

/** Un valor listo para mostrar en una tabla. */
export function mostrarValor(campo: CampoContrato, valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo.tipo === "booleano") return valor ? "Sí" : "No";
  if (campo.tipo === "moneda") return `$${Number(valor).toLocaleString("es-CL")}`;
  if (campo.tipo === "numero") {
    return `${Number(valor).toLocaleString("es-CL")}${campo.unidad ? ` ${campo.unidad}` : ""}`;
  }
  return String(valor);
}

/**
 * Qué falta por llenar de la planilla.
 *
 * Se avisa en pantalla en vez de bloquear el guardado: un dato que falta no
 * puede impedir registrar un costo que ya ocurrió, pero sí tiene que verse.
 */
export function faltantes(campos: CampoContrato[], datos: Datos) {
  return campos
    .filter((c) => c.obligatorio)
    .filter((c) => {
      const v = datos[c.clave];
      return v === null || v === undefined || v === "";
    })
    .map((c) => c.etiqueta);
}
