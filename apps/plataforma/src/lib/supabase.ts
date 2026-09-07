import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el navegador.
 *
 * La clave que va acá es la *publishable* (anon), y es pública a propósito:
 * viaja dentro del bundle porque la app es un export estático. Lo que impide
 * que alguien lea datos con ella son las políticas RLS de Postgres
 * (ver `supabase/migraciones/`), no el secreto de la clave.
 *
 * La clave `service_role` NO va nunca acá: se salta RLS y solo se usa desde
 * scripts locales (ver `scripts/sembrar-demo.mjs`).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Con `output: "export"` estos valores se incrustan en el build. Si faltan, el
// error tiene que salir acá y no como un "fetch failed" incomprensible después.
if (!url || !anonKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Van en apps/plataforma/.env.local (no en la raíz del repo: Next solo " +
      "lee el .env.local de la carpeta de cada app).",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // La sesión vive en localStorage y se renueva sola. No hay servidor que
    // pueda guardarla en una cookie: la app es estática.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
