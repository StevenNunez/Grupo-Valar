"use client";

import { supabase } from "./supabase";

/**
 * Las categorías de costo, propias de cada contrato.
 *
 * NO HAY UNA LISTA COMÚN, y eso es lo que hace que cada contrato "traiga su
 * planilla". Así están en el control de gestión de Valar:
 *
 *   Misceláneos → Personal · Camioneta · RRHH, Logística y Otros · EPP Básicos
 *                 Traslado de Personal · Gastos Reembolsables · HH Extra
 *   Torres      → Personal · Torres · Herramientas · Camioneta · Insumos
 *
 * Al elegir el contrato en un formulario de egreso, la lista de categorías
 * cambia sola. Cargar un EPP contra Torres no debería ser posible, porque Torres
 * no tiene esa línea en su planilla.
 *
 * `familia` dice a qué formulario pertenece cada una, para que Egresos siga
 * teniendo Compras, Servicios y Personal aunque las categorías cambien de un
 * contrato a otro.
 *
 * `afectaIva` no es un detalle contable: es lo que evita la regla "se asume
 * bruto y se divide por 1,19" que la planilla aplica a ojo sobre todo lo que no
 * sea sueldo. Acá cada categoría lo dice, y cada costo guarda su neto y su IVA
 * por separado.
 */

export type Familia = "compras" | "servicios" | "personal";

export const familias: { id: Familia; titulo: string }[] = [
  { id: "compras", titulo: "Compras" },
  { id: "servicios", titulo: "Servicios" },
  { id: "personal", titulo: "Personal" },
];

export type Categoria = {
  id: string;
  contratoId: string;
  nombre: string;
  familia: Familia;
  afectaIva: boolean;
  presupuestoMensual: number;
  orden: number;
  activa: boolean;
};

function mapear(f: Record<string, unknown>): Categoria {
  return {
    id: f.id as string,
    contratoId: f.contrato_id as string,
    nombre: f.nombre as string,
    familia: f.familia as Familia,
    afectaIva: Boolean(f.afecta_iva),
    presupuestoMensual: Number(f.presupuesto_mensual ?? 0),
    orden: Number(f.orden ?? 0),
    activa: Boolean(f.activa),
  };
}

/**
 * Todas las categorías de todos los contratos.
 *
 * Se traen de una vez y se filtran en memoria: son una docena de filas, y así
 * el formulario cambia al instante cuando alguien cambia el contrato, sin una
 * consulta por cada cambio.
 */
export async function cargarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from("categorias_costo")
    .select("*")
    .order("contrato_id")
    .order("orden");

  // Que falten las categorías no puede impedir cargar un costo que ya ocurrió.
  if (error) return [];
  return (data ?? []).map(mapear);
}

/** Las de un contrato y un formulario, en el orden de la planilla. */
export function categoriasDe(todas: Categoria[], contratoId: string, familia: Familia) {
  return todas
    .filter((c) => c.contratoId === contratoId && c.familia === familia && c.activa)
    .sort((a, b) => a.orden - b.orden);
}

/** Listas para un `CampoSeleccion`. */
export function opcionesDeCategoria(todas: Categoria[], contratoId: string, familia: Familia) {
  return [
    { id: "", titulo: "— Elegir —" },
    ...categoriasDe(todas, contratoId, familia).map((c) => ({ id: c.id, titulo: c.nombre })),
  ];
}

/** El id de una categoría nueva: legible y único por contrato. */
export function idDeCategoria(contratoId: string, nombre: string) {
  const clave = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `CAT-${contratoId.replace(/^C-/, "")}-${clave}`;
}
