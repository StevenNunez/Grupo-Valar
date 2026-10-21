"use client";

import { supabase } from "../supabase";
import type { ActivoPagnol, EnvioDeCompra, ExistenciasPagnol, MaterialPagnol, PanolPagnol, ProveedorPagnol, Resultado, ResumenEnvio } from "./tipos";

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

/* ── Fase 4: reposición ───────────────────────────────────────────────────── */

/** Reprocesa los avisos de stock bajo que quedaron en la bandeja. */
export const procesarReposicionPendiente = () =>
  llamar<{ ok: true; revisados: number; listos: number }>("/api/pagnol/reposicion/", "POST");

/* ── Catálogo de Pagnol en Artículos ──────────────────────────────────────── */

export const catalogoDePagnol = {
  materiales: () => llamar<Resultado<MaterialPagnol>>("/api/pagnol/catalogo/?recurso=materiales", "GET"),
  activos: () => llamar<Resultado<ActivoPagnol>>("/api/pagnol/catalogo/?recurso=activos", "GET"),
};

export const existenciasDeMaterial = (id: string) =>
  llamar<{ ok: true; existencias: ExistenciasPagnol }>(`/api/pagnol/existencias/?id=${encodeURIComponent(id)}`, "GET");

/* ── Compras directas (0090) ──────────────────────────────────────────────── */

async function llamarConCuerpo<T>(ruta: string, metodo: "POST", cuerpo: unknown): Promise<T | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch(ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: "No se pudo conectar con la plataforma para hablar con Pagnol." };
  }
}

type RespuestaCompra = { ok: true; resumen: ResumenEnvio; envios: EnvioDeCompra[] };

/** Una compra directa de un contrato, o un egreso de Oficina Central (0091). */
export type OrigenDeCompra = "compra" | "oficina";
const rutaDeCompra = (id: string, origen: OrigenDeCompra) =>
  `/api/pagnol/compras/${encodeURIComponent(id)}/${origen === "oficina" ? "?origen=oficina" : ""}`;

/** Qué se le informó a Pagnol de una compra directa. */
export const enviosDeCompraEnPagnol = (id: string, origen: OrigenDeCompra = "compra") =>
  llamar<{ ok: true; envios: EnvioDeCompra[] }>(rutaDeCompra(id, origen), "GET");

/** Informa líneas de una compra directa (o, sin líneas, reintenta lo pendiente). */
export const informarCompraAPagnol = (
  id: string,
  panolId: string | null,
  lineas: { material_id: string; cantidad: number; valor_unitario?: number; descripcion?: string }[],
  origen: OrigenDeCompra = "compra",
) => llamarConCuerpo<RespuestaCompra>(rutaDeCompra(id, origen), "POST", { panol_id: panolId, lineas });

/** Deshace en Pagnol lo informado de la compra (antes de borrarla). */
export const deshacerCompraConPagnol = (id: string, origen: OrigenDeCompra = "compra") =>
  llamar<{ ok: true }>(rutaDeCompra(id, origen), "DELETE");

/* ── Fase 5 · B: la OC como compra esperada ───────────────────────────────── */

/** Cómo está una OC frente a Pagnol (espejo de `AnuncioDeOrden`, lado servidor). */
export type AnuncioDeOrden = {
  estado: "sin_anunciar" | "pendiente" | "anunciada" | "cancelada" | "error";
  panolId: string | null;
  pagnolCompraId: string | null;
  error: string | null;
  anunciadaEn: string | null;
};

const rutaDeOrden = (id: string) => `/api/pagnol/ordenes/${encodeURIComponent(id)}/`;

/** El modo de recepción de la empresa y si la OC ya se anunció a Pagnol. */
export const estadoDeOrdenEnPagnol = (id: string) =>
  llamar<{ ok: true; modo: "externa" | "pagnol"; anuncio: AnuncioDeOrden }>(rutaDeOrden(id), "GET");

/** Anuncia la OC a Pagnol, o le manda lo que cambió si ya estaba anunciada. */
export const anunciarOrdenAPagnol = (id: string, panolId: string | null) =>
  llamarConCuerpo<{ ok: true; anuncio: AnuncioDeOrden; avisos: string[] }>(rutaDeOrden(id), "POST", { panol_id: panolId });

/** Cancela la compra esperada en Pagnol (lo ya recibido se queda). */
export const cancelarOrdenEnPagnol = (id: string) => llamar<{ ok: true }>(rutaDeOrden(id), "DELETE");
