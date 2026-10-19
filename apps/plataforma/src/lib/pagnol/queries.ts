import "server-only";

import { clientePagnol, PagnolNoConfigurado } from "./client";
import type { ActivoPagnol, ExistenciasPagnol, MaterialPagnol, ProveedorPagnol, Resultado } from "./tipos";

/**
 * Lo que la plataforma le pregunta a Pagnol. Cada función devuelve el
 * resultado o un error ya escrito para la pantalla: Pagnol caído o lento no
 * puede romper la página que lo consulta.
 */

/** Cuántos trae cada búsqueda. El contrato permite hasta 100. */
const POR_PAGINA = 25;

function mensajeDeError(estado: number | null, e?: unknown): string {
  if (e instanceof PagnolNoConfigurado) return "La conexión con Pagnol todavía no está configurada en el servidor.";
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return "Pagnol no respondió a tiempo. Intenta de nuevo en un momento.";
  }
  switch (estado) {
    case 401:
      return "Pagnol rechazó la llave de acceso. Hay que revisarla en la configuración del servidor.";
    case 403:
      return "La llave de Pagnol no tiene permiso para esta consulta.";
    case 429:
      return "Se hicieron demasiadas consultas a Pagnol seguidas. Espera unos segundos.";
    case null:
      return "No se pudo conectar con Pagnol. Revisa la conexión e intenta de nuevo.";
    default:
      return "Pagnol tuvo un problema al responder. Intenta de nuevo en un momento.";
  }
}

export async function buscarMateriales(q: string, cursor?: string): Promise<Resultado<MaterialPagnol>> {
  try {
    const { data, error, response } = await clientePagnol("pagnol:materiales").GET("/materiales", {
      params: { query: { q: q || undefined, limit: POR_PAGINA, cursor } },
    });
    if (error || !data) return { ok: false, error: mensajeDeError(response.status) };
    return { ok: true, datos: data.data, siguiente: data.next_cursor };
  } catch (e) {
    return { ok: false, error: mensajeDeError(null, e) };
  }
}

export async function buscarProveedores(q: string, cursor?: string): Promise<Resultado<ProveedorPagnol>> {
  try {
    const { data, error, response } = await clientePagnol("pagnol:proveedores").GET("/proveedores", {
      params: { query: { q: q || undefined, limit: POR_PAGINA, cursor } },
    });
    if (error || !data) return { ok: false, error: mensajeDeError(response.status) };
    return { ok: true, datos: data.data, siguiente: data.next_cursor };
  } catch (e) {
    return { ok: false, error: mensajeDeError(null, e) };
  }
}

/**
 * Todo el catálogo de un recurso, para las pantallas que filtran en el
 * navegador (Artículos). Valar tiene cientos de filas, no miles: se trae en
 * páginas de 100 y se guarda en la caché con el tag del recurso, que el
 * webhook limpia cuando algo cambia en Pagnol.
 */
const PAGINAS_MAXIMAS = 30;

async function todasLasPaginas<T>(
  tag: "pagnol:materiales" | "pagnol:activos",
  pedir: (cursor: string | undefined) => Promise<{ data?: { data: T[]; next_cursor: string | null }; estado: number }>,
): Promise<Resultado<T>> {
  try {
    const filas: T[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina += 1) {
      const { data, estado } = await pedir(cursor);
      if (!data) return { ok: false, error: mensajeDeError(estado) };
      filas.push(...data.data);
      if (!data.next_cursor) return { ok: true, datos: filas, siguiente: null };
      cursor = data.next_cursor;
    }
    return { ok: true, datos: filas, siguiente: cursor ?? null };
  } catch (e) {
    return { ok: false, error: mensajeDeError(null, e) };
  }
}

export const todosLosMateriales = () =>
  todasLasPaginas<MaterialPagnol>("pagnol:materiales", async (cursor) => {
    const { data, response } = await clientePagnol("pagnol:materiales", 120).GET("/materiales", { params: { query: { limit: 100, cursor } } });
    return { data, estado: response.status };
  });

export const todosLosActivos = () =>
  todasLasPaginas<ActivoPagnol>("pagnol:activos", async (cursor) => {
    const { data, response } = await clientePagnol("pagnol:activos", 120).GET("/activos", { params: { query: { limit: 100, cursor } } });
    return { data, estado: response.status };
  });

/** Dónde está el stock de un material: por pañol y contrato. */
export async function existenciasDe(id: string): Promise<{ ok: true; existencias: ExistenciasPagnol } | { ok: false; error: string }> {
  try {
    const { data, response } = await clientePagnol("pagnol:materiales", 60).GET("/materiales/{id}/existencias", { params: { path: { id } } });
    if (!data) return { ok: false, error: mensajeDeError(response.status) };
    return { ok: true, existencias: data };
  } catch (e) {
    return { ok: false, error: mensajeDeError(null, e) };
  }
}
