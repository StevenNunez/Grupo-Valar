import "server-only";

import nodemailer from "nodemailer";

/**
 * El correo de la OC, por el SMTP de Zoho.
 *
 * Es la misma casilla que usa la función `correo` de Supabase para las
 * solicitudes de cotización. En Vercel ya estaba cargada con los nombres
 * EMAIL_HOST, EMAIL_PORT, ZOHO_SMTP_USER y ZOHO_SMTP_PASS (o EMAIL_USER y
 * EMAIL_PASS), así que se leen esos; los SMTP_* tienen prioridad si algún día
 * se quiere otra casilla solo para las OC sin tocar lo demás.
 *
 * DESDE QUIÉN SALE. Zoho solo deja mandar desde la cuenta que inicia sesión,
 * así que la DIRECCIÓN es la de SMTP_REMITENTE. Lo que sí es de quien emite:
 * el NOMBRE que ve el proveedor ("Steven Núñez · Valar"), el Responder-a y la
 * copia. El proveedor le contesta a la persona, no a un buzón. El día que cada
 * persona tenga su casilla en Zoho con permiso "enviar como", se cambia `from`
 * y nada más.
 */

/** La primera variable que tenga valor. */
const env = (...nombres: string[]) =>
  nombres.map((n) => process.env[n]?.trim()).find((v) => !!v) ?? "";

function smtp() {
  const usuario = env("SMTP_USUARIO", "ZOHO_SMTP_USER", "EMAIL_USER");
  return {
    host: env("SMTP_HOST", "EMAIL_HOST"),
    puerto: Number(env("SMTP_PORT", "EMAIL_PORT") || 465),
    usuario,
    clave: env("SMTP_CLAVE", "ZOHO_SMTP_PASS", "EMAIL_PASS"),
    // Sin remitente propio, sale de la misma cuenta que autentica.
    remitente: env("SMTP_REMITENTE") || usuario,
  };
}

export function smtpConfigurado() {
  const c = smtp();
  return !!(c.host && c.usuario && c.clave);
}

/** "Valar SpA <hola@x.cl>" → "hola@x.cl". */
function direccionDe(remitente: string) {
  return /<([^>]+)>/.exec(remitente)?.[1] ?? remitente.trim();
}

export async function enviarCorreoDeOrden(c: {
  nombreRemitente: string;
  responderA: string | null;
  para: string;
  cc: string[];
  asunto: string;
  texto: string;
  html: string;
  adjunto: { nombre: string; contenido: Uint8Array };
}) {
  const c0 = smtp();
  const transporte = nodemailer.createTransport({
    host: c0.host,
    port: c0.puerto,
    secure: c0.puerto === 465,
    auth: { user: c0.usuario, pass: c0.clave },
  });

  const direccion = direccionDe(c0.remitente);
  await transporte.sendMail({
    from: { name: c.nombreRemitente, address: direccion },
    replyTo: c.responderA ?? undefined,
    to: c.para,
    cc: c.cc.length ? c.cc : undefined,
    subject: c.asunto,
    text: c.texto,
    html: c.html,
    attachments: [
      { filename: c.adjunto.nombre, content: Buffer.from(c.adjunto.contenido), contentType: "application/pdf" },
    ],
  });
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── El correo, con la cara de Valar ──────────────────────────────────────────
   Hecho con tablas y estilos en línea, como exigen Gmail y Outlook: no leen
   <style>, ni flexbox, ni SVG. El logo es el PNG que ya publica el sitio
   (www.grupovalar.cl/logo-valar.png); si el cliente bloquea imágenes, queda
   "VALAR" escrito al lado, así que el correo se identifica igual. */

const MARCA = {
  tinta: "#1f2124",
  suave: "#5f6b7a",
  cian: "#18a6cd",
  cianOscuro: "#0f7d9c",
  niebla: "#eef1f3",
  sitio: "https://www.grupovalar.cl",
  logo: "https://www.grupovalar.cl/logo-valar.png",
};

/**
 * "Teo Labs" con los colores de su firma. Un correo no puede pintar texto con
 * degradado (Gmail ignora `background-clip`), así que cada letra lleva su
 * tramo del azul → morado → verde de `InteractiveLogo`.
 */
function firmaTeoLabs() {
  const paradas = [
    [0x25, 0x63, 0xeb],
    [0xa8, 0x55, 0xf7],
    [0x22, 0xc5, 0x5e],
  ];
  const letras = [..."Teo Labs"];
  const color = (t: number) => {
    const tramo = t < 0.5 ? 0 : 1;
    const u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const hex = [0, 1, 2]
      .map((i) => Math.round(paradas[tramo][i] + (paradas[tramo + 1][i] - paradas[tramo][i]) * u))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  };
  const coloreadas = letras
    .map((c, i) => (c === " " ? " " : `<span style="color:${color(i / (letras.length - 1))}">${c}</span>`))
    .join("");
  return `Desarrollado por <a href="https://www.teolabs.app" target="_blank" rel="noopener noreferrer" style="text-decoration:none;font-weight:bold">${coloreadas}</a> &reg;`;
}

export type ResumenCorreo = {
  numero: string;
  proveedor: string;
  total: number;
  fechaRequerida: string | null;
  lugarEntrega: string | null;
  emisorNombre: string | null;
  emisorCorreo: string | null;
  emisorTelefono: string | null;
};

const fechaCorta = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "—");
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/**
 * El cuerpo del correo: la cabecera de Valar, el resumen de la orden, el
 * mensaje que escribió quien envía, el botón para confirmar y el pie con los
 * datos de la empresa. El enlace lo pone el servidor: no se puede borrar ni
 * cambiar desde la pantalla, porque es lo que hace que la confirmación llegue.
 */
