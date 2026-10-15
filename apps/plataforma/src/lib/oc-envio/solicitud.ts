import "server-only";

import { MARCA, escapar, firmaTeoLabs } from "./correo";

/**
 * El correo de la solicitud de cotización, con la misma cara que el de la OC:
 * cabecera de Valar, tarjeta con el resumen, el mensaje de quien envía, el
 * detalle de los ítems y UN botón —ver la solicitud y confirmar recepción—, más el pie con
 * los datos de la empresa y la firma de Teo Labs.
 *
 * El detalle va escrito en el correo (tabla y texto plano) y no solo en un
 * adjunto: el proveedor puede cotizar respondiendo sin abrir nada.
 */

export type ItemSolicitud = { linea: number; descripcion: string; unidad: string; cantidad: number };

/** La foto de lo que se mandó: el enlace, el PDF y el correo muestran esto. */
export type ResumenSolicitud = {
  numero: string;
  /** AAAA-MM-DD en que se creó la solicitud. */
  fecha: string;
  proveedor: string;
  contrato: string;
  solicitante: string;
  fechaRequerida: string | null;
  observaciones: string | null;
  items: ItemSolicitud[];
  emisorNombre: string | null;
  emisorCorreo: string | null;
};

const fechaCorta = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "—");
const cantidad = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 3 });

