import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { siguienteNumero } from "./reposicion";

/**
 * Fase 5 · C: las solicitudes de compra de Pagnol llegan a Valar por webhook.
 *
 *   solicitud_compra.creada     → informativa: aún puede ser revisada o rechazada
 *   solicitud_compra.aprobada   → completó revisión y autorización: se arma una
 *                                 SOLPED en borrador con las líneas `autorizada`
 *   solicitud_compra.rechazada  → no queda ninguna línea viva: se cierra la SOLPED
 *
 * Las líneas de Pagnol son texto libre (no apuntan al catálogo), así que la
 * SOLPED las recibe sin `pagnol_material_id`; Abastecimiento las vincula si quiere.
 * Cada evento sale a lo más una vez por solicitud, y un reenvío no duplica nada
 * (índice único `solped_pagnol_solicitud_unica`).
 *
 * El contrato de Pagnol se asocia a uno de Valar por su UUID (`pagnol_contratos`).
 * Si no está asociado —o el aviso no trae contrato—, devuelve el motivo y el aviso
 * queda en la bandeja hasta que una persona elija el contrato.
 *
 * Corre con la clave de servicio: todo lo que inserta lleva `empresa_id` explícito.
 */

type LineaSolicitud = {
  id?: string;
  descripcion?: string;
  categoria?: string | null;
  tipo?: "producto" | "servicio";
  cantidad?: number;
  unidad?: string | null;
  estado?: "pendiente" | "autorizada" | "rechazada";
};

export type DatosSolicitud = {
  id?: string;
  codigo?: string;
  estado?: string;
  solicitante?: { nombre?: string } | null;
  contrato?: { id?: string; nombre?: string } | null;
  area?: string | null;
  motivo?: string | null;
  prioridad?: "normal" | "urgente";
  motivo_urgencia?: string | null;
  necesaria_para?: string | null;
  lineas?: LineaSolicitud[];
  motivo_rechazo?: string | null;
};

export type AvisoSolicitud = {
  webhook_id: string;
  empresa_id: string | null;
  tipo: string;
  payload: { data?: DatosSolicitud };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}/;

/** Estados desde los que Valar todavía puede cerrar la solicitud por un rechazo de Pagnol. */
const CERRABLES = ["borrador", "en-aprobacion", "aprobada"];

/**
 * Procesa un aviso de solicitud. Devuelve null si quedó resuelto, o el motivo
 * por el que queda en la bandeja. Se puede repetir sin duplicar.
 *
 * `contratoElegido` es el contrato de Valar que una persona eligió para este
 * aviso en la bandeja; si el aviso trae el contrato de Pagnol, esa elección
 * se recuerda para las próximas solicitudes.
 */
export async function procesarSolicitud(sb: SupabaseClient, aviso: AvisoSolicitud, contratoElegido?: string): Promise<string | null> {
  const d = aviso.payload.data ?? {};
  const empresa = aviso.empresa_id;
  if (!empresa) return "El aviso es de una organización de Pagnol que no está enlazada a ninguna empresa de Valar.";
  if (!d.id || !UUID.test(d.id)) return "El aviso no trae la solicitud.";

  if (aviso.tipo === "solicitud_compra.creada") return null;
  if (aviso.tipo === "solicitud_compra.rechazada") return cerrarSolicitud(sb, empresa, d);
  if (aviso.tipo !== "solicitud_compra.aprobada") return null;

  // Un reenvío (o un reproceso de la bandeja) no la arma dos veces.
  const { data: ya } = await sb.from("solped").select("id").eq("empresa_id", empresa).eq("pagnol_solicitud_id", d.id).maybeSingle();
  if (ya) return null;

  // Solo se compra lo autorizado: las rechazadas vienen marcadas para que no se compren.
  const lineas = (d.lineas ?? []).filter((l) => l.estado === "autorizada" && l.descripcion?.trim() && Number(l.cantidad) > 0);
  if (!lineas.length) return null;

  const contrato = await resolverContrato(sb, empresa, d, contratoElegido);
  if (typeof contrato !== "string") return contrato.motivo;

  const numero = await siguienteNumero(sb, empresa);
  const id = `SP-${contrato.replace(/^C-/, "")}-${numero.replace(/\D/g, "")}`;
  const observaciones = [
    `Solicitud ${d.codigo ?? d.id} de Pagnol.`,
    d.motivo?.trim() && `Motivo: ${d.motivo.trim().replace(/[.\s]*$/, "")}.`,
    d.prioridad === "urgente" && `Urgente${d.motivo_urgencia?.trim() ? `: ${d.motivo_urgencia.trim()}` : ""}.`,
    "Armada sola con la solicitud aprobada en Pagnol. Revisa las líneas, vincúlalas al catálogo si corresponde y envíala a aprobación.",
  ]
    .filter(Boolean)
    .join(" ");

  const { error } = await sb.from("solped").insert({
    empresa_id: empresa,
    id,
    numero,
    contrato_id: contrato,
    solicitante_nombre: d.solicitante?.nombre?.trim() || "Solicitud de Pagnol",
    area: d.area?.trim() || null,
    fecha_requerida: FECHA.test(d.necesaria_para ?? "") ? (d.necesaria_para as string).slice(0, 10) : null,
    prioridad: d.prioridad === "urgente" ? "urgente" : "normal",
    origen: "pagnol-solicitud",
    estado: "borrador",
    observaciones,
    pagnol_solicitud_id: d.id,
    pagnol_solicitud_codigo: d.codigo ?? null,
  });
  // Otro reintento del mismo aviso se nos adelantó: ya está armada.
  if (error?.code === "23505") return null;
  if (error) return `No se pudo crear la solicitud: ${error.message}`;

  const { error: errLineas } = await sb.from("solped_items").insert(
    lineas.map((l, i) => ({
      empresa_id: empresa,
      id: `SPI-${id}-${String(i + 1).padStart(3, "0")}`,
      solped_id: id,
      linea: i + 1,
      descripcion: l.descripcion!.trim(),
      unidad: l.unidad?.trim() || "un",
      cantidad: Number(l.cantidad),
      observacion: [l.tipo === "servicio" ? "Servicio" : null, l.categoria].filter(Boolean).join(" · ") || null,
    })),
  );
  if (errLineas) {
    // Sin líneas la solicitud no sirve: se retira para que el reintento la arme completa.
    await sb.from("solped").delete().eq("empresa_id", empresa).eq("id", id);
    return `No se pudieron agregar las líneas: ${errLineas.message}`;
  }
  return null;
}