export function cuerpoDelCorreo(
  mensaje: string,
  enlace: string,
  o: ResumenCorreo,
  empresa: { razonSocial: string; rut: string; direccion: string },
) {
  const texto = [
    mensaje.trim(),
    "",
    `Ver y confirmar la orden ${o.numero}:`,
    enlace,
    "",
    "—",
    `${empresa.razonSocial} · RUT ${empresa.rut}`,
    empresa.direccion,
    MARCA.sitio.replace("https://", ""),
    "Enviado desde Plataforma Valar · Desarrollado por Teo Labs ®",
  ].join("\n");

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

  const contacto = [o.emisorNombre, o.emisorCorreo, o.emisorTelefono].filter(Boolean).map((x) => escapar(x!));

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orden de compra ${escapar(o.numero)}</title></head>
<body style="margin:0;padding:0;background:${MARCA.niebla}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Orden de compra ${escapar(o.numero)} · ${pesos(o.total)} con IVA · Ver y confirmar la fecha de entrega.</div>
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
          <td align="right" valign="middle" style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#aab4bd">Orden de compra</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${MARCA.cian};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>

      <!-- La orden -->
      <tr><td style="background:#ffffff;padding:28px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${MARCA.cianOscuro}">Orden de compra</div>
        <div style="margin-top:4px;font-size:26px;font-weight:bold;color:${MARCA.tinta}">${escapar(o.numero)}</div>
        <div style="margin-top:4px;font-size:14px;color:${MARCA.suave}">Para <strong style="color:${MARCA.tinta}">${escapar(o.proveedor)}</strong></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#f4f6f7;border-radius:12px">
          <tr>${dato("Total con IVA", pesos(o.total))}${dato("Requerida para", fechaCorta(o.fechaRequerida))}${dato("Lugar de entrega", o.lugarEntrega || "—")}</tr>
        </table>

        <div style="margin-top:24px;font-size:14px;line-height:1.6;color:${MARCA.tinta}">${parrafos}</div>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr>
          <td style="background:${MARCA.cianOscuro};border-radius:999px">
            <a href="${escapar(enlace)}" target="_blank" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">Ver y confirmar la orden &rarr;</a>
          </td>
        </tr></table>
        <div style="font-size:12px;color:${MARCA.suave}">Ahí confirmas la fecha de entrega y descargas el PDF, que también va adjunto.</div>

        ${
          contacto.length
            ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e3e6e8;font-size:13px;color:${MARCA.suave}">
          Tu contacto en Valar: <strong style="color:${MARCA.tinta}">${contacto.join("</strong> · <strong style=\"color:" + MARCA.tinta + "\">")}</strong>
        </div>`
            : ""
        }
      </td></tr>

      <!-- Pie -->
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 28px 22px">
        <div style="font-size:11px;color:${MARCA.suave}">Si el botón no funciona, copia este enlace: <span style="word-break:break-all">${escapar(enlace)}</span></div>
      </td></tr>
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
