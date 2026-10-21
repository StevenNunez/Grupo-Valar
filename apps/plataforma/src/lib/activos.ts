"use client";

import { catalogoDePagnol } from "./pagnol/navegador";
import { supabase } from "./supabase";

/**
 * Los activos de la empresa (0096).
 *
 * Pagnol dice QUÉ activos existen (código, nombre, estado, y a veces valor y
 * fecha) y es la fuente de verdad: no se duplica. Valar agrega lo que Pagnol no
 * sabe y la gestión necesita —para qué contrato se compró, dónde está hoy, de
 * quién es y cuánto costó— en `activos_valar`, una fila por activo.
 *
 * Un activo de Pagnol sin fila acá está «por identificar»: es lo que el usuario
 * va resolviendo. El valor y la fecha que Valar no haya puesto se toman de Pagnol.
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
  pagnolId: string;
  codigo: string;
  nombre: string;
  estado: string;
  externalRef: string | null;
  /** Ya tiene una fila en Valar. Sin ella, falta identificarlo. */
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
  /** Neto en CLP: el de Valar y, si no hay, el de Pagnol. */
  valor: number | null;
  valorDe: "valar" | "pagnol" | null;
  fecha: string | null;
  observaciones: string;
};

type FilaValar = {
  pagnol_activo_id: string;
  propiedad: Propiedad;
  contrato_origen_id: string | null;
  ubicacion: Ubicacion;
  contrato_ubicacion_id: string | null;
  valor: number | string | null;
  fecha_compra: string | null;
  observaciones: string | null;
};

const REF_OC = /^valar:oc:([^:]+):item:/;

/** Los arriendos de Pagnol no suman patrimonio: se sugiere «arrendado» hasta que alguien lo confirme. */
const pareceArriendo = (nombre: string) => /^\s*arriendo\b/i.test(nombre);

export async function cargarActivos(): Promise<ActivoFila[]> {
  const [pagnol, valar] = await Promise.all([
    catalogoDePagnol.activos(),
    supabase
      .from("activos_valar")
      .select("pagnol_activo_id, propiedad, contrato_origen_id, ubicacion, contrato_ubicacion_id, valor, fecha_compra, observaciones"),
  ]);
  if (!pagnol.ok) throw new Error(pagnol.error);
  if (valar.error) {
    throw new Error(/activos_valar/.test(valar.error.message) && /exist|schema cache/i.test(valar.error.message)
      ? "Falta aplicar la migración 0096 en la base."
      : valar.error.message);
  }
  const propias = new Map((valar.data as FilaValar[]).map((f) => [f.pagnol_activo_id, f]));

  // Lo que llegó con una OC de Valar ya sabe para qué contrato se compró.
  const ordenes = [...new Set(pagnol.datos.map((a) => REF_OC.exec(a.external_ref ?? "")?.[1]).filter((x): x is string => !!x))];
  const contratoDeLaOrden = new Map<string, string>();
  if (ordenes.length) {
    const { data } = await supabase.from("ordenes_compra_proveedor").select("id, contrato_id").in("id", ordenes);
    for (const o of data ?? []) contratoDeLaOrden.set(o.id as string, o.contrato_id as string);
  }

  return pagnol.datos.map((a) => {
    const v = propias.get(a.id);
    const deLaOrden = contratoDeLaOrden.get(REF_OC.exec(a.external_ref ?? "")?.[1] ?? "") ?? null;
    const valorValar = v?.valor == null ? null : Number(v.valor);
    const valorPagnol = a.valor_compra == null ? null : Number(a.valor_compra);
    return {
      pagnolId: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      estado: a.estado,
      externalRef: a.external_ref,
      identificado: !!v,
      propiedad: v?.propiedad ?? (pareceArriendo(a.nombre) ? "arrendado" : "propio"),
      origen: v?.contrato_origen_id ?? deLaOrden,
      origenDeLaOrden: !v?.contrato_origen_id && !!deLaOrden,
      ubicacion: v?.ubicacion ?? null,
      contratoUbicacion: v?.contrato_ubicacion_id ?? null,
      valor: valorValar ?? valorPagnol,
      valorDe: valorValar != null ? "valar" : valorPagnol != null ? "pagnol" : null,
      fecha: v?.fecha_compra ?? a.fecha_compra ?? null,
      observaciones: v?.observaciones ?? "",
    } satisfies ActivoFila;
  });
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
      codigo: f.codigo,
      nombre: f.nombre,
      propiedad: c.propiedad ?? f.propiedad,
      contrato_origen_id: c.origen !== undefined ? c.origen : f.origen,
      ubicacion,
      contrato_ubicacion_id: contratoUbicacion,
      // El valor de Pagnol no se copia: mientras Valar no ponga el suyo, manda el de Pagnol.
      valor: c.valor !== undefined ? c.valor : f.valorDe === "valar" ? f.valor : null,
      fecha_compra: c.fecha !== undefined ? c.fecha : f.fecha,
      observaciones: (c.observaciones !== undefined ? c.observaciones : f.observaciones).trim() || null,
    };
  });
  const { error } = await supabase.from("activos_valar").upsert(filasNuevas, { onConflict: "empresa_id,pagnol_activo_id" });
  if (error) throw new Error(error.message);
}

/** ¿Suma al patrimonio? Los propios que no están dados de baja ni extraviados. */
export const sumaAlPatrimonio = (f: ActivoFila) => f.propiedad === "propio" && f.estado !== "de_baja" && f.estado !== "extraviado";
