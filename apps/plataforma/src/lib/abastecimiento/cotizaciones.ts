"use client";

import { supabase } from "../supabase";
import type { EstadoSolped, Prioridad } from "./solped";

/* ── Cotizaciones ─────────────────────────────────────────────────────────── */

export type Cotizacion = {
  id: string;
  numero: string | null;
  solpedId: string;
  proveedorId: string;
  proveedor: string;
  solicitadaEn: string;
  recibidaEn: string | null;
  diasRespuesta: number | null;
  validezHasta: string | null;
  plazoEntregaDias: number | null;
  condicionPago: string | null;
  estado: string;
  seleccionada: boolean;
  motivoSeleccion: string | null;
  itemsNeto: number;
  descuento: number;
  flete: number;
  /** Lo único que sirve para decidir: lo que cuesta tenerlo en obra. */
  costoPuesto: number;
  itemsCotizados: number;
  itemsSinStock: number;
  /** El correo del proveedor, de su ficha. Es a quién se le manda la solicitud. */
  correoProveedor: string | null;
  contactoProveedor: string | null;
  /** Cuándo se le mandó. Nulo = está creada pero todavía no sale. */
  enviadaEn: string | null;
  enviadaA: string | null;
  observaciones: string | null;
};

export async function cargarComparativo(solpedId: string): Promise<Cotizacion[]> {
  const { data, error } = await supabase
    .from("comparativo_cotizaciones")
    .select("*")
    .eq("solped_id", solpedId)
    .order("costo_puesto");

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    numero: (f.numero as string | null) ?? null,
    solpedId: f.solped_id as string,
    proveedorId: f.proveedor_id as string,
    proveedor: f.proveedor as string,
    solicitadaEn: f.solicitada_en as string,
    recibidaEn: (f.recibida_en as string | null) ?? null,
    diasRespuesta: f.dias_respuesta === null ? null : Number(f.dias_respuesta),
    validezHasta: (f.validez_hasta as string | null) ?? null,
    plazoEntregaDias: f.plazo_entrega_dias === null ? null : Number(f.plazo_entrega_dias),
    condicionPago: (f.condicion_pago as string | null) ?? null,
    estado: f.estado as string,
    seleccionada: Boolean(f.seleccionada),
    motivoSeleccion: (f.motivo_seleccion as string | null) ?? null,
    itemsNeto: Number(f.items_neto),
    descuento: Number(f.descuento),
    flete: Number(f.flete),
    costoPuesto: Number(f.costo_puesto),
    itemsCotizados: Number(f.items_cotizados),
    itemsSinStock: Number(f.items_sin_stock),
    correoProveedor: (f.correo_proveedor as string | null) ?? null,
    contactoProveedor: (f.contacto_proveedor as string | null) ?? null,
    enviadaEn: (f.enviada_en as string | null) ?? null,
    enviadaA: (f.enviada_a as string | null) ?? null,
    observaciones: (f.observaciones as string | null) ?? null,
  }));
}

/* ── Expediente ───────────────────────────────────────────────────────────── */

export type Expediente = {
  id: string;
  numero: string;
  version: number;
  contratoId: string;
  contrato: string;
  solicitanteNombre: string;
  solicitanteCargo: string | null;
  area: string | null;
  tipoGasto: "ordinario" | "reembolsable";
  prioridad: Prioridad;
  estado: EstadoSolped;
  fechaEmision: string;
  fechaRequerida: string | null;
  diasAbierta: number;
  items: number;
  itemsPendientes: number;
  itemsCotizados: number;
  itemsComprados: number;
  itemsRecibidos: number;
  cantidadPedida: number;
  cantidadComprada: number;
  cantidadRecibida: number;
  compradoNeto: number;
  cotizaciones: number;
  cotizacionesRecibidas: number;
  mejorCosto: number | null;
  peorCosto: number | null;
  costoElegido: number | null;
  diferenciaVsMejor: number | null;
  ordenes: number;
  ordenesAbiertas: number;
  aprobaciones: number;
  ultimaFirma: string | null;
};

