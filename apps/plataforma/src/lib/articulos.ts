"use client";

import { supabase } from "./supabase";
import { actualizar, crear } from "./crud";

/**
 * El maestro de artículos: qué compra Valar y cómo se llama cada cosa.
 *
 * EXISTE POR UN PROBLEMA CONCRETO. Faena pide "lentes de seguridad oscuros" y
 * el proveedor cotiza "LENTE MAX FENIX IN OUT". Ese nombre técnico —el único
 * con el que el proveedor sabe qué mandar— se aprendía en cada compra y se
 * perdía, y la solicitud siguiente volvía a decir "lentes oscuros".
 *
 * Acá viven los dos nombres. El de faena para buscar, el técnico para pedir.
 *
 * Los códigos son los de sus planillas de bodega (EPP-LEN-02, HM-009), no una
 * numeración nueva: quien busca en bodega y quien busca acá tienen que
 * encontrar lo mismo.
 */

export type Familia = "epp" | "herramientas" | "equipos" | "oxicorte" | "insumos" | "servicios";

export const familias: { id: Familia; titulo: string }[] = [
  { id: "epp", titulo: "EPP" },
  { id: "herramientas", titulo: "Herramientas" },
  { id: "equipos", titulo: "Máquinas y equipos" },
  { id: "oxicorte", titulo: "Oxicorte" },
  { id: "insumos", titulo: "Insumos" },
  { id: "servicios", titulo: "Servicios" },
];

export const nombreFamilia: Record<Familia, string> = Object.fromEntries(
  familias.map((f) => [f.id, f.titulo]),
) as Record<Familia, string>;

export type Articulo = {
  id: string;
  nombre: string;
  nombreTecnico: string | null;
  /** El técnico si se aprendió; si no, el de faena. Lo calcula la vista. */
  nombreParaPedir: string;
  especificacion: string | null;
  unidad: string;
  familia: Familia;
  stockActual: number | null;
  stockMinimo: number | null;
  bajoMinimo: boolean;
  categoriaSugeridaId: string | null;
  activo: boolean;
  observaciones: string | null;
  /** A cuántos proveedores se le ha comprado, y a cuánto. */
  proveedores: number;
  mejorPrecio: number | null;
  ultimaCompra: string | null;
};

type Fila = {
  id: string;
  nombre: string;
  nombre_tecnico: string | null;
  nombre_para_pedir: string;
  especificacion: string | null;
  unidad: string;
  familia: Familia;
  stock_actual: number | null;
  stock_minimo: number | null;
  bajo_minimo: boolean;
  categoria_sugerida_id: string | null;
  activo: boolean;
  observaciones: string | null;
  proveedores: number;
  mejor_precio: number | null;
  ultima_compra: string | null;
};

function mapear(f: Fila): Articulo {
  return {
    id: f.id,
    nombre: f.nombre,
    nombreTecnico: f.nombre_tecnico,
    nombreParaPedir: f.nombre_para_pedir,
    especificacion: f.especificacion,
    unidad: f.unidad,
    familia: f.familia,
    stockActual: f.stock_actual === null ? null : Number(f.stock_actual),
    stockMinimo: f.stock_minimo === null ? null : Number(f.stock_minimo),
    bajoMinimo: f.bajo_minimo,
    categoriaSugeridaId: f.categoria_sugerida_id,
    activo: f.activo,
    observaciones: f.observaciones,
    proveedores: f.proveedores,
    mejorPrecio: f.mejor_precio,
    ultimaCompra: f.ultima_compra,
  };
}

export async function cargarArticulos(): Promise<Articulo[]> {
  const { data, error } = await supabase
    .from("catalogo_articulos")
    .select("*")
    .order("nombre");

  if (error) throw new Error(error.message);
  return ((data ?? []) as Fila[]).map(mapear);
}

/**
 * Buscar en el catálogo por cualquiera de los dos nombres.
 *
 * Los dos y no solo uno: quien arma la solicitud escribe "lentes" y quien la
 * revisa después busca "fenix". Si solo se buscara por uno, la mitad de las
 * veces el artículo estaría cargado y no aparecería.
 */
export function buscarArticulos(articulos: Articulo[], texto: string) {
  return articulos.filter((a) =>
    calza(texto, `${a.id} ${a.nombre} ${a.nombreTecnico ?? ""} ${a.especificacion ?? ""}`),
  );
}

/**
 * Si un texto satisface una búsqueda, palabra por palabra.
 *
 * TODAS las palabras tienen que estar, pero **no en orden ni pegadas**: se
 * escribe "lentes oscuro" y tiene que salir "Lentes de seguridad oscuros".
 * Buscando la frase completa —que es como estaba— no salía nada, porque nadie
 * escribe el nombre entero ni se acuerda de las palabras del medio.
 *
 * Sin acentos y en minúsculas, porque el catálogo está escrito de las dos
 * formas y el que busca no tiene por qué saber cuál.
 */
export function calza(busqueda: string, texto: string) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;

  const donde = normalizar(texto);
  return palabras.every((p) => donde.includes(p));
}

