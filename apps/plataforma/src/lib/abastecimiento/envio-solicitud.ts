"use client";

import { supabase } from "../supabase";
import { emisorOC as emisorSolicitud } from "../empresa";
import { formatearFecha, saludoA } from "../formato";

/* ── Enviarle la solicitud al proveedor ───────────────────────────────────── */

/**
 * El correo que se le manda al proveedor, armado entero.
 *
 * EL DETALLE VA EN EL CUERPO Y NO SOLO EN EL PDF. Un `mailto:` no puede
 * adjuntar archivos, y un correo que dice "adjunto solicitud" sin adjunto no
 * sirve de nada. Con los ítems escritos en el texto, el proveedor puede cotizar
 * respondiendo el correo, sin abrir nada. El PDF queda para quien lo quiera
 * adjuntar además.
 *
 * Se arma acá y no en la pantalla porque el mismo texto va a servir el día que
 * el envío salga desde una casilla de la empresa: lo único que cambia entonces
 * es quién aprieta "enviar".
 */
export function armarCorreoSolicitud({
  numero,
  contrato,
  solicitante,
  fechaRequerida,
  contacto,
  items,
  observaciones,
}: {
  numero: string;
  contrato: string;
  solicitante: string;
  fechaRequerida: string | null;
  contacto: string | null;
  items: { linea: number; descripcion: string; unidad: string; cantidad: number }[];
  observaciones: string | null;
}) {
  const asunto = `Solicitud de cotización ${numero} · ${emisorSolicitud.razonSocial}`;

  const detalle = items
    .map(
      (i) =>
        `${String(i.linea).padStart(2, "0")}. ${i.descripcion} — ${i.cantidad} ${i.unidad}`,
    )
    .join("\n");

  const cuerpo = [
    saludoA(contacto),
    "",
    "Agradeceremos cotizar los siguientes ítems:",
    "",
    detalle,
    "",
    `Contrato: ${contrato}`,
    `Solicita: ${solicitante}`,
    fechaRequerida ? `Se necesita en faena: ${formatearFecha(fechaRequerida)}` : null,
    observaciones ? `Observaciones: ${observaciones}` : null,
    "",
    `Al responder, por favor mencione el número ${numero}.`,
    "",
    "La cotización no constituye orden de compra: la compra se formaliza",
    `únicamente con una orden emitida por ${emisorSolicitud.razonSocial}.`,
    "",
    "Saludos,",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { asunto, cuerpo };
}


/**
 * Cuántos caracteres aguanta un `mailto:` antes de que el cliente lo corte.
 *
 * No hay un límite del estándar; el que manda es el más estrecho de la cadena,
 * y Outlook empieza a truncar cerca de los 2.000. Por debajo de eso el correo
 * llega entero; por encima conviene avisar antes de que el proveedor reciba una
 * lista cortada a la mitad y cotice de menos.
 */
export const TOPE_MAILTO = 1900;

/** El enlace que abre el cliente de correo con todo escrito. */
export function enlaceMailto(destinatario: string, asunto: string, cuerpo: string) {
  return `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(
    asunto,
  )}&body=${encodeURIComponent(cuerpo)}`;
}

/**
 * Deja constancia de que se mandó, y a qué correo.
 *
 * `enviada_en` es distinto de `solicitada_en`: entre crear la solicitud y
 * mandarla puede pasar un día, y ese rato no es demora del proveedor. El tiempo
 * de respuesta se cuenta desde acá.
 */
export async function registrarEnvio(cotizacionId: string, correo: string) {
  const { error } = await supabase
    .from("cotizaciones")
    .update({ enviada_en: new Date().toISOString(), enviada_a: correo })
    .eq("id", cotizacionId);

  if (error) throw new Error(error.message);
}

/** Lo que pasó con un envío: si el proveedor lo abrió y si avisó que lo recibió. */
export type EnvioSolicitud = {
  cotizacionId: string;
  enviadaEn: string;
  para: string;
  vistaEn: string | null;
  recibidaEn: string | null;
  recibidaPor: string | null;
  comentario: string | null;
};

/**
 * Los envíos de las solicitudes indicadas, del más nuevo al más viejo. Si la
 * migración 0086 todavía no está aplicada devuelve vacío: la pantalla funciona
 * igual, solo sin el estado «vista / recibida».
 */
export async function cargarEnviosDeSolicitudes(cotizacionIds: string[]): Promise<EnvioSolicitud[]> {
  if (cotizacionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("cotizaciones_envios")
    .select("cotizacion_id, enviada_en, para, vista_en, recibida_en, recibida_por, comentario")
    .in("cotizacion_id", cotizacionIds)
    .order("enviada_en", { ascending: false });
  if (error) return [];
  return (data ?? []).map((e) => ({
    cotizacionId: e.cotizacion_id as string,
    enviadaEn: e.enviada_en as string,
    para: e.para as string,
    vistaEn: (e.vista_en as string | null) ?? null,
    recibidaEn: (e.recibida_en as string | null) ?? null,
    recibidaPor: (e.recibida_por as string | null) ?? null,
    comentario: (e.comentario as string | null) ?? null,
  }));
}

/**
 * Manda la solicitud desde el servidor, con el correo de Valar (tabla de ítems,
 * PDF adjunto, enlace para confirmar recepción) y copia a quien envía. Nunca lanza: devuelve el error
 * escrito para la pantalla.
 */
export async function enviarSolicitudAlProveedor(
  cotizacionId: string,
  datos: {
    para: string;
    cc: string[];
    asunto: string;
    mensaje: string;
    numero: string;
    proveedor: string;
    contrato: string;
    solicitante: string;
    fechaRequerida: string | null;
    observaciones: string | null;
    items: { descripcion: string; unidad: string; cantidad: number }[];
  },
): Promise<{ ok: true; para: string[]; cc: string[] } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch(`/api/cotizaciones/${encodeURIComponent(cotizacionId)}/enviar/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    return await r.json();
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor. Revisa la conexión." };
  }
}

