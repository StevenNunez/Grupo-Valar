"use client";

import { supabase } from "./supabase";
import { traerTodo } from "./paginar";

/**
 * Los activos de la empresa (0096, 0109).
 *
 * Pagnol dice QUÉ activos existen y es la fuente de verdad. Valar guarda una fila
 * por cada uno en `activos_valar` con una copia mínima de cómo se ve allá (código,
 * nombre, estado, valor y fecha de compra) y lo que Pagnol no sabe y la gestión
 * necesita: para qué contrato se compró, dónde está hoy, de quién es y cuánto costó.
 *
 * La pantalla lee SOLO la vista `activos_vista` (de a 50, con búsqueda y totales en
 * la base): no le pregunta a Pagnol al abrir. La copia se corrige sola con los
 * avisos de Pagnol, o a pedido con «Actualizar desde Pagnol».
 *
 * Un activo recién llegado de Pagnol está «por identificar» hasta que alguien
 * confirma contrato de origen, ubicación y propiedad. El valor y la fecha que Valar
 * no haya puesto se toman de Pagnol.
 *
 * Lo comprado como «activo» que Pagnol no conoce (0100) también tiene su ficha:
 * una por línea de compra, que parte en Oficina Central y con el neto de la línea.
 */

export type Propiedad = "propio" | "arrendado" | "del_cliente";
export type Ubicacion = "oficina_central" | "contrato";

export const propiedades: { id: Propiedad; titulo: string }[] = [
  { id: "propio", titulo: "Propio" },
  { id: "arrendado", titulo: "Arrendado" },
  { id: "del_cliente", titulo: "Del cliente" },
];

export const estadosActivo: Record<string, string> = {
  operativo: "Operativo",
  en_mantencion: "En mantención",
  extraviado: "Extraviado",
  de_baja: "De baja",
};

export type ActivoFila = {
  /** Llave de la fila: el id de Pagnol, o `linea:<id>` si sale de una línea de compra. */
  clave: string;
  pagnolId: string | null;
  /** La línea de compra de la que sale, si Pagnol no lo conoce. */
  lineaId: string | null;
  codigo: string;
  nombre: string;
  estado: string;
  externalRef: string | null;
  /** Alguien ya confirmó su contrato de origen, ubicación y propiedad. */
  identificado: boolean;
  propiedad: Propiedad;
  /** Contrato para el que se compró (no cambia). */
  origen: string | null;
  /** El origen no lo puso nadie: salió de la orden de compra con la que llegó. */
  origenDeLaOrden: boolean;
  /** Dónde está hoy; nulo si todavía no se identificó. */
  ubicacion: Ubicacion | null;
  /** El contrato donde está, si `ubicacion` es `contrato`. */
  contratoUbicacion: string | null;
  /** Neto en CLP: el de Valar y, si no hay, el de Pagnol (o el de la línea de compra). */
  valor: number | null;
  valorDe: "valar" | "pagnol" | "compra" | null;
  fecha: string | null;
  observaciones: string;
};

/** Una fila de `activos_vista`. */
type FilaVista = {
  clave: string;
  pagnol_id: string | null;
  linea_id: string | null;
  codigo: string;
  nombre: string;
  estado: string;
  external_ref: string | null;
  identificado: boolean;
  propiedad: Propiedad;
  origen: string | null;
  origen_de_la_orden: boolean;
  ubicacion: Ubicacion | null;
  contrato_ubicacion: string | null;
  valor: number | string | null;
  valor_de: "valar" | "pagnol" | "compra" | null;
  fecha: string | null;
  observaciones: string;
};

const aFila = (r: FilaVista): ActivoFila => ({
  clave: r.clave,
  pagnolId: r.pagnol_id,
  lineaId: r.linea_id,
  codigo: r.codigo,
  nombre: r.nombre,
  estado: r.estado,
  externalRef: r.external_ref,
  identificado: r.identificado,
  propiedad: r.propiedad,
  origen: r.origen,
  origenDeLaOrden: r.origen_de_la_orden,
  ubicacion: r.ubicacion,
  contratoUbicacion: r.contrato_ubicacion,
  valor: r.valor == null ? null : Number(r.valor),
  valorDe: r.valor_de,
  fecha: r.fecha,
  observaciones: r.observaciones ?? "",
});

