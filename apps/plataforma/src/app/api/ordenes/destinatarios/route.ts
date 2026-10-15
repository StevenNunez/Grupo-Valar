import { remitenteDe } from "@/lib/oc-envio/datos";
import { destinatariosDeLaEmpresa } from "@/lib/oc-envio/destinatarios";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * A quiénes de la empresa se puede copiar una OC (o una solicitud de
 * cotización, con `?para=cotizacion`). Solo para quien puede enviarlas.
 */
export async function GET(pedido: Request) {
  const paraCotizacion = new URL(pedido.url).searchParams.get("para") === "cotizacion";
  const remitente = await remitenteDe(pedido, paraCotizacion ? "cotizacion.gestionar" : "ordenes.emitir");
  if (!remitente) {
    return Response.json({ ok: false, error: "Tu sesión no permite enviar correos desde Abastecimiento." }, { status: 401 });
  }
  const servicio = supabaseDeServicio();
  if (!servicio) {
    return Response.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 500 });
  }
  try {
    return Response.json({ ok: true, datos: await destinatariosDeLaEmpresa(remitente.sb, servicio) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
