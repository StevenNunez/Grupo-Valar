import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Las firmas que lleva una orden de compra (0095).
 *
 *   emite      la de quien la envía al proveedor
 *   autoriza   la de quien la empresa designó para autorizar (`empresas.autoriza_ordenes_usuario_id`)
 *
 * Se leen con la clave de servicio —la tabla es solo de su dueña— y solo de
 * personas de la MISMA empresa que la orden. Una firma que falta no es un
 * error: la raya queda en blanco, como siempre. Nada de esto sale del PDF.
 */

export type FirmasDeOrden = {
  emite: Uint8Array | null;
  autoriza: Uint8Array | null;
  /** El nombre de quien autoriza, si hay firma suya: sustituye al representante legal impreso. */
  autorizaNombre: string | null;
};

const SIN_FIRMAS: FirmasDeOrden = { emite: null, autoriza: null, autorizaNombre: null };

function aBytes(imagen: unknown): Uint8Array | null {
  if (typeof imagen !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imagen);
  return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
}

export async function cargarFirmasDeOrden(servicio: SupabaseClient, empresaId: string, emiteUsuarioId: string | null): Promise<FirmasDeOrden> {
  try {
    const { data: empresa } = await servicio.from("empresas").select("autoriza_ordenes_usuario_id").eq("id", empresaId).maybeSingle();
    const autorizaId = (empresa?.autoriza_ordenes_usuario_id as string | null | undefined) ?? null;
    const ids = [...new Set([emiteUsuarioId, autorizaId].filter((x): x is string => !!x))];
    if (!ids.length) return SIN_FIRMAS;

    // Solo personas de esta empresa: una firma de otra no se estampa aquí.
    const { data: personas } = await servicio.from("perfiles").select("id, nombre").eq("empresa_id", empresaId).in("id", ids);
    const deLaEmpresa = new Map((personas ?? []).map((p) => [p.id as string, (p.nombre as string | null) ?? null]));
    const validos = ids.filter((i) => deLaEmpresa.has(i));
    if (!validos.length) return SIN_FIRMAS;

    const { data: firmas } = await servicio.from("firmas").select("usuario_id, imagen").in("usuario_id", validos);
    const imagen = new Map((firmas ?? []).map((f) => [f.usuario_id as string, aBytes(f.imagen)]));

    const autoriza = autorizaId ? imagen.get(autorizaId) ?? null : null;
    return {
      emite: emiteUsuarioId ? imagen.get(emiteUsuarioId) ?? null : null,
      autoriza,
      autorizaNombre: autoriza && autorizaId ? deLaEmpresa.get(autorizaId) ?? null : null,
    };
  } catch {
    // Sin la 0095 (o si la lectura falla) el PDF sale como antes: sin firmas dibujadas.
    return SIN_FIRMAS;
  }
}
