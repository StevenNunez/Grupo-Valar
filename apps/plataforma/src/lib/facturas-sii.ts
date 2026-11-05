"use client";

import { supabase } from "./supabase";
import type { CuentaPorPagar } from "./pagos";

/**
 * Facturas del SII (0116): el detalle del Registro de Compras, descargado del
 * portal del SII como CSV, se sube acá y se cruza con las órdenes abiertas.
 *
 * Se leen dos tipos de archivo del SII:
 *   · el XML de «Documentos recibidos» (DTE_DOWN…xml): el documento completo, con
 *     sus líneas, la fecha de vencimiento y las referencias (la OC que cita);
 *   · el CSV del Registro de Compras, leído por NOMBRE de columna (no por
 *     posición): el SII ha cambiado el orden y los títulos varían un poco.
 * El SII entrega de a 20 documentos por descarga: se pueden subir varios archivos
 * juntos y los repetidos se descartan.
 */

export type DocumentoSii = {
  rutEmisor: string;
  razonSocial: string;
  tipoDocumento: number;
  folio: string;
  fechaEmision: string | null;
  fechaRecepcion: string | null;
  exento: number;
  neto: number;
  iva: number;
  total: number;
  /** Fecha de vencimiento que trae el documento (solo el XML). */
  vencimiento: string | null;
  /** Órdenes de compra que cita (referencias y descripciones), en dígitos: «22001154». Con «*» al inicio, solo el final del número. */
  ocMencionadas: string[];
  /** Lo que vino en el archivo, para guardarlo tal cual. */
  datos: Record<string, unknown>;
};

export type FacturaSii = DocumentoSii & {
  id: string;
  estado: "detectada" | "ignorada";
  /** La rendición (compras.id) a la que se llevó el documento (0117). */
  compraId: string | null;
  /** Lo que se compró, en una línea: «Aramco ProForce Diesel» o «Arriendo de bus y 1 más». */
  resumen: string;
};

/** Qué se compró, a partir de las líneas del XML. */
function resumenDe(datos: Record<string, unknown> | null): string {
  const lineas = Array.isArray(datos?.detalle) ? (datos.detalle as { descripcion?: string }[]) : [];
  const nombres = lineas.map((l) => (l.descripcion ?? "").trim()).filter(Boolean);
  if (nombres.length === 0) return "";
  return nombres.length === 1 ? nombres[0] : `${nombres[0]} y ${nombres.length - 1} más`;
}

export const nombreTipoDocumento: Record<number, string> = {
  30: "Factura",
  33: "Factura",
  34: "Factura exenta",
  39: "Boleta",
  41: "Boleta exenta",
  52: "Guía de despacho",
  45: "Factura de compra",
  46: "Factura de compra",
  55: "Nota de débito",
  56: "Nota de débito",
  60: "Nota de crédito",
  61: "Nota de crédito",
};
export const esNotaDeCredito = (t: number) => t === 60 || t === 61;
export const esNotaDeDebito = (t: number) => t === 55 || t === 56;
/** La guía de despacho acompaña la mercadería; no se cobra ni se registra como factura. */
export const esGuia = (t: number) => t === 52;

/* ── Leer el archivo ──────────────────────────────────────────────────────── */

/** El SII entrega el archivo en Windows-1252 o en UTF-8: se prueba UTF-8 y, si no calza, el otro. */
export function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** "76.123.456-7", "761234567" o "76123456-k" → "76123456-7" / "76123456-K". Vacío si no parece un RUT. */
export function normalizarRut(texto: string): string {
  const limpio = texto.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return "";
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const clave = (s: string) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parte una línea con comillas. */
function partirLinea(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entre = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entre && linea[i + 1] === '"') { actual += '"'; i++; } else entre = !entre;
    } else if (c === sep && !entre) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas.map((x) => x.trim());
}

