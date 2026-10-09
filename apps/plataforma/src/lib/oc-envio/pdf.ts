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
import type { OrdenParaEnviar } from "./datos";

/**
 * El PDF de la orden de compra, armado en el servidor.
 *
 * Copia la hoja de `OrdenImprimible` —emisor y proveedor lado a lado, la tabla
 * de ítems, los totales y las tres firmas—, que es el formato que Valar ya
 * usaba en sus 114 órdenes. Se arma acá y no con la impresión del navegador
 * porque tiene que salir IGUAL desde el computador y desde el celular, y
 * porque va adjunto a un correo que manda el servidor.
 *
 * Las fuentes son las estándar del PDF (Helvetica): no hay que embeber nada y
 * el archivo pesa unos pocos KB. Solo saben latín básico, así que lo que no
 * cabe (″, emojis) se cambia por algo parecido en `limpio()`.
 */

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 42;
const TINTA = rgb(0.07, 0.11, 0.16);
const SUAVE = rgb(0.38, 0.43, 0.49);
const LINEA = rgb(0.85, 0.87, 0.9);

/* El degradado de la firma de Teo Labs (`InteractiveLogo`): from-blue-600
   via-purple-500 to-green-500, CADA LETRA con el degradado entero, de
   izquierda a derecha. No se rediseña: se reproduce. */
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

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;
const numero = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
const fecha = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
};

