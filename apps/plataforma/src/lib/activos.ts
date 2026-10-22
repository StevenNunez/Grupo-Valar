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
  /** Neto en CLP: el de Valar y, si no hay, el de Pagnol (o el de la línea de compra). */
  valor: number | null;
  valorDe: "valar" | "pagnol" | "compra" | null;
  fecha: string | null;
  observaciones: string;
};

type FilaValar = {
  pagnol_activo_id: string | null;
  linea_id: string | null;
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
      .select("pagnol_activo_id, linea_id, propiedad, contrato_origen_id, ubicacion, contrato_ubicacion_id, valor, fecha_compra, observaciones"),
  ]);
  if (!pagnol.ok) throw new Error(pagnol.error);
  if (valar.error) {
    throw new Error(/activos_valar/.test(valar.error.message) && /exist|schema cache/i.test(valar.error.message)
      ? "Falta aplicar la migración 0096 en la base."
      : valar.error.message);
  }
  const filasValar = valar.data as FilaValar[];
  const propias = new Map(filasValar.filter((f) => f.pagnol_activo_id).map((f) => [f.pagnol_activo_id as string, f]));
  const deLineas = new Map(filasValar.filter((f) => f.linea_id).map((f) => [f.linea_id as string, f]));

  // Lo que llegó con una OC de Valar ya sabe para qué contrato se compró.
  const ordenes = [...new Set(pagnol.datos.map((a) => REF_OC.exec(a.external_ref ?? "")?.[1]).filter((x): x is string => !!x))];
  const contratoDeLaOrden = new Map<string, string>();
  if (ordenes.length) {
    const { data } = await supabase.from("ordenes_compra_proveedor").select("id, contrato_id").in("id", ordenes);
    for (const o of data ?? []) contratoDeLaOrden.set(o.id as string, o.contrato_id as string);
  }

  // Las líneas «activo» que ya llegaron a Pagnol (su ref lleva el id de la línea) no se repiten.
  const refs = pagnol.datos.map((a) => a.external_ref ?? "");
  const { data: lineas, error: errorLineas } = await supabase
    .from("costos_unificados")
    .select("id, contrato_id, fecha, tercero, detalle, neto")
    .eq("es_activo", true);
  if (errorLineas) throw new Error(errorLineas.message);
  const deCompras = (lineas ?? [])
    .filter((l) => !refs.some((r) => r.includes(`:item:${l.id}`)))
    .map((l) => {
      const v = deLineas.get(l.id as string);
      const neto = Number(l.neto);
      const valorValar = v?.valor == null ? null : Number(v.valor);
      return {
        clave: `linea:${l.id}`,
        pagnolId: null,
        lineaId: l.id as string,
        codigo: `Compra a ${l.tercero ?? "proveedor"}`,
        nombre: (l.detalle as string) || "Activo comprado",
        estado: "operativo",
        externalRef: null,
        identificado: !!v,
        propiedad: v?.propiedad ?? "propio",
        origen: v?.contrato_origen_id ?? (l.contrato_id as string | null),
        origenDeLaOrden: !v?.contrato_origen_id,
        // Un activo gastado en un contrato ya es de la empresa: parte en Oficina Central (0099).
        ubicacion: v?.ubicacion ?? "oficina_central",
        contratoUbicacion: v?.contrato_ubicacion_id ?? null,
        valor: valorValar ?? neto,
        valorDe: valorValar != null ? "valar" : "compra",
        fecha: v?.fecha_compra ?? (l.fecha as string | null),
        observaciones: v?.observaciones ?? "",
      } satisfies ActivoFila;
    });

  const deP = pagnol.datos.map((a) => {
    const v = propias.get(a.id);
    const deLaOrden = contratoDeLaOrden.get(REF_OC.exec(a.external_ref ?? "")?.[1] ?? "") ?? null;
    const valorValar = v?.valor == null ? null : Number(v.valor);
    const valorPagnol = a.valor_compra == null ? null : Number(a.valor_compra);
    return {
      clave: a.id,
      pagnolId: a.id,
      lineaId: null,
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
  return [...deP, ...deCompras];
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
      // El valor de Pagnol no se copia: mientras Valar no ponga el suyo, manda el de Pagnol.
      valor: c.valor !== undefined ? c.valor : f.valorDe === "valar" ? f.valor : null,
      fecha_compra: c.fecha !== undefined ? c.fecha : f.fecha,
      observaciones: (c.observaciones !== undefined ? c.observaciones : f.observaciones).trim() || null,
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
