"use client";

import { detalleDeOtrosHaberes, type Haberes } from "./haberes";
import { todasLasFilas } from "./paginar";
import { supabase } from "./supabase";

/**
 * Dos preguntas distintas sobre cada egreso de Oficina Central (migración 0110):
 *  · la CATEGORÍA dice qué tipo de gasto es (compras, internet, mantención…);
 *  · el CENTRO DE COSTO dice para quién o para qué se gastó (Pagnol, Tokio, general…).
 * Las dos listas las edita la empresa desde la pantalla. Un egreso va siempre a
 * una categoría y a un solo centro: nunca se reparte.
 */
export type CategoriaOficina = {
  id: string;
  titulo: string;
  /** Inversión (equipos, herramientas): va aparte del gasto operativo. */
  esActivo: boolean;
  activa: boolean;
  orden: number;
};

export type CentroCosto = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
};

export const CENTRO_GENERAL = "general";

/** Categorías cuyo egreso no es mercadería: no se informan a Pagnol como ingreso. */
export const categoriasSinIngresoAPagnol: readonly string[] = ["arriendos", "servicios", "mantenciones"];

export type EstadoEgresoOficina = "pendiente" | "pagado";

export type EgresoOficina = {
  id: string;
  categoria: string;
  centro_costo: string;
  fecha: string;
  proveedor: string;
  descripcion: string;
  documento: string | null;
  neto: number;
  iva: number;
  total: number;
  estado: EstadoEgresoOficina;
  observaciones: string | null;
  /** Resueltos al cargar, para no pasar el catálogo por todas las pantallas. */
  categoriaTitulo: string;
  esActivo: boolean;
  centroNombre: string;
};

export type DatosEgresoOficina = Pick<EgresoOficina,
  "categoria" | "centro_costo" | "fecha" | "proveedor" | "descripcion" | "documento" | "neto" | "iva" | "estado" | "observaciones">;

export async function cargarCatalogoOficina(): Promise<{ categorias: CategoriaOficina[]; centros: CentroCosto[] }> {
  const [cat, cen] = await Promise.all([
    supabase.from("categorias_oficina").select("id, titulo, es_activo, activa, orden").order("orden").order("titulo"),
    supabase.from("centros_costo_oficina").select("id, nombre, activo, orden").order("orden").order("nombre"),
  ]);
  if (cat.error) throw new Error(cat.error.message);
  if (cen.error) throw new Error(cen.error.message);
  return {
    categorias: (cat.data ?? []).map((c) => ({ id: c.id, titulo: c.titulo, esActivo: c.es_activo, activa: c.activa, orden: c.orden })),
    centros: (cen.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo, orden: c.orden })),
  };
}

type Catalogo = Awaited<ReturnType<typeof cargarCatalogoOficina>>;

export async function cargarEgresosOficina(catalogoDado?: Catalogo): Promise<EgresoOficina[]> {
  const [egresos, catalogo] = await Promise.all([
    // Por tandas: Oficina Central suma decenas de egresos al mes y pasa las 1000 filas.
    todasLasFilas<{
      id: string; categoria: string; centro_costo: string; fecha: string; proveedor: string | null;
      descripcion: string | null; documento: string | null; neto: number; iva: number; total: number;
      estado: string | null; observaciones: string | null;
    }>((d, h) =>
      supabase
        .from("egresos_oficina_central")
        .select("id, categoria, centro_costo, fecha, proveedor, descripcion, documento, neto, iva, total, estado, observaciones")
        .order("fecha", { ascending: false })
        .order("creado_en", { ascending: false })
        .order("id")
        .range(d, h),
    ),
    catalogoDado ?? cargarCatalogoOficina(),
  ]);
  if (egresos.error) throw new Error(egresos.error.message);
  const categorias = new Map(catalogo.categorias.map((c) => [c.id, c]));
  const centros = new Map(catalogo.centros.map((c) => [c.id, c]));
  return (egresos.data ?? []).map((fila) => ({
    ...fila,
    neto: Number(fila.neto),
    iva: Number(fila.iva),
    total: Number(fila.total),
    categoriaTitulo: categorias.get(fila.categoria)?.titulo ?? fila.categoria,
    esActivo: categorias.get(fila.categoria)?.esActivo ?? false,
    centroNombre: centros.get(fila.centro_costo)?.nombre ?? fila.centro_costo,
  })) as EgresoOficina[];
}

/** La pantalla de Oficina Central: egresos y catálogo en una sola carga. */
export async function cargarOficina() {
  const catalogo = await cargarCatalogoOficina();
  return { ...catalogo, egresos: await cargarEgresosOficina(catalogo) };
}

/** Identificador legible para una categoría o un centro nuevo: «Mantención 4x4» → «mantencion_4x4». */
export function idDesdeNombre(nombre: string) {
  return nombre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function totalOficina(filas: EgresoOficina[]) {
  return filas.reduce((total, fila) => total + fila.neto, 0);
}

/* ── Personal de Oficina Central ──────────────────────────────────────────── */

/**
 * La nómina de un mes del personal de Oficina Central. Es la misma ficha que
 * el personal de un contrato (`Haberes`, migración 0052): un registro por mes
 * con los totales, y el PDF de la nómina adjunto. `horas_extra_cantidad`,
 * `total_haberes` y `costo_total` los calcula la base.
 */
export type NominaOficina = Haberes & {
  id: string;
  /** ISO del primer día del mes: "2026-09-01". */
  periodo: string;
  dotacion: number;
  horas_hombre: number;
  horas_extra_cantidad: number;
  total_haberes: number;
  costo_total: number;
  observaciones: string | null;
};

const NUMERICAS = [
  "dotacion", "horas_hombre",
  "sueldo_bruto", "hh_reemplazo", "hh_parada_planta", "hh_feriado_compensado", "hh_apoyo_oficina", "hh_otras",
  "monto_hh_reemplazo", "monto_hh_parada_planta", "monto_hh_feriado_compensado", "monto_hh_apoyo_oficina", "monto_hh_otras",
  "horas_extra_monto", "total_no_imponible", "otros_haberes", "descuento_trabajador", "leyes_sociales", "aporte_patronal",
  "horas_extra_cantidad", "total_haberes", "costo_total",
] as const;

export async function cargarNominasOficina(): Promise<NominaOficina[]> {
  const { data, error } = await supabase
    .from("nominas_oficina_central")
    .select(`id, periodo, observaciones, otros_haberes_detalle, ${NUMERICAS.join(", ")}`)
    .order("periodo", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((n) => ({
    id: n.id as string,
    periodo: n.periodo as string,
    observaciones: (n.observaciones as string | null) ?? null,
    // Numeric de Postgres llega como texto: se convierte una vez acá.
    ...(Object.fromEntries(NUMERICAS.map((k) => [k, Number(n[k] ?? 0)])) as Record<(typeof NUMERICAS)[number], number>),
    otros_haberes_detalle: detalleDeOtrosHaberes(n.otros_haberes_detalle, Number(n.otros_haberes ?? 0)),
  }));
}
