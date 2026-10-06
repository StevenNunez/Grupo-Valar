"use client";

import { supabase } from "../supabase";
import type { MaterialPagnol, PanolPagnol, ProveedorPagnol, Resultado, ResumenEnvio } from "./tipos";

/**
 * El lado del navegador de la búsqueda en Pagnol. No habla con Pagnol: habla
 * con `/api/pagnol/…` de la plataforma, que tiene la llave. Manda el token de
 * la sesión para que esa ruta sepa quién pregunta.
 *
 * Nunca lanza: si algo falla devuelve un error escrito para la pantalla.
 */
async function buscar<T>(recurso: "materiales" | "proveedores", q: string, senal?: AbortSignal): Promise<Resultado<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    // Con barra final: la plataforma redirige las URL sin ella.
    const r = await fetch(`/api/pagnol/${recurso}/?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: senal,
    });
    return (await r.json()) as Resultado<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, error: "No se pudo consultar Pagnol. Revisa la conexión." };
  }
}

export const buscarMaterialesEnPagnol = (q: string, senal?: AbortSignal) => buscar<MaterialPagnol>("materiales", q, senal);
export const buscarProveedoresEnPagnol = (q: string, senal?: AbortSignal) => buscar<ProveedorPagnol>("proveedores", q, senal);

/* ── Fase 2: lo recibido se informa a Pagnol ──────────────────────────────── */

async function llamar<T>(ruta: string, metodo: "GET" | "POST" | "DELETE"): Promise<T | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch(ruta, { method: metodo, headers: { Authorization: `Bearer ${token}` } });
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: "No se pudo conectar con la plataforma para hablar con Pagnol." };
  }
}

export const listarPanolesDePagnol = () =>
  llamar<{ ok: true; datos: PanolPagnol[] }>("/api/pagnol/panoles/", "GET");

/** Informa (o reintenta) lo recibido en una recepción. */
export const informarRecepcionAPagnol = (recepcionId: string) =>
  llamar<{ ok: true; resumen: ResumenEnvio }>(`/api/pagnol/recepciones/${recepcionId}/`, "POST");

/** Anula la recepción: primero en Pagnol, después en Valar. */
export const anularRecepcionConPagnol = (recepcionId: string) =>
  llamar<{ ok: true }>(`/api/pagnol/recepciones/${recepcionId}/`, "DELETE");