/** El contrato de Valar de la solicitud: el elegido por una persona, o el asociado al de Pagnol. */
async function resolverContrato(
  sb: SupabaseClient,
  empresa: string,
  d: DatosSolicitud,
  elegido?: string,
): Promise<string | { motivo: string }> {
  const pagnolId = d.contrato?.id && UUID.test(d.contrato.id) ? d.contrato.id : null;

  if (elegido) {
    const { data: existe } = await sb.from("contratos").select("id").eq("empresa_id", empresa).eq("id", elegido).maybeSingle();
    if (!existe) return { motivo: "El contrato elegido no existe en esta empresa." };
    // Se recuerda: la próxima solicitud de ese contrato de Pagnol sale ya asignada.
    if (pagnolId) {
      await sb
        .from("pagnol_contratos")
        .upsert(
          { empresa_id: empresa, pagnol_contrato_id: pagnolId, pagnol_contrato_nombre: d.contrato?.nombre ?? "Contrato de Pagnol", contrato_id: elegido },
          { onConflict: "empresa_id,pagnol_contrato_id" },
        );
    }
    return elegido;
  }

  if (!pagnolId) return { motivo: "La solicitud no trae contrato: elige a cuál de Valar corresponde." };
  const { data } = await sb.from("pagnol_contratos").select("contrato_id").eq("empresa_id", empresa).eq("pagnol_contrato_id", pagnolId).maybeSingle();
  if (!data) return { motivo: `El contrato «${d.contrato?.nombre ?? pagnolId}» de Pagnol aún no está asociado a uno de Valar: elígelo una vez.` };
  return data.contrato_id as string;
}

/** `solicitud_compra.rechazada`: Valar la cierra en su lado, con el motivo. */
async function cerrarSolicitud(sb: SupabaseClient, empresa: string, d: DatosSolicitud): Promise<string | null> {
  // Si la aprobación nunca llegó a armarse (sigue en la bandeja), ya no hay nada que armar.
  await sb
    .from("pagnol_webhooks_recibidos")
    .update({ procesado_en: new Date().toISOString(), error: "Anulado: la solicitud se rechazó en Pagnol." })
    .eq("empresa_id", empresa)
    .eq("tipo", "solicitud_compra.aprobada")
    .eq("payload->data->>id", d.id!)
    .is("procesado_en", null);

  const { data: solped } = await sb.from("solped").select("id, estado").eq("empresa_id", empresa).eq("pagnol_solicitud_id", d.id!).maybeSingle();
  if (!solped) return null;
  if (solped.estado === "rechazada") return null;
  if (!CERRABLES.includes(solped.estado as string)) {
    return `La solicitud ${solped.id} ya está en curso (${solped.estado}): Pagnol la rechazó, ciérrala a mano si corresponde.`;
  }
  const motivo = `Rechazada en Pagnol${d.motivo_rechazo?.trim() ? `: ${d.motivo_rechazo.trim()}` : "."}`;
  const { error } = await sb.from("solped").update({ estado: "rechazada", motivo_cierre: motivo }).eq("empresa_id", empresa).eq("id", solped.id);
  return error ? `No se pudo cerrar la solicitud: ${error.message}` : null;
}

/** Procesa un aviso y deja anotado el resultado en `pagnol_webhooks_recibidos`. */
export async function procesarSolicitudYAnotar(sb: SupabaseClient, aviso: AvisoSolicitud, contratoElegido?: string) {
  let motivo: string | null;
  try {
    motivo = await procesarSolicitud(sb, aviso, contratoElegido);
  } catch (e) {
    motivo = e instanceof Error ? e.message : String(e);
  }
  await sb
    .from("pagnol_webhooks_recibidos")
    .update(motivo ? { error: motivo } : { procesado_en: new Date().toISOString(), error: null })
    .eq("webhook_id", aviso.webhook_id);
  return motivo;
}

/** La bandeja de una empresa: avisos de solicitud que quedaron sin SOLPED. Se reintentan todos. */
export async function procesarSolicitudesPendientes(sb: SupabaseClient, empresa: string) {
  const { data } = await sb
    .from("pagnol_webhooks_recibidos")
    .select("webhook_id, empresa_id, tipo, payload")
    .eq("empresa_id", empresa)
    .like("tipo", "solicitud\\_compra.%")
    .is("procesado_en", null)
    .order("recibido_en");
  let listos = 0;
  for (const aviso of (data ?? []) as AvisoSolicitud[]) if ((await procesarSolicitudYAnotar(sb, aviso)) === null) listos += 1;
  return { revisados: data?.length ?? 0, listos };
}