export function cuerpoDeSolicitud(
  mensaje: string,
  enlace: string,
  r: ResumenSolicitud,
  empresa: { razonSocial: string; rut: string; direccion: string },
) {
  const responder = r.emisorCorreo
    ? `mailto:${encodeURIComponent(r.emisorCorreo)}?subject=${encodeURIComponent(`Cotización ${r.numero}`)}`
    : null;

  const detalleTexto = r.items
    .map((i) => `${String(i.linea).padStart(2, "0")}. ${i.descripcion} — ${cantidad(i.cantidad)} ${i.unidad}`)
    .join("\n");

  const texto = [
    mensaje.trim(),
    "",
    "Ítems a cotizar:",
    detalleTexto,
    r.observaciones ? `\nObservaciones: ${r.observaciones}` : "",
    "",
    `Ver la solicitud, descargar el PDF y avisar que la recibiste:`,
    enlace,
    "",
    `Responde este correo con tu cotización, indicando el número ${r.numero}.`,
    "",
    "—",
    `${empresa.razonSocial} · RUT ${empresa.rut}`,
    empresa.direccion,
    MARCA.sitio.replace("https://", ""),
    "Enviado desde Plataforma Valar · Desarrollado por Teo Labs ®",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const parrafos = mensaje
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const dato = (etiqueta: string, valor: string) => `
            <td valign="top" style="padding:14px 16px">
              <div style="font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${MARCA.suave}">${etiqueta}</div>
              <div style="margin-top:4px;font-size:15px;font-weight:bold;color:${MARCA.tinta}">${escapar(valor)}</div>
            </td>`;

  const celda = "padding:9px 10px;border-bottom:1px solid #e3e6e8;font-size:13px;color:" + MARCA.tinta;
  const filas = r.items
    .map(
      (i) => `
          <tr>
            <td style="${celda};color:${MARCA.suave};width:28px">${i.linea}</td>
            <td style="${celda}">${escapar(i.descripcion)}</td>
            <td align="right" style="${celda};white-space:nowrap">${cantidad(i.cantidad)} ${escapar(i.unidad)}</td>
          </tr>`,
    )
    .join("");

  const contacto = [r.emisorNombre, r.emisorCorreo].filter(Boolean).map((x) => escapar(x!));

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solicitud de cotización ${escapar(r.numero)}</title></head>
<body style="margin:0;padding:0;background:${MARCA.niebla}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Solicitud de cotización ${escapar(r.numero)} · ${r.items.length} ${r.items.length === 1 ? "ítem" : "ítems"} · responde este correo con tu cotización.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.niebla}">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:Arial,Helvetica,sans-serif;color:${MARCA.tinta}">

      <!-- Cabecera de Valar -->
      <tr><td style="background:${MARCA.tinta};border-radius:16px 16px 0 0;padding:20px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="48" valign="middle"><a href="${MARCA.sitio}" target="_blank"><img src="${MARCA.logo}" width="44" height="44" alt="Valar" style="display:block;border:0;border-radius:10px"></a></td>
          <td valign="middle" style="padding-left:12px">
            <div style="font-size:18px;font-weight:bold;letter-spacing:5px;color:#ffffff">VALAR</div>
            <div style="margin-top:2px;font-size:12px;color:#aab4bd">Plataforma Valar · Abastecimiento</div>
          </td>
          <td align="right" valign="middle" style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#aab4bd">Solicitud de cotización</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${MARCA.cian};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>

      <!-- La solicitud -->
      <tr><td style="background:#ffffff;padding:28px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${MARCA.cianOscuro}">Solicitud de cotización</div>
        <div style="margin-top:4px;font-size:26px;font-weight:bold;color:${MARCA.tinta}">${escapar(r.numero)}</div>
        <div style="margin-top:4px;font-size:14px;color:${MARCA.suave}">Para <strong style="color:${MARCA.tinta}">${escapar(r.proveedor)}</strong></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#f4f6f7;border-radius:12px">
          <tr>${dato("Contrato", r.contrato)}${dato("Se necesita para", fechaCorta(r.fechaRequerida))}${dato("Solicita", r.solicitante || "—")}</tr>
        </table>

        <div style="margin-top:24px;font-size:14px;line-height:1.6;color:${MARCA.tinta}">${parrafos}</div>

        <div style="margin-top:8px;font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${MARCA.suave}">Ítems a cotizar</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:2px solid ${MARCA.tinta}">${filas}
        </table>
        ${
          r.observaciones
            ? `<div style="margin-top:14px;font-size:13px;color:${MARCA.suave}"><strong style="color:${MARCA.tinta}">Observaciones:</strong> ${escapar(r.observaciones)}</div>`
            : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr>
          <td style="background:${MARCA.cianOscuro};border-radius:999px">
            <a href="${escapar(enlace)}" target="_blank" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">Ver la solicitud y confirmar recepci&oacute;n &rarr;</a>
          </td>
        </tr></table>
        <div style="font-size:12px;color:${MARCA.suave}">Ah&iacute; la ves, descargas el PDF (que tambi&eacute;n va adjunto) y avisas que la recibiste.${
          responder
            ? ` Para cotizar, <a href="${escapar(responder)}" target="_blank" style="color:${MARCA.cianOscuro};font-weight:bold">responde este correo</a>.`
            : ""
        }</div>
        <div style="margin-top:6px;font-size:12px;color:${MARCA.suave}">Indica el n&uacute;mero ${escapar(r.numero)} al responder. La cotizaci&oacute;n no constituye orden de compra.</div>

        ${
          contacto.length
            ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e3e6e8;font-size:13px;color:${MARCA.suave}">
          Tu contacto en Valar: <strong style="color:${MARCA.tinta}">${contacto.join("</strong> · <strong style=\"color:" + MARCA.tinta + "\">")}</strong>
        </div>`
            : ""
        }
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 28px 22px">
        <div style="font-size:11px;color:${MARCA.suave}">Si el bot&oacute;n no funciona, copia este enlace: <span style="word-break:break-all">${escapar(enlace)}</span></div>
      </td></tr>

      <!-- Pie -->
      <tr><td align="center" style="padding:22px 12px 0;font-size:12px;line-height:1.7;color:${MARCA.suave}">
        <strong style="color:${MARCA.tinta}">${escapar(empresa.razonSocial)}</strong> · RUT ${escapar(empresa.rut)}<br>
        ${escapar(empresa.direccion)}<br>
        <a href="${MARCA.sitio}" target="_blank" style="color:${MARCA.cianOscuro};font-weight:bold;text-decoration:none">www.grupovalar.cl</a>
      </td></tr>
      <tr><td align="center" style="padding:16px 12px 8px;font-size:11px;color:#8a949f">
        Enviado desde Plataforma Valar<br>${firmaTeoLabs()}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { texto, html };
}