function normalizar(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Cómo se muestra en una lista: nombre, especificación y código. */
export function etiquetaDe(a: Articulo) {
  const partes = [a.nombreParaPedir];
  if (a.especificacion) partes.push(a.especificacion);
  return `${partes.join(" · ")} — ${a.id}`;
}

/* ── Aprender del proveedor ───────────────────────────────────────────────── */

/**
 * Guardar cómo le llama un proveedor a un artículo, y a cuánto lo vendió.
 *
 * Es el paso que cierra el círculo: la próxima vez que llegue una cotización de
 * ese proveedor, el lector de PDF reconoce el artículo por su nombre exacto en
 * vez de adivinar por parecido, y el precio anterior queda a la vista para
 * notar si subió.
 */
export async function aprenderNombreDelProveedor({
  articuloId,
  proveedorId,
  nombreProveedor,
  sku = null,
  precio = null,
  fecha = null,
}: {
  articuloId: string;
  proveedorId: string;
  nombreProveedor: string;
  sku?: string | null;
  precio?: number | null;
  fecha?: string | null;
}) {
  const { error } = await supabase.from("articulo_proveedor").upsert(
    {
      id: `AP-${articuloId}-${proveedorId}`,
      articulo_id: articuloId,
      proveedor_id: proveedorId,
      nombre_proveedor: nombreProveedor.trim(),
      sku,
      ultimo_precio: precio,
      ultima_fecha: fecha ?? new Date().toISOString().slice(0, 10),
    },
    { onConflict: "articulo_id,proveedor_id" },
  );

  if (error) throw new Error(error.message);
}

/**
 * Ascender el nombre del proveedor a nombre técnico del artículo.
 *
 * Separado a propósito de `aprenderNombreDelProveedor`: que un proveedor le
 * llame de una forma no significa que ese sea EL nombre con el que Valar quiere
 * pedirlo. Lo primero se guarda solo; esto lo decide una persona.
 */
export async function fijarNombreTecnico(articuloId: string, nombreTecnico: string) {
  await actualizar("articulos", articuloId, {
    nombre_tecnico: nombreTecnico.trim() || null,
  });
}

export type EquivalenciaProveedor = {
  proveedorId: string;
  proveedor: string;
  nombreProveedor: string;
  sku: string | null;
  ultimoPrecio: number | null;
  ultimaFecha: string | null;
};

export async function cargarEquivalencias(articuloId: string): Promise<EquivalenciaProveedor[]> {
  const { data, error } = await supabase
    .from("articulo_proveedor")
    .select("proveedor_id, nombre_proveedor, sku, ultimo_precio, ultima_fecha, proveedores(razon_social)")
    .eq("articulo_id", articuloId)
    .order("ultima_fecha", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  /* PostgREST devuelve la relación como arreglo aunque sea uno a uno: la clave
     foránea no le dice que hay a lo más un proveedor por fila. */
  return (data ?? []).map((f) => ({
    proveedorId: f.proveedor_id,
    proveedor:
      [f.proveedores].flat()[0]?.razon_social ?? f.proveedor_id,
    nombreProveedor: f.nombre_proveedor,
    sku: f.sku,
    ultimoPrecio: f.ultimo_precio,
    ultimaFecha: f.ultima_fecha,
  }));
}

/* ── Alta y edición ───────────────────────────────────────────────────────── */

export type BorradorArticulo = {
  id: string;
  nombre: string;
  nombre_tecnico: string;
  especificacion: string;
  unidad: string;
  familia: Familia;
  stock_actual: number | null;
  stock_minimo: number | null;
  categoria_sugerida_id: string;
  activo: boolean;
  observaciones: string;
};

export async function guardarArticulo(borrador: BorradorArticulo, editando: boolean) {
  const fila = {
    nombre: borrador.nombre.trim(),
    nombre_tecnico: borrador.nombre_tecnico.trim() || null,
    especificacion: borrador.especificacion.trim() || null,
    unidad: borrador.unidad.trim() || "un",
    familia: borrador.familia,
    stock_actual: borrador.stock_actual,
    stock_minimo: borrador.stock_minimo,
    categoria_sugerida_id: borrador.categoria_sugerida_id || null,
    activo: borrador.activo,
    observaciones: borrador.observaciones.trim() || null,
  };

  if (editando) await actualizar("articulos", borrador.id, fila);
  else await crear("articulos", { ...fila, id: borrador.id.trim().toUpperCase() });
}

/**
 * El código que sigue dentro de una familia: EPP-001, HM-050…
 *
 * Solo se propone para los que se crean a mano. Los que vinieron de la planilla
 * de bodega conservan el código con que están rotulados en el estante, que es
 * el que sirve para encontrarlos.
 */
export function siguienteCodigo(articulos: Articulo[], familia: Familia) {
  const prefijos: Record<Familia, string> = {
    epp: "EPP",
    herramientas: "HM",
    equipos: "EQ",
    oxicorte: "OX",
    insumos: "INS",
    servicios: "SRV",
  };

  const prefijo = prefijos[familia];
  const usados = articulos
    .map((a) => new RegExp(`^${prefijo}-(\\d+)$`).exec(a.id)?.[1])
    .filter(Boolean)
    .map(Number);

  const siguiente = (usados.length > 0 ? Math.max(...usados) : 0) + 1;
  return `${prefijo}-${String(siguiente).padStart(3, "0")}`;
}
