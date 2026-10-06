import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase con la clave de SERVICIO: se salta RLS.
 *
 * Solo para lo que llega sin la sesión de ninguna persona —los webhooks de
 * Pagnol—, y solo desde el servidor (`server-only` rompe el build si un
 * componente del navegador lo importa). Todo lo que hace una persona va con
 * su propio token y pasa por RLS; esto no reemplaza eso.
 *
 * La clave vive en las variables del servidor (Vercel y .env.local), nunca
 * con prefijo NEXT_PUBLIC_.
 */
export function supabaseDeServicio(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
