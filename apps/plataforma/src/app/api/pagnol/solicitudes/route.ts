import { sesionDeAbastecimiento, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { procesarSolicitudesPendientes, procesarSolicitudYAnotar, type AvisoSolicitud } from "@/lib/pagnol/solicitudes-entrantes";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Reprocesa la bandeja de solicitudes de compra de Pagnol (Fase 5 · C): los
 * avisos que no pudieron armar la solicitud, típicamente por un contrato de
 * Pagnol aún sin asociar.
 *
 *   · sin cuerpo: reintenta todos los pendientes de la empresa;
 *   · `{ webhook_id, contrato_id }`: arma ESE aviso en el contrato elegido, y si
 *     el aviso trae el contrato de Pagnol, deja guardada la asociación.
 *
 * Pide sesión con acceso a Abastecimiento y permiso para crear solicitudes, y
 * procesa SOLO los avisos de la empresa de esa persona.
 */
export async function POST(pedido: Request) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });

  const { data: crea } = await sb.rpc("tiene_permiso", { clave: "solped.crear" });
  if (crea !== true) {
    return Response.json({ ok: false, error: "Tu acceso no permite crear solicitudes." }, { status: 403 });
  }
  const { data: empresa } = await sb.rpc("empresa_actual");
  const servicio = supabaseDeServicio();
  if (!empresa || !servicio) {
    return Response.json({ ok: false, error: "Las solicitudes de Pagnol no están configuradas en el servidor." }, { status: 503 });
  }

  const cuerpo = (await pedido.json().catch(() => null)) as { webhook_id?: string; contrato_id?: string } | null;
  if (!cuerpo?.webhook_id) return Response.json({ ok: true, ...(await procesarSolicitudesPendientes(servicio, empresa as string)) });

  if (!cuerpo.contrato_id) return Response.json({ ok: false, error: "Falta el contrato." }, { status: 400 });
  const { data: aviso } = await servicio
    .from("pagnol_webhooks_recibidos")
    .select("webhook_id, empresa_id, tipo, payload")
    .eq("empresa_id", empresa)
    .eq("webhook_id", cuerpo.webhook_id)
    .like("tipo", "solicitud\\_compra.%")
    .is("procesado_en", null)
    .maybeSingle();
  if (!aviso) return Response.json({ ok: false, error: "Ese aviso ya no está pendiente." }, { status: 404 });

  const motivo = await procesarSolicitudYAnotar(servicio, aviso as AvisoSolicitud, cuerpo.contrato_id);
  return Response.json(motivo ? { ok: false, error: motivo } : { ok: true });
}