const entero = (t: string | undefined) => {
  const n = Number((t ?? "").replace(/\./g, "").replace(/,.*$/, "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** "15/10/2026", "15-10-2026" o "2026-10-15" → "2026-10-15". */
function fechaIso(t: string | undefined): string | null {
  const s = (t ?? "").trim().slice(0, 10);
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export type LecturaSii = { documentos: DocumentoSii[]; ignoradas: number; error?: string };

/* ── El XML de «Documentos recibidos» ─────────────────────────────────────── */

const entidades: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const sinEntidades = (t: string) => t.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => entidades[e]).replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

/** El texto de la primera etiqueta con ese nombre dentro de un trozo de XML. */
function etiqueta(xml: string, nombre: string): string {
  const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`).exec(xml);
  return m ? sinEntidades(m[1]).trim() : "";
}
const bloques = (xml: string, nombre: string) =>
  [...xml.matchAll(new RegExp(`<${nombre}(?:\\s[^>]*)?>[\\s\\S]*?</${nombre}>`, "g"))].map((m) => m[0]);

/**
 * Las órdenes de compra que cita un documento: «OC22-001154», «SEGUN OC 22-001011»,
 * «Orden de compra 22-001011». Devuelve dígitos («22001154»); si solo trae el
 * correlativo («1011»), va con «*» y se compara por el final del número.
 */
export function ordenesCitadas(textos: string[], foliosDeOrden: string[]): string[] {
  const encontradas = new Set<string>();
  const patron = /(?:\bo\.?\s?c\.?|orden\s+de\s+compra)\s*(?:n[°ºo]\.?\s*)?[:#-]?\s*(\d{2})\s*[-–_. ]?\s*(\d{3,6})\b/gi;
  for (const t of textos) {
    for (const m of t.matchAll(patron)) encontradas.add(m[1] + String(Number(m[2])));
  }
  for (const f of foliosDeOrden) {
    const solo = f.replace(/\D/g, "");
    if (/^\d{2}\D?\d{3,6}$/.test(f.replace(/^\s*o\.?c\.?\s*/i, "").trim())) continue; // ya lo vio el patrón
    if (solo.length >= 3 && solo.length <= 6) encontradas.add("*" + String(Number(solo)));
  }
  return [...encontradas];
}

export function leerXmlSii(texto: string): LecturaSii {
  const dtes = bloques(texto, "DTE");
  if (dtes.length === 0) return { documentos: [], ignoradas: 0, error: "No encontré documentos en el XML." };

  const documentos: DocumentoSii[] = [];
  let ignoradas = 0;
  for (const dte of dtes) {
    const idDoc = etiqueta(dte, "IdDoc");
    const emisor = etiqueta(dte, "Emisor");
    const totales = etiqueta(dte, "Totales");
    const rut = normalizarRut(etiqueta(emisor, "RUTEmisor"));
    const folio = etiqueta(idDoc, "Folio").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const tipo = Number(etiqueta(idDoc, "TipoDTE"));
    if (!rut || !folio || !tipo) { ignoradas++; continue; }

    const detalle = bloques(dte, "Detalle").map((d) => ({
      descripcion: etiqueta(d, "NmbItem"),
      detalle: etiqueta(d, "DscItem"),
      cantidad: etiqueta(d, "QtyItem"),
      precio: etiqueta(d, "PrcItem"),
      monto: etiqueta(d, "MontoItem"),
    }));
    const referencias = bloques(dte, "Referencia").map((r) => ({
      tipo: etiqueta(r, "TpoDocRef"),
      folio: etiqueta(r, "FolioRef"),
      razon: etiqueta(r, "RazonRef"),
    }));
    const neto = entero(etiqueta(totales, "MntNeto"));
    const exento = entero(etiqueta(totales, "MntExe"));
    const iva = entero(etiqueta(totales, "IVA"));
    const total = entero(etiqueta(totales, "MntTotal")) || neto + exento + iva;
    const ocMencionadas = ordenesCitadas(
      [...detalle.flatMap((d) => [d.descripcion, d.detalle]), ...referencias.flatMap((r) => [r.folio, r.razon])],
      referencias.filter((r) => r.tipo === "801").map((r) => r.folio),
    );
    const vencimiento = fechaIso(etiqueta(idDoc, "FchVenc"));

    documentos.push({
      rutEmisor: rut,
      razonSocial: etiqueta(emisor, "RznSoc"),
      tipoDocumento: tipo,
      folio,
      fechaEmision: fechaIso(etiqueta(idDoc, "FchEmis")),
      fechaRecepcion: null,
      exento, neto, iva, total,
      vencimiento,
      ocMencionadas,
      datos: {
        origen: "xml",
        formaPago: etiqueta(idDoc, "FmaPago"),
        vencimiento,
        oc: ocMencionadas,
        referencias,
        detalle,
        receptor: normalizarRut(etiqueta(etiqueta(dte, "Receptor"), "RUTRecep")),
      },
    });
  }
  return { documentos: sinRepetidos(documentos), ignoradas };
}

function sinRepetidos(documentos: DocumentoSii[]): DocumentoSii[] {
  const vistos = new Set<string>();
  return documentos.filter((d) => {
    const k = `${d.rutEmisor}|${d.tipoDocumento}|${d.folio}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Reconoce el tipo de archivo por lo que trae adentro. */
export function leerArchivoSii(texto: string): LecturaSii {
  const inicio = texto.trimStart().slice(0, 400).toLowerCase();
  if (inicio.startsWith("<table") || inicio.startsWith("<html")) {
    return {
      documentos: [],
      ignoradas: 0,
      error: "Ese es el listado en Excel/texto del SII. Sube el archivo XML: trae lo mismo y además las referencias y el vencimiento.",
    };
  }
  if (inicio.includes("<setdte") || inicio.includes("<dte")) return leerXmlSii(texto);
  return leerCsvSii(texto);
}

export function leerCsvSii(texto: string): LecturaSii {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) return { documentos: [], ignoradas: 0, error: "El archivo está vacío." };

  const cabecera = lineas[0];
  const sep = [";", "\t", ","].map((s) => [s, cabecera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const titulos = partirLinea(cabecera, sep);
  const claves = titulos.map(clave);
  const col = (...alternativas: string[]) => {
    for (const a of alternativas) {
      const i = claves.findIndex((c) => c === a);
      if (i !== -1) return i;
    }
    for (const a of alternativas) {
      const i = claves.findIndex((c) => c.startsWith(a));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iRut = col("rutproveedor", "rutemisor", "rut");
  const iFolio = col("folio");
  const iTipo = col("tipodoc", "tipodocumento");
  if (iRut === -1 || iFolio === -1 || iTipo === -1) {
    return {
      documentos: [],
      ignoradas: 0,
      error: "No reconocí las columnas. Tiene que ser el detalle del Registro de Compras del SII (con RUT Proveedor, Tipo Doc y Folio).",
    };
  }
  const iRazon = col("razonsocial", "nombre");
  const iFecha = col("fechadocto", "fechadocumento", "fechaemision");
  const iRecep = col("fecharecepcion");
  const iExento = col("montoexento", "exento");
  const iNeto = col("montoneto", "neto");
  const iIva = col("montoivarecuperable", "montoiva", "iva");
  const iTotal = col("montototal", "total");

  const documentos: DocumentoSii[] = [];
  let ignoradas = 0;
  for (const linea of lineas.slice(1)) {
    const c = partirLinea(linea, sep);
    const rut = normalizarRut(c[iRut] ?? "");
    const folio = (c[iFolio] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const tipo = Number((c[iTipo] ?? "").replace(/\D/g, ""));
    if (!rut || !folio || !tipo) { ignoradas++; continue; }
    const exento = entero(c[iExento]);
    const neto = entero(c[iNeto]);
    const iva = entero(c[iIva]);
    const total = iTotal === -1 ? exento + neto + iva : entero(c[iTotal]);
    documentos.push({
      rutEmisor: rut,
      razonSocial: iRazon === -1 ? "" : c[iRazon] ?? "",
      tipoDocumento: tipo,
      folio,
      fechaEmision: iFecha === -1 ? null : fechaIso(c[iFecha]),
      fechaRecepcion: iRecep === -1 ? null : fechaIso(c[iRecep]),
      exento, neto, iva, total,
      vencimiento: null,
      ocMencionadas: [],
      datos: Object.fromEntries(titulos.map((t, i) => [t, c[i] ?? ""])),
    });
  }
  // Un mismo documento repetido en el archivo cuenta una vez.
  return { documentos: sinRepetidos(documentos), ignoradas };
}

/* ── Guardar y leer ───────────────────────────────────────────────────────── */

type Fila = {
  id: string; rut_emisor: string; razon_social: string | null; tipo_documento: number; folio: string;
  fecha_emision: string | null; fecha_recepcion: string | null; exento: number; neto: number; iva: number;
  total: number; estado: "detectada" | "ignorada"; datos: Record<string, unknown> | null; compra_id: string | null;
};

const deFila = (f: Fila): FacturaSii => ({
  id: f.id, rutEmisor: f.rut_emisor, razonSocial: f.razon_social ?? "", tipoDocumento: Number(f.tipo_documento),
  folio: f.folio, fechaEmision: f.fecha_emision, fechaRecepcion: f.fecha_recepcion,
  exento: Number(f.exento), neto: Number(f.neto), iva: Number(f.iva), total: Number(f.total),
  estado: f.estado, datos: f.datos ?? {},
  compraId: f.compra_id ?? null,
  resumen: resumenDe(f.datos),
  vencimiento: typeof f.datos?.vencimiento === "string" ? f.datos.vencimiento : null,
  ocMencionadas: Array.isArray(f.datos?.oc) ? (f.datos.oc as string[]) : [],
});

/**
 * Guarda los documentos nuevos y deja tal cual los que ya estaban (así una factura
 * ignorada no vuelve a aparecer al subir de nuevo el mismo mes).
 */
export async function guardarDocumentosSii(documentos: DocumentoSii[]): Promise<{ nuevos: number; yaEstaban: number }> {
  let nuevos = 0;
  for (let i = 0; i < documentos.length; i += 200) {
    const filas = documentos.slice(i, i + 200).map((d) => ({
      rut_emisor: d.rutEmisor, razon_social: d.razonSocial || null, tipo_documento: d.tipoDocumento, folio: d.folio,
      fecha_emision: d.fechaEmision, fecha_recepcion: d.fechaRecepcion, exento: d.exento, neto: d.neto, iva: d.iva,
      total: d.total, datos: d.datos, origen: "archivo",
    }));
    const { data, error } = await supabase
      .from("facturas_sii")
      .upsert(filas, { onConflict: "empresa_id,rut_emisor,tipo_documento,folio", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (/facturas_sii/.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
        throw new Error("Falta aplicar la migración 0116 en Supabase.");
      }
      throw new Error(/row-level security/i.test(error.message) ? "Tu acceso no permite cargar facturas." : error.message);
    }
    nuevos += data?.length ?? 0;
  }
  return { nuevos, yaEstaban: documentos.length - nuevos };
}

/** Lo más reciente primero. Con `texto` busca en la base por proveedor, RUT o folio. */
export async function cargarFacturasSii(limite: number, texto: string): Promise<FacturaSii[]> {
  let q = supabase.from("facturas_sii").select("*").order("fecha_emision", { ascending: false, nullsFirst: false }).limit(limite);
  const t = texto.trim();
  if (t) {
    const seguro = t.replace(/[,()%*]/g, " ");
    const rut = normalizarRut(t);
    q = q.or(`razon_social.ilike.%${seguro}%,folio.eq.${seguro.replace(/\D/g, "") || "0"}${rut ? `,rut_emisor.eq.${rut}` : ""}`);
  }
  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Fila[]).map(deFila);
}

/** Los documentos que se llevaron a una rendición (0117). */
export async function marcarRendidas(ids: string[], compraId: string) {
  const { error } = await supabase.from("facturas_sii").update({ compra_id: compraId }).in("id", ids);
  if (error) throw new Error(error.message);
}

export type LineaDeRendicion = {
  fecha: string;
  tipo_documento: "factura" | "otro";
  documento: string;
  comercio: string;
  descripcion: string;
  pagado: number;
};

/**
 * El documento como un gasto de rendición. La factura exenta va como «otro»: no
 * lleva IVA que recuperar, y el costo es todo lo pagado.
 */
export function comoLineaDeRendicion(d: FacturaSii): LineaDeRendicion {
  return {
    fecha: d.fechaEmision ?? "",
    tipo_documento: d.tipoDocumento === 34 || d.iva === 0 ? "otro" : "factura",
    documento: d.folio,
    comercio: d.razonSocial,
    descripcion: d.resumen || d.razonSocial,
    pagado: d.total,
  };
}

export async function marcarIgnorada(id: string, ignorar: boolean) {
  const { error } = await supabase.from("facturas_sii").update({ estado: ignorar ? "ignorada" : "detectada" }).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ── El cruce ─────────────────────────────────────────────────────────────── */

export type OrdenCandidata = {
  ordenId: string; numero: string; contratoId: string; saldoNeto: number;
  /** El monto de la factura es el saldo de la orden. */
  exacta: boolean;
  /** La factura cita esta orden. */
  citada: boolean;
};

export type Cruce =
  | { tipo: "nota_credito" | "nota_debito" | "guia" | "ignorada" | "cargada" }
  /** Ya se llevó a una rendición que sigue existiendo. */
  | { tipo: "rendida"; compraId: string }
  | { tipo: "sin_proveedor" }
  | { tipo: "sin_orden"; citadas: string[] }
  | { tipo: "con_orden"; candidatas: OrdenCandidata[] };

export type ContextoCruce = {
  /** `rut|folio` de lo que ya está cargado en la plataforma. */
  cargadas: Set<string>;
  /** Los documentos (id) cuya rendición sigue existiendo. */
  rendidas: Set<string>;
  /** RUT normalizados de los proveedores registrados. */
  ruts: Set<string>;
  /** Saldos sin facturar de las órdenes abiertas, tal como los muestra Pagos. */
  ordenes: CuentaPorPagar[];
};

const TOLERANCIA = 2; // pesos de redondeo

export function cruzar(d: FacturaSii, ctx: ContextoCruce): Cruce {
  if (d.estado === "ignorada") return { tipo: "ignorada" };
  if (d.compraId && ctx.rendidas.has(d.id)) return { tipo: "rendida", compraId: d.compraId };
  if (esNotaDeCredito(d.tipoDocumento)) return { tipo: "nota_credito" };
  if (esNotaDeDebito(d.tipoDocumento)) return { tipo: "nota_debito" };
  if (esGuia(d.tipoDocumento)) return { tipo: "guia" };
  if (ctx.cargadas.has(`${d.rutEmisor}|${d.folio}`)) return { tipo: "cargada" };
  if (!ctx.ruts.has(d.rutEmisor)) return { tipo: "sin_proveedor" };

  const neto = d.neto + d.exento;
  const candidatas = ctx.ordenes
    .filter((o) => o.origen === "orden" && o.ordenId && o.rut && normalizarRut(o.rut) === d.rutEmisor)
    .map((o) => {
      const digitos = (o.ordenNumero ?? "").replace(/\D/g, "");
      return {
        ordenId: o.ordenId!, numero: o.ordenNumero ?? o.ordenId!, contratoId: o.contratoId, saldoNeto: o.neto,
        exacta: Math.abs(o.neto - neto) <= TOLERANCIA,
        citada: digitos.length >= 3 && d.ocMencionadas.some((m) => (m.startsWith("*") ? String(Number(digitos.slice(2))) === m.slice(1) : digitos.slice(0, 2) + String(Number(digitos.slice(2))) === m)),
      };
    })
    // Primero las que la factura cita, luego las que calzan en monto; después, por número.
    .sort((a, b) => Number(b.citada) - Number(a.citada) || Number(b.exacta) - Number(a.exacta) || a.numero.localeCompare(b.numero));
  return candidatas.length > 0 ? { tipo: "con_orden", candidatas } : { tipo: "sin_orden", citadas: d.ocMencionadas };
}

/** Lo que ya está cargado en la plataforma, para reconocerlo por N° de factura y proveedor. */
export async function cargarContextoSii(
  docs: FacturaSii[],
): Promise<{ cargadas: Set<string>; rendidas: Set<string>; ruts: Set<string> }> {
  const folios = docs.map((d) => d.folio);
  const { data: provs } = await supabase.from("proveedores").select("id, rut");
  const rutDe = new Map<string, string>();
  const ruts = new Set<string>();
  for (const p of (provs ?? []) as { id: string; rut: string | null }[]) {
    const r = normalizarRut(p.rut ?? "");
    if (r) { rutDe.set(p.id, r); ruts.add(r); }
  }

  const unicos = [...new Set(folios)];
  const compras: { documento: string | null; proveedor_id: string | null; orden_id: string | null }[] = [];
  for (let i = 0; i < unicos.length; i += 150) {
    const trozo = unicos.slice(i, i + 150);
    // El N° puede estar guardado con ceros a la izquierda: se piden las dos formas.
    const formas = trozo.flatMap((f) => [f, f.padStart(f.length + 1, "0")]);
    const { data } = await supabase.from("compras").select("documento, proveedor_id, orden_id").in("documento", formas);
    compras.push(...((data ?? []) as typeof compras));
  }
  const ordenIds = [...new Set(compras.filter((c) => !c.proveedor_id && c.orden_id).map((c) => c.orden_id!))];
  const provDeOrden = new Map<string, string>();
  for (let i = 0; i < ordenIds.length; i += 150) {
    const { data } = await supabase.from("ordenes_compra_proveedor").select("id, proveedor_id").in("id", ordenIds.slice(i, i + 150));
    for (const o of (data ?? []) as { id: string; proveedor_id: string | null }[]) if (o.proveedor_id) provDeOrden.set(o.id, o.proveedor_id);
  }
  const cargadas = new Set<string>();
  for (const c of compras) {
    const pid = c.proveedor_id ?? (c.orden_id ? provDeOrden.get(c.orden_id) : undefined);
    const rut = pid ? rutDe.get(pid) : undefined;
    const folio = (c.documento ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (rut && folio) cargadas.add(`${rut}|${folio}`);
  }

  // Las rendiciones a las que se llevaron documentos: solo cuentan si siguen existiendo.
  const compraIds = [...new Set(docs.map((d) => d.compraId).filter((x): x is string => !!x))];
  const existentes = new Set<string>();
  for (let i = 0; i < compraIds.length; i += 150) {
    const { data } = await supabase.from("compras").select("id").in("id", compraIds.slice(i, i + 150));
    for (const c of (data ?? []) as { id: string }[]) existentes.add(c.id);
  }
  const rendidas = new Set(docs.filter((d) => d.compraId && existentes.has(d.compraId)).map((d) => d.id));
  return { cargadas, rendidas, ruts };
}