export async function pdfDeOrden(o: OrdenParaEnviar): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Orden de compra ${o.numero}`);
  doc.setAuthor(emisorOC.razonSocial);
  doc.setCreator("Plataforma Valar · Teo Labs");

  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const permitidos = new Set(normal.getCharacterSet());

  /** Lo que Helvetica no sabe dibujar se reemplaza en vez de romper el PDF. */
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

  /** Corta un texto en líneas que caben en `max` puntos. */
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
  // El isotipo V-A, con los trazos del manual de marca (components/Logo).
  const escala = 40 / 275.01;
  for (const trazo of [MARK_V, MARK_A]) {
    pagina.drawSvgPath(trazo, { x: MARGEN, y: y - 4, scale: escala, color: TINTA });
  }
  const xMarca = MARGEN + 50;
  texto(emisorOC.razonSocial, xMarca, y - 14, { tam: 16, fuente: negrita });
  texto(`RUT ${emisorOC.rut}`, xMarca, y - 28, { tam: 9, color: SUAVE });
  texto("ORDEN DE COMPRA", derecha, y - 14, { tam: 16, fuente: negrita, alinear: "der" });
  texto(o.numero, derecha, y - 30, { tam: 12, fuente: negrita, alinear: "der" });
  y -= 42;
  raya(y, 1.6, TINTA);
  y -= 20;

  /* ── Emisor y proveedor ─────────────────────────────────────────────────── */
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
  const finEmisor = bloque("Emite", MARGEN, [
    ["Rut", emisorOC.rut],
    ["Dirección", emisorOC.direccion],
    ["Ciudad", `${emisorOC.ciudad}, ${emisorOC.region}`],
    ["Contacto", o.emisorNombre],
    ["Correo", o.emisorCorreo],
    ["Teléfono", o.emisorTelefono],
  ]);
  const finProveedor = bloque("Proveedor", MARGEN + mitad + 24, [
    ["Razón social", o.proveedor],
    ["Rut", o.rutProveedor],
    ["Dirección", o.direccionProveedor],
    ["Ciudad", [o.ciudadProveedor, o.comunaProveedor].filter(Boolean).join(", ")],
    ["Contacto", o.contacto],
    ["Correo", o.correoContacto],
    ["Teléfono", o.telefonoContacto],
  ]);
  y = Math.min(finEmisor, finProveedor) - 8;

  /* ── Condiciones ────────────────────────────────────────────────────────── */
  raya(y);
  y -= 13;
  const cuarto = ancho / 4;
  (
    [
      ["Fecha", fecha(o.fechaEmision)],
      ["Forma de pago", o.condicionesPago || "—"],
      ["Requerida para", fecha(o.fechaRequerida)],
      ["Lugar de entrega", o.lugarEntrega || "—"],
    ] as const
  ).forEach(([etiqueta, valor], i) => {
    texto(etiqueta.toUpperCase(), MARGEN + i * cuarto, y, { tam: 7, fuente: negrita, color: SUAVE });
    partir(valor, cuarto - 8, negrita, 9).slice(0, 2).forEach((l, n) =>
      texto(l, MARGEN + i * cuarto, y - 12 - n * 11, { tam: 9, fuente: negrita }),
    );
  });
  y -= 36;
  raya(y);
  y -= 22;

  /* ── Ítems ──────────────────────────────────────────────────────────────── */
  const col = {
    item: MARGEN,
    desc: MARGEN + 26,
    um: derecha - 250,
    cant: derecha - 165,
    pu: derecha - 85,
    total: derecha,
  };
  const anchoDesc = col.um - col.desc - 8;

  const cabeceraTabla = () => {
    texto("ÍTEM", col.item, y, { tam: 7.5, fuente: negrita });
    texto("DESCRIPCIÓN", col.desc, y, { tam: 7.5, fuente: negrita });
    texto("UM", col.um, y, { tam: 7.5, fuente: negrita });
    texto("CANTIDAD", col.cant, y, { tam: 7.5, fuente: negrita, alinear: "der" });
    texto("P. UNITARIO", col.pu, y, { tam: 7.5, fuente: negrita, alinear: "der" });
    texto("TOTAL", col.total, y, { tam: 7.5, fuente: negrita, alinear: "der" });
    y -= 6;
    raya(y, 1.2, TINTA);
    y -= 13;
  };

  /** Si no cabe lo que viene, hoja nueva con la cabecera de la tabla. */
  const asegurar = (alto: number, conTabla = true) => {
    if (y - alto > MARGEN + 30) return;
    pie(pagina);
    pagina = doc.addPage([A4.ancho, A4.alto]);
    y = A4.alto - MARGEN;
    texto(`${emisorOC.razonSocial} · Orden de compra ${o.numero} (continuación)`, MARGEN, y - 8, {
      tam: 8,
      color: SUAVE,
    });
    y -= 28;
    if (conTabla) cabeceraTabla();
  };

  cabeceraTabla();
  if (o.items.length === 0) {
    texto("Esta orden no tiene ítems.", A4.ancho / 2, y, { tam: 9, color: SUAVE, alinear: "centro" });
    y -= 16;
  }
  o.items.forEach((it, n) => {
    const desc = it.tipo === "reembolsable" ? `${it.descripcion} [REEMBOLSABLE]` : it.descripcion;
    const lineas = partir(desc, anchoDesc, normal, 8.5);
    asegurar(lineas.length * 11 + 8);
    texto(String(n + 1), col.item, y, { tam: 8.5 });
    lineas.forEach((l, i) => texto(l, col.desc, y - i * 11, { tam: 8.5 }));
    texto(it.unidad, col.um, y, { tam: 8.5 });
    texto(numero(it.cantidad), col.cant, y, { tam: 8.5, alinear: "der" });
    texto(pesos(it.precioUnitario), col.pu, y, { tam: 8.5, alinear: "der" });
    texto(pesos(it.neto), col.total, y, { tam: 8.5, fuente: negrita, alinear: "der" });
    y -= lineas.length * 11 + 4;
    raya(y + 2, 0.4);
    y -= 9;
  });

  /* ── Totales ────────────────────────────────────────────────────────────── */
  const neto = o.items.reduce((t, i) => t + i.neto, 0);
  const iva = o.items.reduce((t, i) => t + i.iva, 0);
  asegurar(80, false);
  y -= 6;
  const xEtiqueta = derecha - 190;
  texto("Proyecto / Contrato", MARGEN, y, { tam: 8.5, color: SUAVE });
  partir(o.proyecto ?? o.contratoId, xEtiqueta - MARGEN - 110, normal, 8.5)
    .slice(0, 3)
    .forEach((l, i) => texto(l, MARGEN + 100, y - i * 11, { tam: 8.5 }));
  texto("Subtotal neto", xEtiqueta, y, { tam: 9, color: SUAVE });
  texto(pesos(neto), derecha, y, { tam: 9, alinear: "der" });
  y -= 15;
  texto("IVA 19%", xEtiqueta, y, { tam: 9, color: SUAVE });
  texto(pesos(iva), derecha, y, { tam: 9, alinear: "der" });
  y -= 9;
  raya(y, 1.4, TINTA, xEtiqueta, derecha);
  y -= 15;
  texto("TOTAL", xEtiqueta, y, { tam: 11, fuente: negrita });
  texto(pesos(neto + iva), derecha, y, { tam: 12, fuente: negrita, alinear: "der" });
  y -= 26;

  /* ── Observaciones ──────────────────────────────────────────────────────── */
  if (o.observaciones?.trim()) {
    // Cada renglón que escribió la persona se respeta; `partir` junta espacios.
    const lineas = o.observaciones
      .trim()
      .split(/\r?\n/)
      .flatMap((renglon) => partir(renglon, ancho, normal, 8.5));
    asegurar(lineas.length * 11 + 30, false);
    raya(y + 8);
    texto("OBSERVACIONES", MARGEN, y - 4, { tam: 7.5, fuente: negrita, color: SUAVE });
    y -= 17;
    lineas.forEach((l) => {
      texto(l, MARGEN, y, { tam: 8.5 });
      y -= 11;
    });
    y -= 10;
  }

  /* ── Firmas ─────────────────────────────────────────────────────────────── */
  asegurar(80, false);
  y -= 40;
  const tercio = ancho / 3;
  (
    [
      ["Solicitado por", o.solicitadoPor],
      ["Retira", o.retira],
      // Fijo: es el representante legal, no cambia por orden.
      ["Autorizado por", emisorOC.autorizadoPor],
    ] as const
  ).forEach(([etiqueta, nombre], i) => {
    const centro = MARGEN + tercio * i + tercio / 2;
    raya(y, 0.8, TINTA, centro - tercio / 2 + 10, centro + tercio / 2 - 10);
    texto(nombre || "—", centro, y - 12, { tam: 8.5, fuente: negrita, alinear: "centro" });
    texto(etiqueta, centro, y - 23, { tam: 8, color: SUAVE, alinear: "centro" });
  });

  pie(pagina);

  /**
   * Al pie de cada hoja, la firma de quien construyó la plataforma: igual que
   * en pantalla, "Desarrollado por Teo Labs ®" con "Teo Labs" en el degradado
   * de la firma, y el nombre enlazado a teolabs.app.
   *
   * El PDF no tiene texto con degradado, así que cada letra se usa como
   * MÁSCARA (modo de texto "recorte") y por detrás se pintan franjas finas con
   * los colores del degradado. Se ve como en la web, no como una aproximación.
   */
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

    // El nombre lleva a teolabs.app, como en el sitio.
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