export const SIN_IDENTIFICAR = "sin_identificar";

export type FiltrosActivos = {
  texto: string;
  propiedad: "todos" | Propiedad;
  /** `todos`, `oficina_central`, `sin_identificar` o el id de un contrato. */
  donde: string;
  /** `todos`, `sin_identificar` (sin contrato de origen) o el id de un contrato. */
  origen: string;
};

/** Saca lo que rompería la sintaxis de `.or()` de PostgREST. */
const limpiarBusqueda = (t: string) => t.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();

function consulta(f: FiltrosActivos) {
  let q = supabase.from("activos_vista").select("*");
  if (f.propiedad !== "todos") q = q.eq("propiedad", f.propiedad);
  if (f.donde !== "todos") q = q.eq("lugar", f.donde);
  if (f.origen !== "todos") q = f.origen === SIN_IDENTIFICAR ? q.is("origen", null) : q.eq("origen", f.origen);
  const texto = limpiarBusqueda(f.texto);
  if (texto) {
    q = q.or(["codigo", "nombre", "observaciones", "origen", "contrato_ubicacion"].map((c) => `${c}.ilike.*${texto}*`).join(","));
  }
  // Lo más reciente primero; el desempate por clave mantiene estable el orden entre páginas.
  return q.order("fecha", { ascending: false, nullsFirst: false }).order("clave");
}

/** Una tanda de activos, con los filtros resueltos en la base. */
export async function cargarPaginaActivos(f: FiltrosActivos, desde: number, cuantos: number): Promise<ActivoFila[]> {
  const { data, error } = await consulta(f).range(desde, desde + cuantos - 1);
  if (error) throw new Error(mensajeDeVista(error.message));
  return (data as FilaVista[]).map(aFila);
}

/** TODOS los que cumplen los filtros: para elegirlos de golpe e identificarlos juntos. */
export async function cargarTodosLosActivos(f: FiltrosActivos): Promise<ActivoFila[]> {
  const filas = await traerTodo<FilaVista>((d, h) => consulta(f).range(d, h));
  return filas.map(aFila);
}

function mensajeDeVista(mensaje: string): string {
  return /activos_vista|resumen_activos/.test(mensaje) && /exist|schema cache/i.test(mensaje)
    ? "Falta aplicar la migración 0109 en la base."
    : mensaje;
}

export type ResumenActivos = {
  total: number;
  propios: number;
  arrendados: number;
  delCliente: number;
  patrimonio: number;
  conValor: number;
  sinValor: number;
  costoArriendos: number;
  porIdentificar: number;
  /** La última vez que se puso al día con Pagnol (de un aviso o de un «Actualizar»). */
  ultimaSync: string | null;
  completaSync: string | null;
  lugares: { id: string; cantidad: number; valor: number }[];
  origenes: { id: string; cantidad: number; valor: number; enOficina: number; enSuContrato: number; enOtro: number; sinUbicar: number }[];
};

type ResumenCrudo = {
  total: number;
  propios: number;
  arrendados: number;
  del_cliente: number;
  patrimonio: number | string;
  con_valor: number;
  sin_valor: number;
  costo_arriendos: number | string;
  por_identificar: number;
  ultima_sync: string | null;
  completa_sync: string | null;
  lugares: { id: string; cantidad: number; valor: number | string }[];
  origenes: { id: string; cantidad: number; valor: number | string; en_oficina: number; en_su_contrato: number; en_otro: number; sin_ubicar: number }[];
};

