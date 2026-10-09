import { cuerpoDelCorreo, enviarCorreoDeOrden, smtpConfigurado } from "@/lib/oc-envio/correo";
import {
  DIAS_DEL_ENLACE,
  cargarOrdenParaEnviar,
  correoValido,
  nuevoEnlace,
  remitenteDe,
} from "@/lib/oc-envio/datos";
import { destinatariosDeLaEmpresa } from "@/lib/oc-envio/destinatarios";
import { pdfDeOrden } from "@/lib/oc-envio/pdf";
import { empresa } from "@/lib/empresa";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Le manda la OC al proveedor: el PDF adjunto y un enlace privado para verla y
 * confirmarla.
 *
 * Las reglas se cumplen ACÁ, no en la pantalla:
 *   · solo quien tiene `ordenes.emitir`, y la orden se lee con SU sesión;
 *   · un borrador nunca se envía, ni una anulada;
 *   · quien emitió la orden va siempre con copia;
 *   · las demás copias tienen que ser personas de la misma empresa.
 *
 * El envío se anota ANTES de mandar el correo (para que el enlace ya funcione
 * cuando el proveedor lo abra) y se borra si el correo no sale: no queda
 * constancia de un envío que no ocurrió.
 */

type Contexto = { params: Promise<{ id: string }> };

const falla = (error: string, status: number) => Response.json({ ok: false, error }, { status });

export async function POST(pedido: Request, { params }: Contexto) {
  const remitente = await remitenteDe(pedido);
  if (!remitente) return falla("Tu sesión no permite enviar órdenes de compra.", 401);

  const servicio = supabaseDeServicio();
  if (!servicio) return falla("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.", 500);
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await pedido.json();
  } catch {
    return falla("El pedido no es JSON.", 400);
  }

  const { id } = await params;
  const orden = await cargarOrdenParaEnviar(remitente.sb, decodeURIComponent(id));
  if (!orden) return falla("No se encontró la orden, o tu acceso no la alcanza.", 404);

  if (orden.estado === "borrador") {
    return falla("Una orden en borrador no se envía. Pásala a «Emitida» y vuelve a intentarlo.", 409);
  }
  if (orden.estado === "anulada") return falla("La orden está anulada: no se envía.", 409);
  if (orden.items.length === 0) return falla("La orden no tiene ítems.", 409);

  /* Destinatarios. "Para" admite varios, separados por coma. */
  const para = String(cuerpo.para ?? "")
    .split(/[,;]/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (para.length === 0) return falla("Falta el correo del proveedor.", 400);
  if (para.length > 5 || !para.every(correoValido)) return falla("Revisa el correo del proveedor.", 400);

  const emisor = (orden.emisorCorreo || remitente.correo).toLowerCase();
  const pedidas = Array.isArray(cuerpo.cc) ? cuerpo.cc.map((c) => String(c).trim().toLowerCase()) : [];
  const permitidas = new Set((await destinatariosDeLaEmpresa(remitente.sb, servicio)).map((d) => d.correo));
  const ajenas = pedidas.filter((c) => c !== emisor && !permitidas.has(c));
  if (ajenas.length) return falla(`Solo se puede copiar a personas de Valar: ${ajenas.join(", ")}.`, 400);
  const cc = [...new Set([emisor, ...pedidas])].filter((c) => correoValido(c) && !para.includes(c));

  const asunto = String(cuerpo.asunto ?? "").trim().slice(0, 200);
  const mensaje = String(cuerpo.mensaje ?? "").trim().slice(0, 5000);
  if (!asunto || !mensaje) return falla("Faltan el asunto o el mensaje.", 400);

  if (!smtpConfigurado()) {
    return falla("Falta configurar el correo del servidor (EMAIL_HOST, ZOHO_SMTP_USER y ZOHO_SMTP_PASS).", 500);
  }

  /* El envío, primero anotado. */
  const { token, hash } = nuevoEnlace();
  const expira = new Date(Date.now() + DIAS_DEL_ENLACE * 86_400_000);
  const { data: envio, error: falloEnvio } = await servicio
    .from("ordenes_envios")
    .insert({
      empresa_id: orden.empresaId,
      orden_id: orden.id,
      contrato_id: orden.contratoId,
      enviada_por: remitente.id,
      enviada_por_nombre: remitente.nombre,
      para: para.join(", "),
      cc,
      asunto,
      token_hash: hash,
      expira_en: expira.toISOString(),
    })
    .select("id, enviada_en")
    .single();
  if (falloEnvio) {
    const sinTabla = /ordenes_envios/.test(falloEnvio.message) && /exist|schema cache/i.test(falloEnvio.message);
    return falla(sinTabla ? "Falta aplicar la migración 0069 en la base." : falloEnvio.message, 500);
  }

  const enlace = `${new URL(pedido.url).origin}/oc/${token}/`;
  const { texto, html } = cuerpoDelCorreo(
    mensaje,
    enlace,
    {
      numero: orden.numero,
      proveedor: orden.proveedor,
      total: orden.items.reduce((s, i) => s + i.neto + i.iva, 0),
      fechaRequerida: orden.fechaRequerida,
      lugarEntrega: orden.lugarEntrega,
      emisorNombre: orden.emisorNombre,
      emisorCorreo: orden.emisorCorreo,
      emisorTelefono: orden.emisorTelefono,
    },
    empresa,
  );

  try {
    await enviarCorreoDeOrden({
      nombreRemitente: `${orden.emisorNombre || remitente.nombre} · Valar`,
      responderA: emisor,
      para: para.join(", "),
      cc,
      asunto,
      texto,
      html,
      adjunto: { nombre: `${orden.numero}.pdf`, contenido: await pdfDeOrden(orden) },
    });
  } catch (e) {
    await servicio.from("ordenes_envios").delete().eq("id", envio.id);
    return falla(`El correo no salió: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  return Response.json({ ok: true, envio: { id: envio.id, enviadaEn: envio.enviada_en, para, cc } });
}
