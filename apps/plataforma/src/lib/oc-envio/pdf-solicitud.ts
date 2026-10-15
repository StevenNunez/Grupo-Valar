import "server-only";

import {
  PDFDocument,
  PDFString,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFontAndSize,
  setTextRenderingMode,
  showText,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { MARK_A, MARK_V } from "@/components/Logo";
import { emisorOC } from "@/lib/empresa";
import type { ResumenSolicitud } from "./solicitud";

/**
 * El PDF de la solicitud de cotización, armado en el servidor a partir de la
 * foto que quedó guardada en el envío (no de la solicitud viva): el proveedor
 * descarga siempre lo mismo que le llegó.
 *
 * Mismo criterio que el PDF de la OC (`pdf.ts`): Helvetica estándar, sin
 * embeber nada (pesa unos pocos KB), isotipo en vectores y la firma de Teo Labs
 * al pie con el degradado por letra.
 */

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 42;
const TINTA = rgb(0.07, 0.11, 0.16);
const SUAVE = rgb(0.38, 0.43, 0.49);
const LINEA = rgb(0.85, 0.87, 0.9);

const DEGRADADO: [number, number, number][] = [
  [0x25, 0x63, 0xeb],
  [0xa8, 0x55, 0xf7],
  [0x22, 0xc5, 0x5e],
];

function colorDelDegradado(t: number) {
  const tramo = t < 0.5 ? 0 : 1;
  const u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const [a, b] = [DEGRADADO[tramo], DEGRADADO[tramo + 1]];
  const c = (i: number) => (a[i] + (b[i] - a[i]) * u) / 255;
  return rgb(c(0), c(1), c(2));
}

const cantidad = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 3 });
const fecha = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
};

