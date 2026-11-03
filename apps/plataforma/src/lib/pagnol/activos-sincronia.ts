import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clientePagnolFresco, PagnolNoConfigurado } from "./client";
import type { ActivoPagnol } from "./tipos";

/**
 * Pone al día la lista de activos de Valar con lo que Pagnol tiene (0109).
 *
 * Pagnol manda: acá solo se corrige la copia (código, nombre, estado, valor y
 * fecha de compra) y se agregan los activos que todavía no estaban. Lo que Valar
 * sabe —contrato de origen, ubicación, propiedad, valor propio— no se toca. Quien
 * hace el trabajo es `sincronizar_activos_pagnol` en la base.
 *
 * Tres maneras de pedirlo:
 *   · `uno`      un activo (el botón de cada fila).
 *   · `cambios`  solo lo que Pagnol cambió desde la última vez (`updated_since`).
 *   · `todo`     todo el catálogo, de 100 en 100: la primera vez o para repasar.
 *
 * Los avisos `activo.*` de Pagnol usan `aplicarActivos` con el activo que llega.
 */

export type ModoSincronia = "uno" | "cambios" | "todo";

export type ResultadoSincronia =
  | { ok: true; revisados: number; cambiados: number; modo: ModoSincronia }
  | { ok: false; error: string };

const POR_PAGINA = 100;
/** 100 por página → 10.000 activos. Pasado eso se corta y se avisa, no se cuelga. */
const PAGINAS_MAXIMAS = 100;

function mensaje(estado: number | null, e?: unknown): string {
  if (e instanceof PagnolNoConfigurado) return "La conexión con Pagnol todavía no está configurada en el servidor.";
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) return "Pagnol no respondió a tiempo. Intenta de nuevo en un momento.";
  if (estado === 401 || estado === 403) return "Pagnol rechazó la llave de acceso. Hay que revisarla en el servidor.";
  if (estado === 404) return "Pagnol no tiene ese activo.";
  if (estado === 429) return "Se hicieron demasiadas consultas a Pagnol seguidas. Espera unos segundos.";
  return "No se pudo consultar Pagnol. Intenta de nuevo en un momento.";
}

/** Aplica activos ya leídos (de una página o de un aviso) a la lista de la empresa. */
export async function aplicarActivos(sb: SupabaseClient, empresa: string, activos: unknown[], completa = false): Promise<number> {
  const { data, error } = await sb.rpc("sincronizar_activos_pagnol", { p_empresa: empresa, p_activos: activos, p_completa: completa });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function sincronizarActivos(
  sb: SupabaseClient,
  empresa: string,
  modo: ModoSincronia,
  id?: string,
): Promise<ResultadoSincronia> {
  try {
    const pagnol = clientePagnolFresco();

    if (modo === "uno") {
      if (!id) return { ok: false, error: "Falta el activo." };
      const { data, response } = await pagnol.GET("/activos/{id}", { params: { path: { id } } });
      if (!data) return { ok: false, error: mensaje(response.status) };
      return { ok: true, revisados: 1, cambiados: await aplicarActivos(sb, empresa, [data]), modo };
    }

    // «cambios» parte de lo último que Pagnol cambió y ya tenemos. Sin nada guardado, es «todo».
    let desde: string | undefined;
    let efectivo: ModoSincronia = modo;
    if (modo === "cambios") {
      const { data: ultimo } = await sb
        .from("activos_valar")
        .select("pagnol_actualizado_en")
        .eq("empresa_id", empresa)
        .not("pagnol_actualizado_en", "is", null)
        .order("pagnol_actualizado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      desde = (ultimo?.pagnol_actualizado_en as string | undefined) ?? undefined;
      if (!desde) efectivo = "todo";
    }

    let revisados = 0;
    let cambiados = 0;
    let cursor: string | undefined;
    for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina += 1) {
      const { data, response } = await pagnol.GET("/activos", {
        params: { query: { limit: POR_PAGINA, cursor, ...(desde ? { updated_since: desde } : {}) } },
      });
      if (!data) return { ok: false, error: mensaje(response.status) };
      revisados += data.data.length;
      cambiados += await aplicarActivos(sb, empresa, data.data as ActivoPagnol[]);
      if (!data.next_cursor) {
        // Terminó: queda anotado cuándo, y si fue un repaso completo.
        await aplicarActivos(sb, empresa, [], efectivo === "todo");
        return { ok: true, revisados, cambiados, modo: efectivo };
      }
      cursor = data.next_cursor;
    }
    return { ok: false, error: "Hay más de 10.000 activos en Pagnol: la sincronización se detuvo a mitad. Avisa a soporte." };
  } catch (e) {
    return { ok: false, error: mensaje(null, e) };
  }
}