/** Todo el ciclo de una solicitud en una fila. */
export async function cargarExpediente(solpedId: string): Promise<Expediente | null> {
  const { data, error } = await supabase
    .from("expediente_solped")
    .select("*")
    .eq("id", solpedId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const f = data as Record<string, unknown>;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    id: f.id as string,
    numero: f.numero as string,
    version: Number(f.version),
    contratoId: f.contrato_id as string,
    contrato: f.contrato as string,
    solicitanteNombre: f.solicitante_nombre as string,
    solicitanteCargo: (f.solicitante_cargo as string | null) ?? null,
    area: (f.area as string | null) ?? null,
    tipoGasto: f.tipo_gasto as "ordinario" | "reembolsable",
    prioridad: f.prioridad as Prioridad,
    estado: f.estado as EstadoSolped,
    fechaEmision: f.fecha_emision as string,
    fechaRequerida: (f.fecha_requerida as string | null) ?? null,
    diasAbierta: Number(f.dias_abierta),
    items: Number(f.items),
    itemsPendientes: Number(f.items_pendientes),
    itemsCotizados: Number(f.items_cotizados),
    itemsComprados: Number(f.items_comprados),
    itemsRecibidos: Number(f.items_recibidos),
    cantidadPedida: Number(f.cantidad_pedida),
    cantidadComprada: Number(f.cantidad_comprada),
    cantidadRecibida: Number(f.cantidad_recibida),
    compradoNeto: Number(f.comprado_neto),
    cotizaciones: Number(f.cotizaciones),
    cotizacionesRecibidas: Number(f.cotizaciones_recibidas),
    mejorCosto: n(f.mejor_costo),
    peorCosto: n(f.peor_costo),
    costoElegido: n(f.costo_elegido),
    diferenciaVsMejor: n(f.diferencia_vs_mejor),
    ordenes: Number(f.ordenes),
    ordenesAbiertas: Number(f.ordenes_abiertas),
    aprobaciones: Number(f.aprobaciones),
    ultimaFirma: (f.ultima_firma as string | null) ?? null,
  };
}

/* ── Ítems de una cotización ──────────────────────────────────────────────── */

export type ItemCotizado = {
  id: string;
  cotizacionId: string;
  solpedItemId: string;
  cantidad: number;
  precioUnitario: number;
  neto: number;
  disponible: boolean;
  plazoDias: number | null;
  observacion: string | null;
  /** Como lo cotizó el proveedor (nombre técnico). Nulo = no se editó. */
  nombreCotizado: string | null;
  /** Con el que se le PIDIÓ a este proveedor, si se corrigió al pedir. Nulo = el del catálogo o el de faena. */
  nombrePedido: string | null;
};

export async function cargarItemsDeCotizacion(cotizacionId: string): Promise<ItemCotizado[]> {
  const { data, error } = await supabase
    .from("cotizacion_items")
    .select("*")
    .eq("cotizacion_id", cotizacionId);

  if (error) throw new Error(error.message);

  /* Sin ORDER BY Postgres devuelve las filas en el orden que le salga (en la
     práctica, el de la última modificación). El orden que importa es el de la
     solicitud: el de la línea de cada ítem. El proveedor recibe la lista tal
     como se escribió. */
  const filas = data ?? [];
  const lineas = new Map<string, number>();
  const ids = [...new Set(filas.map((f: Record<string, unknown>) => f.solped_item_id as string))];
  if (ids.length > 0) {
    const { data: pedidos } = await supabase.from("solped_items").select("id, linea").in("id", ids);
    for (const p of pedidos ?? []) lineas.set(p.id as string, Number(p.linea));
  }
  filas.sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      (lineas.get(a.solped_item_id as string) ?? 9999) - (lineas.get(b.solped_item_id as string) ?? 9999),
  );

  return filas.map((f: Record<string, unknown>) => ({
    id: f.id as string,
    cotizacionId: f.cotizacion_id as string,
    solpedItemId: f.solped_item_id as string,
    cantidad: Number(f.cantidad),
    precioUnitario: Number(f.precio_unitario),
    neto: Number(f.neto),
    disponible: Boolean(f.disponible),
    plazoDias: f.plazo_dias === null ? null : Number(f.plazo_dias),
    observacion: (f.observacion as string | null) ?? null,
    nombreCotizado: (f.nombre_cotizado as string | null)?.trim() || null,
    nombrePedido: (f.nombre_pedido as string | null)?.trim() || null,
  }));
}

/**
 * Cómo le llama este proveedor a cada artículo del catálogo, según lo que cotizó
 * antes. Sirve para proponer el nombre técnico al cargar sus precios, sin
 * tener que volver a escribirlo.
 */
export async function cargarNombresDeProveedor(
  proveedorId: string,
  articuloIds: string[],
): Promise<Map<string, string>> {
  if (articuloIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("articulo_proveedor")
    .select("articulo_id, nombre_proveedor")
    .eq("proveedor_id", proveedorId)
    .in("articulo_id", articuloIds);
  if (error) return new Map();
  return new Map((data ?? []).map((f) => [f.articulo_id as string, f.nombre_proveedor as string]));
}

