"use client";

import { supabase } from "./supabase";

/**
 * Bitácora de cambios. Solo se lee: la escriben los triggers de la base.
 */

export type Accion = "creado" | "modificado" | "eliminado";

export type Cambio = {
  campo: string;
  antes: unknown;
  despues: unknown;
};

export type Movimiento = {
  id: number;
  tabla: string;
  registroId: string;
  accion: Accion;
  usuario: string;
  cambios: Cambio[];
  ocurridoEn: string;
};

type FilaAuditoria = {
  id: number;
  tabla: string;
  registro_id: string;
  accion: Accion;
  usuario: string;
  cambios: Record<string, { antes: unknown; despues: unknown }> | null;
  ocurrido_en: string;
};

function mapear(f: FilaAuditoria): Movimiento {
  return {
    id: f.id,
    tabla: f.tabla,
    registroId: f.registro_id,
    accion: f.accion,
    usuario: f.usuario,
    cambios: Object.entries(f.cambios ?? {}).map(([campo, v]) => ({
      campo,
      antes: v.antes,
      despues: v.despues,
    })),
    ocurridoEn: f.ocurrido_en,
  };
}

/** Historial de un registro concreto. */
export async function cargarHistorial(tabla: string, registroId: string) {
  const { data, error } = await supabase
    .from("auditoria_reciente")
    .select("*")
    .eq("tabla", tabla)
    .eq("registro_id", registroId)
    .limit(50);

  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaAuditoria[]).map(mapear);
}

/** Últimos movimientos de todo el módulo. */
export async function cargarMovimientos(limite = 100) {
  const { data, error } = await supabase
    .from("auditoria_reciente")
    .select("*")
    .limit(limite);

  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaAuditoria[]).map(mapear);
}
