import { enviarCorreoDeOrden, smtpConfigurado } from "@/lib/oc-envio/correo";
import { DIAS_DEL_ENLACE, correoValido, nuevoEnlace, remitenteDe } from "@/lib/oc-envio/datos";
import { pdfDeSolicitud } from "@/lib/oc-envio/pdf-solicitud";
import { cuerpoDeSolicitud, type ItemSolicitud, type ResumenSolicitud } from "@/lib/oc-envio/solicitud";
import { direccionCompleta } from "@/lib/empresa";
import { cargarDatosEmpresa } from "@/lib/empresa-servidor";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Le manda la solicitud de cotización al proveedor, con la misma cara que la
 * OC: correo de Valar, ítems en una tabla y botón para responder.
 *
 * Las reglas se cumplen ACÁ y no en la pantalla:
 *   · solo quien tiene `cotizacion.gestionar`;
 *   · la cotización se lee con SU sesión (si no la alcanza, no existe);
 *   · quien envía va siempre con copia, y el proveedor le contesta a esa
 *     persona (Responder-a), aunque el `From` sea la casilla que autentica;
 *   · el envío se anota ANTES de mandar el correo (para que el enlace ya
 *     funcione cuando el proveedor lo abra) y se borra si el correo no sale;
 *   · la constancia (`enviada_en`, `enviada_a`) se escribe DESPUÉS de que el
 *     correo salió: no queda como enviada una solicitud que se cayó en el camino.
 *
 * El correo lleva el PDF adjunto y un enlace privado (`/sc/<token>/`) donde el
 * proveedor la ve, la descarga y avisa que la recibió. Del enlace solo se
 * guarda su huella; el PDF se arma al vuelo y no se guarda en ninguna parte.
 *
 * A diferencia de la OC, las copias pueden ser cualquier correo —quien envía
 * puede querer una copia en otra casilla suya o de alguien externo—, con tope.
 */

type Contexto = { params: Promise<{ id: string }> };

const falla = (error: string, status: number) => Response.json({ ok: false, error }, { status });

/** "a@x.cl, b@y.cl; c@z.cl" → ["a@x.cl", ...] en minúsculas y sin repetir. */
const correos = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[,;\s]+/)).map((c) => c.trim().toLowerCase()).filter(Boolean))];

