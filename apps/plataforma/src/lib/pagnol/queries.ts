import "server-only";

import { clientePagnol, PagnolNoConfigurado } from "./client";
import type { MaterialPagnol, ProveedorPagnol, Resultado } from "./tipos";

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