export async function pdfDeSolicitud(r: ResumenSolicitud): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Solicitud de cotización ${r.numero}`);
  doc.setAuthor(emisorOC.razonSocial);
  doc.setCreator("Plataforma Valar · Teo Labs");

  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const permitidos = new Set(normal.getCharacterSet());

  const limpio = (texto: string | null | undefined) =>
    [...(texto ?? "")
      .replace(/[″“”]/g, '"')
      .replace(/[′‘’]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")]
      .map((c) => (permitidos.has(c.codePointAt(0)!) ? c : "?"))
      .join("");

  let pagina = doc.addPage([A4.ancho, A4.alto]);
  let y = A4.alto - MARGEN;
  const derecha = A4.ancho - MARGEN;
  const ancho = derecha - MARGEN;

  const texto = (
    t: string,
    x: number,
    yy: number,
    { tam = 9, fuente = normal, color = TINTA, alinear = "izq" as "izq" | "der" | "centro" } = {},
  ) => {
    const s = limpio(t);
    const w = fuente.widthOfTextAtSize(s, tam);
    const xx = alinear === "der" ? x - w : alinear === "centro" ? x - w / 2 : x;
    pagina.drawText(s, { x: xx, y: yy, size: tam, font: fuente, color });
  };
  const raya = (yy: number, grosor = 0.6, color = LINEA, x1 = MARGEN, x2 = derecha) =>
    pagina.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: grosor, color });

  const partir = (t: string, max: number, fuente: PDFFont, tam: number) => {
    const palabras = limpio(t).split(" ");
    const lineas: string[] = [];
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (fuente.widthOfTextAtSize(prueba, tam) <= max) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = p;
      }
    }
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [""];
  };

  /* ── Encabezado ─────────────────────────────────────────────────────────── */
  const escala = 40 / 275.01;
  for (const trazo of [MARK_V, MARK_A]) {
    pagina.drawSvgPath(trazo, { x: MARGEN, y: y - 4, scale: escala, color: TINTA });
  }
  const xMarca = MARGEN + 50;
  texto(emisorOC.razonSocial, xMarca, y - 14, { tam: 16, fuente: negrita });
  texto(`RUT ${emisorOC.rut}`, xMarca, y - 28, { tam: 9, color: SUAVE });
  texto("SOLICITUD DE COTIZACIÓN", derecha, y - 14, { tam: 14, fuente: negrita, alinear: "der" });
  texto(r.numero, derecha, y - 30, { tam: 12, fuente: negrita, alinear: "der" });
  y -= 42;
  raya(y, 1.6, TINTA);
  y -= 20;

  /* ── Quién pide y a quién ───────────────────────────────────────────────── */
  const mitad = (ancho - 24) / 2;
  const bloque = (titulo: string, x: number, filas: [string, string | null][]) => {
    let yy = y;
    texto(titulo.toUpperCase(), x, yy, { tam: 7.5, fuente: negrita, color: SUAVE });
    yy -= 5;
    raya(yy, 0.6, LINEA, x, x + mitad);
    yy -= 12;
    for (const [etiqueta, valor] of filas) {
      texto(etiqueta, x, yy, { tam: 8.5, color: SUAVE });
      const lineas = partir(valor || "—", mitad - 70, normal, 8.5);
      lineas.forEach((l, i) => texto(l, x + 70, yy - i * 11, { tam: 8.5 }));
      yy -= 11 * lineas.length + 2;
    }
    return yy;
  };
  const finEmisor = bloque("Solicita", MARGEN, [
    ["Empresa", emisorOC.razonSocial],
    ["Rut", emisorOC.rut],
    ["Dirección", `${emisorOC.direccion}, ${emisorOC.ciudad}`],
    ["Contacto", r.emisorNombre],
    ["Correo", r.emisorCorreo],
  ]);
  const finProveedor = bloque("Proveedor", MARGEN + mitad + 24, [["Razón social", r.proveedor]]);
  y = Math.min(finEmisor, finProveedor) - 8;

  raya(y);
  y -= 13;
  const tercio = ancho / 3;
  (
    [
      ["Fecha", fecha(r.fecha)],
      ["Se necesita para", fecha(r.fechaRequerida)],
      ["Contrato", r.contrato || "—"],
    ] as const
  ).forEach(([etiqueta, valor], i) => {
    texto(etiqueta.toUpperCase(), MARGEN + i * tercio, y, { tam: 7, fuente: negrita, color: SUAVE });
    partir(valor, tercio - 8, negrita, 9)
      .slice(0, 2)
      .forEach((l, n) => texto(l, MARGEN + i * tercio, y - 12 - n * 11, { tam: 9, fuente: negrita }));
  });
  y -= 36;
  raya(y);
  y -= 22;

  /* ── Ítems ──────────────────────────────────────────────────────────────── */
  const col = { item: MARGEN, desc: MARGEN + 26, um: derecha - 150, cant: derecha };
  const anchoDesc = col.um - col.desc - 8;

  const cabeceraTabla = () => {
    texto("ÍTEM", col.item, y, { tam: 7.5, fuente: negrita });
    texto("DESCRIPCIÓN", col.desc, y, { tam: 7.5, fuente: negrita });
    texto("UM", col.um, y, { tam: 7.5, fuente: negrita });
    texto("CANTIDAD", col.cant, y, { tam: 7.5, fuente: negrita, alinear: "der" });
    y -= 6;
    raya(y, 1.2, TINTA);
    y -= 13;
  };

  const asegurar = (alto: number, conTabla = true) => {
    if (y - alto > MARGEN + 30) return;
    pie(pagina);
    pagina = doc.addPage([A4.ancho, A4.alto]);
    y = A4.alto - MARGEN;
    texto(`${emisorOC.razonSocial} · Solicitud de cotización ${r.numero} (continuación)`, MARGEN, y - 8, {
      tam: 8,
      color: SUAVE,
    });
    y -= 28;
    if (conTabla) cabeceraTabla();
  };

  cabeceraTabla();
  r.items.forEach((it, n) => {
    const lineas = partir(it.descripcion, anchoDesc, normal, 8.5);
    asegurar(lineas.length * 11 + 8);
    texto(String(n + 1), col.item, y, { tam: 8.5 });
    lineas.forEach((l, i) => texto(l, col.desc, y - i * 11, { tam: 8.5 }));
    texto(it.unidad, col.um, y, { tam: 8.5 });
    texto(cantidad(it.cantidad), col.cant, y, { tam: 8.5, fuente: negrita, alinear: "der" });
    y -= lineas.length * 11 + 4;
    raya(y + 2, 0.4);
    y -= 9;
  });
  y -= 10;

  /* ── Observaciones y aviso ──────────────────────────────────────────────── */
  const parrafos: [string, string][] = [];
  if (r.observaciones?.trim()) parrafos.push(["OBSERVACIONES", r.observaciones.trim()]);
  parrafos.push([
    "CÓMO RESPONDER",
    `Responda indicando el número ${r.numero}${r.emisorCorreo ? ` a ${r.emisorCorreo}` : ""}, con precio unitario, plazo de entrega y condición de pago. La cotización no constituye orden de compra: la compra se formaliza únicamente con una orden emitida por ${emisorOC.razonSocial}.`,
  ]);
  for (const [titulo, cuerpo] of parrafos) {
    const lineas = cuerpo
      .split(/\r?\n/)
      .flatMap((renglon) => partir(renglon, ancho, normal, 8.5));
    asegurar(lineas.length * 11 + 30, false);
    texto(titulo, MARGEN, y, { tam: 7.5, fuente: negrita, color: SUAVE });
    y -= 13;
    lineas.forEach((l) => {
      texto(l, MARGEN, y, { tam: 8.5 });
      y -= 11;
    });
    y -= 12;
  }

  pie(pagina);

  /** Firma de Teo Labs con el degradado por letra (cada letra es máscara de recorte). */
  function pie(p: PDFPage) {
    const tam = 9;
    const antes = "Desarrollado por ";
    const firma = "Teo Labs";
    const despues = " ®";
    const anchoFirma = [...firma].reduce(
      (t, c) => t + (c === " " ? tam * 0.2 : negrita.widthOfTextAtSize(c, tam)),
      0,
    );
    const total =
      normal.widthOfTextAtSize(antes, tam) + anchoFirma + normal.widthOfTextAtSize(despues, tam);
    let x = (A4.ancho - total) / 2;
    const base = MARGEN - 18;

    p.drawText(antes, { x, y: base, size: tam, font: normal, color: SUAVE });
    x += normal.widthOfTextAtSize(antes, tam);
    const inicioFirma = x;

    const clave = p.node.newFontDictionary(negrita.name, negrita.ref);
    for (const c of firma) {
      if (c === " ") {
        x += tam * 0.2;
        continue;
      }
      const w = negrita.widthOfTextAtSize(c, tam);
      p.pushOperators(
        pushGraphicsState(),
        beginText(),
        setFontAndSize(clave, tam),
        setTextRenderingMode(TextRenderingMode.Clip),
        moveText(x, base),
        showText(negrita.encodeText(c)),
        endText(),
      );
      const franjas = 14;
      for (let i = 0; i < franjas; i++) {
        p.drawRectangle({
          x: x + (w * i) / franjas,
          y: base - tam * 0.3,
          width: w / franjas + 0.05,
          height: tam * 1.3,
          color: colorDelDegradado((i + 0.5) / franjas),
        });
      }
      p.pushOperators(popGraphicsState());
      x += w;
    }

    p.drawText(despues, { x, y: base, size: tam, font: normal, color: SUAVE });

    const enlace = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [inicioFirma, base - 3, inicioFirma + anchoFirma, base + tam],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of("https://www.teolabs.app") },
      }),
    );
    p.node.addAnnot(enlace);
  }

  return doc.save();
}
