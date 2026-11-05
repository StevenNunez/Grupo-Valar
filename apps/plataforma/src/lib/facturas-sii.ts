"use client";

import { supabase } from "./supabase";
import type { CuentaPorPagar } from "./pagos";

/**
 * Facturas del SII (0116): el detalle del Registro de Compras, descargado del
 * portal del SII como CSV, se sube acá y se cruza con las órdenes abiertas.
 *
 * El archivo se lee por NOMBRE de columna (no por posición): el SII ha cambiado
 * el orden y los títulos varían un poco entre el Registro y el Resumen.
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
  datos: Record<string, string>;
};

export type FacturaSii = DocumentoSii & {
  id: string;
  estado: "detectada" | "ignorada";
};

export const nombreTipoDocumento: Record<number, string> = {
  30: "Factura",
  33: "Factura",
  34: "Factura exenta",
  45: "Factura de compra",
  46: "Factura de compra",
  55: "Nota de débito",
  56: "Nota de débito",
  60: "Nota de crédito",
  61: "Nota de crédito",
};
export const esNotaDeCredito = (t: number) => t === 60 || t === 61;
export const esNotaDeDebito = (t: number) => t === 55 || t === 56;

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

export function leerArchivoSii(texto: string): LecturaSii {
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
      datos: Object.fromEntries(titulos.map((t, i) => [t, c[i] ?? ""])),
    });
  }
  // Un mismo documento repetido en el archivo cuenta una vez.
  const vistos = new Set<string>();
  const unicos = documentos.filter((d) => {
    const k = `${d.rutEmisor}|${d.tipoDocumento}|${d.folio}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return { documentos: unicos, ignoradas };
}

/* ── Guardar y leer ───────────────────────────────────────────────────────── */

type Fila = {
  id: string; rut_emisor: string; razon_social: string | null; tipo_documento: number; folio: string;
  fecha_emision: string | null; fecha_recepcion: string | null; exento: number; neto: number; iva: number;
  total: number; estado: "detectada" | "ignorada"; datos: Record<string, string> | null;
};

const deFila = (f: Fila): FacturaSii => ({
  id: f.id, rutEmisor: f.rut_emisor, razonSocial: f.razon_social ?? "", tipoDocumento: Number(f.tipo_documento),
  folio: f.folio, fechaEmision: f.fecha_emision, fechaRecepcion: f.fecha_recepcion,
  exento: Number(f.exento), neto: Number(f.neto), iva: Number(f.iva), total: Number(f.total),
  estado: f.estado, datos: f.datos ?? {},
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

export async function marcarIgnorada(id: string, ignorar: boolean) {
  const { error } = await supabase.from("facturas_sii").update({ estado: ignorar ? "ignorada" : "detectada" }).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ── El cruce ─────────────────────────────────────────────────────────────── */

export type OrdenCandidata = { ordenId: string; numero: string; contratoId: string; saldoNeto: number; exacta: boolean };

export type Cruce =
  | { tipo: "nota_credito" | "nota_debito" | "ignorada" | "cargada" }
  | { tipo: "sin_proveedor" }
  | { tipo: "sin_orden" }
  | { tipo: "con_orden"; candidatas: OrdenCandidata[] };

export type ContextoCruce = {
  /** `rut|folio` de lo que ya está cargado en la plataforma. */
  cargadas: Set<string>;
  /** RUT normalizados de los proveedores registrados. */
  ruts: Set<string>;
  /** Saldos sin facturar de las órdenes abiertas, tal como los muestra Pagos. */
  ordenes: CuentaPorPagar[];
};

const TOLERANCIA = 2; // pesos de redondeo

export function cruzar(d: FacturaSii, ctx: ContextoCruce): Cruce {
  if (d.estado === "ignorada") return { tipo: "ignorada" };
  if (esNotaDeCredito(d.tipoDocumento)) return { tipo: "nota_credito" };
  if (esNotaDeDebito(d.tipoDocumento)) return { tipo: "nota_debito" };
  if (ctx.cargadas.has(`${d.rutEmisor}|${d.folio}`)) return { tipo: "cargada" };
  if (!ctx.ruts.has(d.rutEmisor)) return { tipo: "sin_proveedor" };

  const neto = d.neto + d.exento;
  const candidatas = ctx.ordenes
    .filter((o) => o.origen === "orden" && o.ordenId && o.rut && normalizarRut(o.rut) === d.rutEmisor)
    .map((o) => ({
      ordenId: o.ordenId!, numero: o.ordenNumero ?? o.ordenId!, contratoId: o.contratoId, saldoNeto: o.neto,
      exacta: Math.abs(o.neto - neto) <= TOLERANCIA,
    }))
    // Las que calzan en monto primero; después, las más antiguas por número.
    .sort((a, b) => Number(b.exacta) - Number(a.exacta) || a.numero.localeCompare(b.numero));
  return candidatas.length > 0 ? { tipo: "con_orden", candidatas } : { tipo: "sin_orden" };
}

/** Lo que ya está cargado en la plataforma, para reconocerlo por N° de factura y proveedor. */
export async function cargarContextoSii(folios: string[]): Promise<{ cargadas: Set<string>; ruts: Set<string> }> {
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
  return { cargadas, ruts };
}
