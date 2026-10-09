import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type Destinatario = { nombre: string; correo: string; cargo: string };

/**
 * Las personas de la empresa de quien envía, con su correo: a quiénes se puede
 * copiar una OC. "Dentro del grupo Valar" se cumple acá, en el servidor: la
 * pantalla ofrece esta lista y el envío rechaza cualquier copia que no esté
 * en ella.
 *
 * El correo vive en `auth.users`, que solo se lee con la clave de servicio; la
 * empresa se pregunta con la sesión de la persona, nunca se recibe.
 */
export async function destinatariosDeLaEmpresa(
  comoPersona: SupabaseClient,
  comoServicio: SupabaseClient,
): Promise<Destinatario[]> {
  const { data: empresa } = await comoPersona.rpc("empresa_actual");
  if (!empresa) return [];

  const { data: perfiles, error } = await comoServicio
    .from("perfiles")
    .select("id, nombre, cargo")
    .eq("empresa_id", empresa);
  if (error) throw new Error(error.message);

  const correos = new Map<string, string>();
  for (let pagina = 1; pagina <= 10; pagina++) {
    const { data, error: e } = await comoServicio.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (e) throw new Error(e.message);
    for (const u of data.users) if (u.email) correos.set(u.id, u.email.toLowerCase());
    if (data.users.length < 200) break;
  }

  return (perfiles ?? [])
    .filter((p) => correos.has(p.id))
    .map((p) => ({ nombre: p.nombre?.trim() || correos.get(p.id)!, correo: correos.get(p.id)!, cargo: p.cargo ?? "" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