export async function POST(pedido: Request, { params }: Contexto) {
  const remitente = await remitenteDe(pedido, "cotizacion.gestionar");
  if (!remitente) return falla("Tu sesión no permite enviar solicitudes de cotización.", 401);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await pedido.json();
  } catch {
    return falla("El pedido no es JSON.", 400);
  }

  const { id: idCodificado } = await params;
  const id = decodeURIComponent(idCodificado);
  const servicio = supabaseDeServicio();
  if (!servicio) return falla("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.", 500);

  const { data: cotizacion, error: falloLectura } = await remitente.sb
    .from("cotizaciones")
    .select("id, empresa_id, solped_id, solicitada_en")
    .eq("id", id)
    .maybeSingle();
  if (falloLectura) return falla(falloLectura.message, 500);
  if (!cotizacion) return falla("No se encontró la solicitud, o tu acceso no la alcanza.", 404);

  // El contrato sale de la base, no del pedido: de ahí depende quién ve el envío.
  const { data: solped } = await remitente.sb
    .from("solped")
    .select("contrato_id, numero")
    .eq("empresa_id", cotizacion.empresa_id)
    .eq("id", cotizacion.solped_id)
    .maybeSingle();
  if (!solped) return falla("No se encontró la solicitud de faena de esta cotización.", 404);

  const para = correos(cuerpo.para);
  if (para.length === 0) return falla("Falta el correo del proveedor.", 400);
  if (para.length > 5 || !para.every(correoValido)) return falla("Revisa el correo del proveedor.", 400);

  const emisor = remitente.correo.toLowerCase();
  const pedidas = correos(cuerpo.cc);
  if (pedidas.length > 10 || !pedidas.every(correoValido)) return falla("Revisa los correos con copia.", 400);
  const cc = [...new Set([emisor, ...pedidas])].filter((c) => correoValido(c) && !para.includes(c));

  const asunto = String(cuerpo.asunto ?? "").trim().slice(0, 200);
  const mensaje = String(cuerpo.mensaje ?? "").trim().slice(0, 5000);
  if (!asunto || !mensaje) return falla("Faltan el asunto o el mensaje.", 400);

  const items: ItemSolicitud[] = (Array.isArray(cuerpo.items) ? cuerpo.items : []).slice(0, 200).map((i, n) => {
    const x = (i ?? {}) as Record<string, unknown>;
    return {
      linea: n + 1,
      descripcion: String(x.descripcion ?? "").slice(0, 300),
      unidad: String(x.unidad ?? "").slice(0, 20),
      cantidad: Number(x.cantidad) || 0,
    };
  });
  if (items.length === 0) return falla("La solicitud no tiene ítems.", 400);

  if (!smtpConfigurado()) {
    return falla("Falta configurar el correo del servidor (EMAIL_HOST, ZOHO_SMTP_USER y ZOHO_SMTP_PASS).", 500);
  }

  const datosEmpresa = await cargarDatosEmpresa(servicio, cotizacion.empresa_id);
  const resumen: ResumenSolicitud = {
    numero: String(cuerpo.numero ?? id).slice(0, 40),
    solped: solped.numero ? String(solped.numero).slice(0, 40) : null,
    fecha: String(cotizacion.solicitada_en ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    proveedor: String(cuerpo.proveedor ?? "").slice(0, 200),
    contrato: String(cuerpo.contrato ?? "").slice(0, 200),
    solicitante: String(cuerpo.solicitante ?? "").slice(0, 120),
    fechaRequerida: typeof cuerpo.fechaRequerida === "string" ? cuerpo.fechaRequerida : null,
    observaciones: cuerpo.observaciones ? String(cuerpo.observaciones).slice(0, 500) : null,
    items,
    emisorNombre: remitente.nombre,
    emisorCorreo: emisor,
    empresa: datosEmpresa,
  };

  /* El envío, primero anotado, con la foto de lo que se manda. */
  const { token, hash } = nuevoEnlace();
  const expira = new Date(Date.now() + DIAS_DEL_ENLACE * 86_400_000);
  const { data: envio, error: falloEnvio } = await servicio
    .from("cotizaciones_envios")
    .insert({
      empresa_id: cotizacion.empresa_id,
      cotizacion_id: cotizacion.id,
      contrato_id: solped.contrato_id,
      enviada_por: remitente.id,
      enviada_por_nombre: remitente.nombre,
      para: para.join(", "),
      cc,
      asunto,
      contenido: resumen,
      token_hash: hash,
      expira_en: expira.toISOString(),
    })
    .select("id")
    .single();
  if (falloEnvio) {
    const sinTabla = /cotizaciones_envios/.test(falloEnvio.message) && /exist|schema cache/i.test(falloEnvio.message);
    return falla(sinTabla ? "Falta aplicar la migración 0086 en la base." : falloEnvio.message, 500);
  }

  const enlace = `${new URL(pedido.url).origin}/sc/${token}/`;
  const { texto, html } = cuerpoDeSolicitud(mensaje, enlace, resumen, {
    razonSocial: datosEmpresa.razonSocial,
    rut: datosEmpresa.rut,
    direccion: direccionCompleta(datosEmpresa),
  });

  try {
    await enviarCorreoDeOrden({
      nombreRemitente: `${remitente.nombre} · Valar`,
      responderA: emisor,
      para: para.join(", "),
      cc,
      asunto,
      texto,
      html,
      adjunto: { nombre: `${resumen.numero}.pdf`, contenido: await pdfDeSolicitud(resumen) },
    });
  } catch (e) {
    await servicio.from("cotizaciones_envios").delete().eq("id", envio.id);
    return falla(`El correo no salió: ${e instanceof Error ? e.message : String(e)}`, 502);
  }

  /* La constancia, con la sesión de quien envía: los ids de cotización se
     repiten entre empresas y así la marca respeta empresa y contratos. */
  await remitente.sb
    .from("cotizaciones")
    .update({ enviada_en: new Date().toISOString(), enviada_a: para.join(", ") })
    .eq("id", id);

  return Response.json({ ok: true, para, cc });
}
