"use client";

import { supabase } from "../supabase";

/* ── Aprobaciones ─────────────────────────────────────────────────────────── */

export type Aprobacion = {
  id: number;
  documento: string;
  registroId: string;
  monto: number | null;
  accion: "aprobado" | "rechazado" | "devuelto";
  usuarioNombre: string | null;
  usuarioCargo: string | null;
  usuarioRol: string | null;
  comentario: string | null;
  ocurridoEn: string;
};

export async function cargarAprobaciones(documento: string, registroId: string) {
  const { data, error } = await supabase
    .from("aprobaciones")
    .select("*")
    .eq("documento", documento)
    .eq("registro_id", registroId)
    .order("ocurrido_en", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: Number(f.id),
    documento: f.documento as string,
    registroId: f.registro_id as string,
    monto: f.monto === null ? null : Number(f.monto),
    accion: f.accion as Aprobacion["accion"],
    usuarioNombre: (f.usuario_nombre as string | null) ?? null,
    usuarioCargo: (f.usuario_cargo as string | null) ?? null,
    usuarioRol: (f.usuario_rol as string | null) ?? null,
    comentario: (f.comentario as string | null) ?? null,
    ocurridoEn: f.ocurrido_en as string,
  })) as Aprobacion[];
}

/**
 * Firma un documento.
 *
 * El usuario no viaja como dato de confianza: RLS exige que `usuario_id` sea
 * `auth.uid()` y que el rol pueda aprobar. El nombre y el cargo van copiados
 * para que la firma sobreviva al borrado de la cuenta.
 */
export async function firmar({
  documento,
  registroId,
  monto,
  accion,
  usuario,
  comentario,
}: {
  documento: "solped" | "compra";
  registroId: string;
  monto: number | null;
  accion: Aprobacion["accion"];
  usuario: { id: string; nombre: string; cargo: string; rol: string };
  comentario?: string;
}) {
  const { error } = await supabase.from("aprobaciones").insert({
    documento,
    registro_id: registroId,
    monto,
    accion,
    usuario_id: usuario.id,
    usuario_nombre: usuario.nombre,
    usuario_cargo: usuario.cargo,
    usuario_rol: usuario.rol,
    comentario: comentario?.trim() || null,
  });

  if (error) {
    if (/violates row-level security/i.test(error.message)) {
      throw new Error(
        "Tu cuenta no puede autorizar. Se necesita rol de administrador de contrato o de gerencia.",
      );
    }
    throw new Error(error.message);
  }
}

/** Qué roles tienen que firmar un documento de este monto, según las reglas. */
export async function aprobadoresRequeridos(documento: "solped" | "compra", monto: number) {
  const { data, error } = await supabase
    .from("reglas_aprobacion")
    .select("rol, monto_desde, monto_hasta, orden")
    .eq("documento", documento)
    .eq("activa", true)
    .order("orden");

  if (error) return [];

  return (data ?? [])
    .filter(
      (r: Record<string, unknown>) =>
        monto >= Number(r.monto_desde) &&
        (r.monto_hasta === null || monto <= Number(r.monto_hasta)),
    )
    .map((r: Record<string, unknown>) => r.rol as string);
}

