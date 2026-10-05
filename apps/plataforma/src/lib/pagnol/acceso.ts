import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Quién puede consultar Pagnol a través de la plataforma.
 *
 * Las rutas de `/api/pagnol/` son públicas en la red: cualquiera puede
 * llamarlas. Por eso cada pedido trae el token de la sesión de Supabase
 * (`Authorization: Bearer …`) y acá se pregunta a Supabase, con ese token, si
 * es válido y si la persona entra a Abastecimiento: la misma regla que usa la
 * base en sus políticas. Sin esto, la llave de Pagnol quedaría al servicio de
 * cualquiera.
 */
export async function puedeConsultarPagnol(pedido: Request): Promise<boolean> {
  const token = pedido.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return false;

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario, error } = await supabase.auth.getUser(token);
  if (error || !usuario.user) return false;

  const { data: entra } = await supabase.rpc("entra_a", { modulo: "abastecimiento" });
  return entra === true;
}

/** Lo que se acepta del navegador: texto corto. */
export function parametrosDeBusqueda(pedido: Request) {
  const sp = new URL(pedido.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const cursor = sp.get("cursor") ?? undefined;
  return { q, cursor: cursor && cursor.length < 500 ? cursor : undefined };
}