/** Las cifras de arriba: calculadas en la base sobre todos los activos, sin traerlos. */
export async function cargarResumenActivos(): Promise<ResumenActivos> {
  const { data, error } = await supabase.rpc("resumen_activos");
  if (error) throw new Error(mensajeDeVista(error.message));
  const r = data as ResumenCrudo;
  return {
    total: r.total,
    propios: r.propios,
    arrendados: r.arrendados,
    delCliente: r.del_cliente,
    patrimonio: Number(r.patrimonio),
    conValor: r.con_valor,
    sinValor: r.sin_valor,
    costoArriendos: Number(r.costo_arriendos),
    porIdentificar: r.por_identificar,
    ultimaSync: r.ultima_sync,
    completaSync: r.completa_sync,
    lugares: r.lugares.map((l) => ({ id: l.id, cantidad: l.cantidad, valor: Number(l.valor) })),
    origenes: r.origenes.map((o) => ({
      id: o.id,
      cantidad: o.cantidad,
      valor: Number(o.valor),
      enOficina: o.en_oficina,
      enSuContrato: o.en_su_contrato,
      enOtro: o.en_otro,
      sinUbicar: o.sin_ubicar,
    })),
  };
}

export type ResultadoSincronia = { ok: true; revisados: number; cambiados: number; modo: string } | { ok: false; error: string };

/** «Actualizar desde Pagnol»: un activo, lo que cambió desde la última vez, o todo. */
export async function actualizarDesdePagnol(modo: "uno" | "cambios" | "todo", id?: string): Promise<ResultadoSincronia> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch("/api/pagnol/activos/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ modo, id }),
    });
    return (await r.json()) as ResultadoSincronia;
  } catch {
    return { ok: false, error: "No se pudo conectar con la plataforma para actualizar desde Pagnol." };
  }
}

/** Lo que se puede cambiar: en una fila o en varias a la vez. Lo que no viene, queda como estaba. */
export type CambiosDeActivo = Partial<{
  propiedad: Propiedad;
  origen: string | null;
  ubicacion: Ubicacion;
  contratoUbicacion: string | null;
  valor: number | null;
  fecha: string | null;
  observaciones: string;
}>;

/** Guarda lo identificado de uno o varios activos (crea la fila de Valar si no existía). */
export async function guardarActivos(filas: ActivoFila[], c: CambiosDeActivo) {
  const filasNuevas = filas.map((f) => {
    const ubicacion = c.ubicacion ?? f.ubicacion ?? "oficina_central";
    const contratoUbicacion = ubicacion === "contrato" ? (c.contratoUbicacion !== undefined ? c.contratoUbicacion : f.contratoUbicacion) : null;
    if (ubicacion === "contrato" && !contratoUbicacion) {
      throw new Error("Elige en qué contrato están los activos.");
    }
    return {
      pagnol_activo_id: f.pagnolId,
      linea_id: f.lineaId,
      codigo: f.codigo,
      nombre: f.nombre,
      propiedad: c.propiedad ?? f.propiedad,
      contrato_origen_id: c.origen !== undefined ? c.origen : f.origen,
      ubicacion,
      contrato_ubicacion_id: contratoUbicacion,
      // El valor de Pagnol no se copia como propio: mientras Valar no ponga el suyo, manda el de Pagnol.
      valor: c.valor !== undefined ? c.valor : f.valorDe === "valar" ? f.valor : null,
      fecha_compra: c.fecha !== undefined ? c.fecha : f.fecha,
      observaciones: (c.observaciones !== undefined ? c.observaciones : f.observaciones).trim() || null,
      identificado: true,
    };
  });
  // Cada tipo de ficha tiene su propia llave de conflicto.
  const deLaPagnol = filasNuevas.filter((n) => n.pagnol_activo_id);
  const deLaCompra = filasNuevas.filter((n) => !n.pagnol_activo_id);
  if (deLaPagnol.length) {
    const { error } = await supabase.from("activos_valar").upsert(deLaPagnol, { onConflict: "empresa_id,pagnol_activo_id" });
    if (error) throw new Error(error.message);
  }
  if (deLaCompra.length) {
    const { error } = await supabase.from("activos_valar").upsert(deLaCompra, { onConflict: "empresa_id,linea_id" });
    if (error) throw new Error(error.message);
  }
}

/** ¿Suma al patrimonio? Los propios que no están dados de baja ni extraviados. */
export const sumaAlPatrimonio = (f: ActivoFila) => f.propiedad === "propio" && f.estado !== "de_baja" && f.estado !== "extraviado";
