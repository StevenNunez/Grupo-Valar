"use client";

import { supabase } from "../supabase";

/**
 * Autorización de compras por tramo de monto (migración 0127).
 *
 * Cada regla es una firma que se exige según el neto de la OC (desde / hasta),
 * para todos los contratos o algunos, y la puede dar cualquiera de sus
 * firmantes. La base decide todo —qué firmas faltan, quién puede darlas y si
 * la OC puede salir de borrador—; acá solo se muestra y se pide.
 */

export type Firmante = { id: string; nombre: string };

export type ReglaEnOrden = {
  id: string;
  titulo: string;
  desde: number;
  hasta: number | null;
  firmantes: Firmante[];
  firma: { usuarioId: string; nombre: string; en: string; monto: number } | null;
};

export type EventoAutorizacion = {
  accion: "solicitado" | "aprobado" | "rechazado" | "devuelto";
  nombre: string | null;
  cargo: string | null;
  monto: number | null;
  comentario: string | null;
  en: string;
};

export type AutorizacionOrden = {
  ordenId: string;
  estado: string;
  neto: number;
  requiere: boolean;
  completa: boolean;
  rechazada: { nombre: string | null; motivo: string | null; en: string } | null;
  pedidaEn: string | null;
  reglas: ReglaEnOrden[];
  puedoFirmar: boolean;
  puedoRechazar: boolean;
  puedoPedir: boolean;
  historial: EventoAutorizacion[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function leer(v: any): AutorizacionOrden {
  return {
    ordenId: v.orden_id,
    estado: v.estado,
    neto: Number(v.neto ?? 0),
    requiere: !!v.requiere,
    completa: !!v.completa,
    rechazada: v.rechazada ?? null,
    pedidaEn: v.pedida_en ?? null,
    reglas: (v.reglas ?? []).map((r: any) => ({
      id: r.id,
      titulo: r.titulo,
      desde: Number(r.desde ?? 0),
      hasta: r.hasta === null || r.hasta === undefined ? null : Number(r.hasta),
      firmantes: r.firmantes ?? [],
      firma: r.firma
        ? { usuarioId: r.firma.usuario_id, nombre: r.firma.nombre, en: r.firma.en, monto: Number(r.firma.monto ?? 0) }
        : null,
    })),
    puedoFirmar: !!v.puedo_firmar,
    puedoRechazar: !!v.puedo_rechazar,
    puedoPedir: !!v.puedo_pedir,
    historial: (v.historial ?? []).map((h: any) => ({
      accion: h.accion,
      nombre: h.nombre ?? null,
      cargo: h.cargo ?? null,
      monto: h.monto === null || h.monto === undefined ? null : Number(h.monto),
      comentario: h.comentario ?? null,
      en: h.en,
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function cargarAutorizacion(ordenId: string): Promise<AutorizacionOrden | null> {
  const { data, error } = await supabase.rpc("autorizacion_de_orden", { p_orden: ordenId });
  if (error) throw new Error(error.message);
  return data ? leer(data) : null;
}

export async function decidirCompra(
  ordenId: string,
  accion: "solicitado" | "aprobado" | "rechazado",
  comentario?: string,
): Promise<AutorizacionOrden | null> {
  const { data, error } = await supabase.rpc("decidir_compra", {
    p_orden: ordenId,
    p_accion: accion,
    p_comentario: comentario?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data ? leer(data) : null;
}

export type EstadoAutorizacion = {
  requiere: boolean;
  completa: boolean;
  rechazada: boolean;
  pedida: boolean;
  meToca: boolean;
};

/** Cómo va cada borrador de la lista. Sin la 0127 devuelve vacío y la lista sigue igual. */
export async function cargarEstadosAutorizacion(ordenIds: string[]): Promise<Record<string, EstadoAutorizacion>> {
  if (ordenIds.length === 0) return {};
  const { data, error } = await supabase.rpc("autorizacion_de_ordenes", { p_ordenes: ordenIds });
  if (error) return {};
  const fuera: Record<string, EstadoAutorizacion> = {};
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    fuera[f.orden_id as string] = {
      requiere: !!f.requiere,
      completa: !!f.completa,
      rechazada: !!f.rechazada,
      pedida: !!f.pedida,
      meToca: !!f.me_toca,
    };
  }
  return fuera;
}

/* ── Configuración ────────────────────────────────────────────────────────── */

export type ReglaCompra = {
  id: string;
  titulo: string;
  desde: number;
  hasta: number | null;
  /** null = todos los contratos. */
  contratos: string[] | null;
  firmantes: string[];
  activa: boolean;
  orden: number;
};

export async function cargarReglasCompra(): Promise<ReglaCompra[]> {
  const [reglas, firmantes] = await Promise.all([
    supabase
      .from("reglas_aprobacion")
      .select("id, titulo, monto_desde, monto_hasta, contratos, activa, orden")
      .eq("documento", "compra")
      .order("orden")
      .order("monto_desde"),
    supabase.from("reglas_aprobacion_firmantes").select("regla_id, usuario_id"),
  ]);
  if (reglas.error) throw new Error(reglas.error.message);
  if (firmantes.error) throw new Error(firmantes.error.message);
  const porRegla = new Map<string, string[]>();
  for (const f of (firmantes.data ?? []) as { regla_id: string; usuario_id: string }[]) {
    porRegla.set(f.regla_id, [...(porRegla.get(f.regla_id) ?? []), f.usuario_id]);
  }
  return ((reglas.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    titulo: (r.titulo as string | null) ?? (r.id as string),
    desde: Number(r.monto_desde ?? 0),
    hasta: r.monto_hasta === null ? null : Number(r.monto_hasta),
    contratos: (r.contratos as string[] | null) ?? null,
    firmantes: porRegla.get(r.id as string) ?? [],
    activa: !!r.activa,
    orden: Number(r.orden ?? 1),
  }));
}

export async function guardarReglaCompra(r: Omit<ReglaCompra, "id"> & { id?: string }) {
  const { error } = await supabase.rpc("guardar_regla_compra", {
    p_id: r.id ?? null,
    p_titulo: r.titulo,
    p_desde: Math.round(r.desde),
    p_hasta: r.hasta === null ? null : Math.round(r.hasta),
    p_contratos: r.contratos,
    p_firmantes: r.firmantes,
    p_activa: r.activa,
    p_orden: r.orden,
  });
  if (error) throw new Error(error.message);
}

export async function borrarReglaCompra(id: string) {
  const { error } = await supabase.rpc("borrar_regla_compra", { p_id: id });
  if (error) throw new Error(error.message);
}
