import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Quién puede usar Pagnol a través de la plataforma.
 *
 * Las rutas de `/api/pagnol/` son públicas en la red: cualquiera puede
 * llamarlas. Por eso cada pedido trae el token de la sesión de Supabase
 * (`Authorization: Bearer …`) y acá se pregunta a Supabase, con ese token, si
 * es válido y si la persona entra a Abastecimiento: la misma regla que usa la
 * base en sus políticas. Sin esto, la llave de Pagnol quedaría al servicio de
 * cualquiera.
 */

/**
 * La conexión a Supabase CON EL TOKEN DE LA PERSONA, si entra a
 * Abastecimiento; null si no. Lo que se lea o escriba en las tablas de Valar
 * pasa por sus políticas RLS, igual que si lo hiciera desde la pantalla.
 */
export async function sesionDeAbastecimiento(pedido: Request): Promise<SupabaseClient | null> {
  const token = pedido.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario, error } = await supabase.auth.getUser(token);
  if (error || !usuario.user) return null;

  const { data: entra } = await supabase.rpc("entra_a", { modulo: "abastecimiento" });
  return entra === true ? supabase : null;
}

export async function puedeConsultarPagnol(pedido: Request): Promise<boolean> {
  return (await sesionDeAbastecimiento(pedido)) !== null;
}

/** Lo que se acepta del navegador: texto corto. */
export function parametrosDeBusqueda(pedido: Request) {
  const sp = new URL(pedido.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const cursor = sp.get("cursor") ?? undefined;
  return { q, cursor: cursor && cursor.length < 500 ? cursor : undefined };
}

export const SIN_ACCESO = { ok: false as const, error: "Tu sesión no permite usar Pagnol desde Abastecimiento." };
