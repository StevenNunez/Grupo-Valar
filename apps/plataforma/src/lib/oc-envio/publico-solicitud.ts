import "server-only";

import { supabaseDeServicio } from "@/lib/supabase-servidor";
import { huellaDe, pareceEnlace } from "./datos";
import type { ResumenSolicitud } from "./solicitud";

/**
 * Lo que ve el proveedor por el enlace de la solicitud. Sin sesión: el enlace
 * ES la llave, se busca por su huella con la clave de servicio, y lo que se
 * muestra sale de la foto guardada en el envío (nada de otras tablas).
 */

export type EnvioSolicitud = {
  id: string;
  enviadaEn: string;
  expiraEn: string;
  recibidaEn: string | null;
  recibidaPor: string | null;
  comentario: string | null;
};

export type ResultadoEnlaceSolicitud =
  | { estado: "ok"; envio: EnvioSolicitud; contenido: ResumenSolicitud }
  | { estado: "invalido" | "vencido" };

export async function abrirEnlaceSolicitud(
  token: string,
  { contarVista = false } = {},
): Promise<ResultadoEnlaceSolicitud> {
  const servicio = supabaseDeServicio();
  if (!servicio || !pareceEnlace(token)) return { estado: "invalido" };

  const { data: e } = await servicio
    .from("cotizaciones_envios")
    .select("*")
    .eq("token_hash", huellaDe(token))
    .maybeSingle();
  if (!e) return { estado: "invalido" };
  if (new Date(e.expira_en) < new Date()) return { estado: "vencido" };

  if (contarVista) {
    await servicio
      .from("cotizaciones_envios")
      .update({ vista_en: e.vista_en ?? new Date().toISOString(), vistas: (e.vistas ?? 0) + 1 })
      .eq("id", e.id);
  }

  return {
    estado: "ok",
    contenido: e.contenido as ResumenSolicitud,
    envio: {
      id: e.id,
      enviadaEn: e.enviada_en,
      expiraEn: e.expira_en,
      recibidaEn: e.recibida_en,
      recibidaPor: e.recibida_por,
      comentario: e.comentario,
    },
  };
}

/** «Recibí la solicitud». Puede repetirse: vale la última. */
export async function marcarRecibida(envio: EnvioSolicitud, datos: { nombre: string; comentario: string | null }) {
  const servicio = supabaseDeServicio()!;
  const { error } = await servicio
    .from("cotizaciones_envios")
    .update({ recibida_en: new Date().toISOString(), recibida_por: datos.nombre, comentario: datos.comentario })
    .eq("id", envio.id);
  if (error) throw new Error(error.message);
}
