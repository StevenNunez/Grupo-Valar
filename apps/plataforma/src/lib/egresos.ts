"use client";

import type { Datos } from "./campos";
import { detalleDeOtrosHaberes, motivosHhExtra, type MontoHh, type OtroHaber } from "./haberes";
import { supabase } from "./supabase";

/**
 * Egresos del módulo: compras, servicios y costo de personal.
 *
 * Estas tres tablas son las que forman el costo real de cada contrato. El
 * Dashboard no guarda ese número: lo lee de la vista `contratos_resumen`, que
 * lo suma desde acá.
 */

/* ── Compras ──────────────────────────────────────────────────────────────── */

/**
 * Ordinario: costo propio de la obra, va contra el presupuesto.
 * Reembolsable: se le recupera al mandante, así que no castiga el margen.
 */
export type TipoCompra = "ordinario" | "reembolsable";

export const tiposCompra: { id: TipoCompra; titulo: string }[] = [
  { id: "ordinario", titulo: "Ordinario" },
  { id: "reembolsable", titulo: "Gasto reembolsable" },
];

export type EstadoPagoCompra = "pendiente" | "pagada";

export type Compra = {
  /** El anexo al que se carga (0059); nulo = contrato base. */
  anexoId: string | null;
  /** Los campos propios del contrato. */
  datos: Datos;
  id: string;
  contratoId: string;
  contrato: string;
  /** El nombre tal como quedó escrito en el documento del proveedor. */
  proveedor: string;
  /** Con quién se compró, del maestro de Abastecimiento. Nulo en las compras viejas. */
  proveedorId: string | null;
  /** En qué línea de la planilla del contrato entra. */
  categoriaId: string | null;
  documento: string | null;
  detalle: string;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  total: number;
  fecha: string;
  periodoControl: string;
  estadoPago: EstadoPagoCompra;
  /** La OC de la que es factura. Esas se editan desde el ciclo de la orden. */
  ordenId: string | null;
};

type FilaCompra = {
  anexo_id?: string | null;
  datos: Datos | null;
  id: string;
  contrato_id: string;
  proveedor: string;
  proveedor_id: string | null;
  categoria_id: string | null;
  documento: string | null;
  detalle: string;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  total: number;
  fecha: string;
  periodo_control: string | null;
  estado_pago: EstadoPagoCompra;
  orden_id: string | null;
  contratos: { nombre: string } | null;
};

export async function cargarCompras(): Promise<Compra[]> {
  const { data, error } = await supabase
    .from("compras")
    .select(
      "id, contrato_id, proveedor, proveedor_id, categoria_id, documento, detalle, tipo, neto, iva, total, fecha, periodo_control, estado_pago, orden_id, anexo_id, datos, contratos(nombre)",
    )
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaCompra[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
    datos: f.datos ?? {},
    contrato: f.contratos?.nombre ?? f.contrato_id,
    proveedor: f.proveedor,
    proveedorId: f.proveedor_id,
    categoriaId: f.categoria_id,
    documento: f.documento,
    detalle: f.detalle,
    tipo: f.tipo,
    neto: f.neto,
    iva: f.iva,
    total: f.total,
    fecha: f.fecha,
    periodoControl: f.periodo_control ?? `${f.fecha.slice(0, 7)}-01`,
    estadoPago: f.estado_pago,
    ordenId: f.orden_id ?? null,
  }));
}

/**
 * Las líneas de una compra directa (0053). Una compra anterior a las líneas no
 * tiene ninguna: el formulario la muestra como una sola, con su detalle y neto.
 */
export async function cargarLineasDeCompra(compraId: string) {
  const { data, error } = await supabase
    .from("factura_items")
    .select("item_id, items_compra(descripcion, unidad, cantidad, precio_unitario, categoria_id, tipo)")
    .eq("compra_id", compraId)
    .order("item_id");
  if (error) throw new Error(error.message);
  type Fila = { item_id: string; items_compra: { descripcion: string; unidad: string; cantidad: number; precio_unitario: number; categoria_id: string | null; tipo: TipoCompra } | null };
  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.items_compra)
    .map((f) => ({
      descripcion: f.items_compra!.descripcion,
      unidad: f.items_compra!.unidad,
      cantidad: Number(f.items_compra!.cantidad),
      precio_unitario: Number(f.items_compra!.precio_unitario),
      categoria_id: f.items_compra!.categoria_id ?? "",
      tipo: f.items_compra!.tipo,
    }));
}

/** Guarda la compra con sus líneas, entera o nada (función de la base, 0053). */
export async function guardarCompraDirecta(datos: {
  id: string;
  contratoId: string;
  proveedorId: string;
  proveedor: string;
  documento: string;
  fecha: string;
  periodoControl: string;
  /** El anexo al que se carga; null = contrato base. */
  anexoId?: string | null;
  iva: number;
  datos: Datos;
  lineas: { descripcion: string; unidad: string; cantidad: number; precio_unitario: number; categoria_id: string; tipo: TipoCompra }[];
}) {
  const { error } = await supabase.rpc("guardar_compra_directa", {
    p_id: datos.id,
    p_contrato_id: datos.contratoId,
    p_proveedor_id: datos.proveedorId,
    p_proveedor: datos.proveedor,
    p_documento: datos.documento,
    p_fecha: datos.fecha,
    p_periodo_control: datos.periodoControl,
    p_iva: datos.iva,
    p_datos: datos.datos,
    p_lineas: datos.lineas,
  });
  if (error) {
    throw new Error(/row-level security|permission denied/i.test(error.message)
      ? "Tu acceso no permite este cambio (o ese contrato no está entre los tuyos)."
      : error.message);
  }
  // El anexo va aparte de la función de la base: es del documento, no de sus líneas.
  const { error: errorAnexo } = await supabase.from("compras").update({ anexo_id: datos.anexoId ?? null }).eq("id", datos.id);
  if (errorAnexo) throw new Error(errorAnexo.message);
}

/* ── Personal ─────────────────────────────────────────────────────────────── */

export type CostoPersonal = {
  /** El anexo al que se carga (0059); nulo = contrato base. */
  anexoId: string | null;
  /** Los campos propios del contrato. */
  datos: Datos;
  id: string;
  contratoId: string;
  contrato: string;
  faena: string;
  periodo: string;
  /** En qué línea de la planilla del contrato entra. */
  categoriaId: string | null;
  dotacion: number;
  horasHombre: number;
  /** Total haberes: bruto + HH extra + no imponible + otros. La calcula la base. */
  remuneraciones: number;
  /** La remuneración imponible del mes, como viene en la nómina. */
  sueldoBruto: number;
  /** Costo total de las HH extra, en pesos. Se ingresa. */
  horasExtraMonto: number;
  /** Total de HH extra en horas: la suma de los cinco motivos. La calcula la base. */
  horasExtraCantidad: number;
  hhReemplazo: number;
  hhParadaPlanta: number;
  hhFeriadoCompensado: number;
  hhApoyoOficina: number;
  hhOtras: number;
  /** Lo que se pagó por las HH extra de cada motivo (0063). */
  montosHh: Record<MontoHh, number>;
  totalNoImponible: number;
  otrosHaberes: number;
  /** Qué son los otros haberes (0064). */
  otrosHaberesDetalle: OtroHaber[];
  leyesSociales: number;
  costoTotal: number;
};

type FilaPersonal = {
  anexo_id?: string | null;
  datos: Datos | null;
  id: string;
  contrato_id: string;
  categoria_id: string | null;
  faena: string;
  periodo: string;
  dotacion: number;
  horas_hombre: number;
  remuneraciones: number;
  sueldo_bruto: number;
  horas_extra_monto: number;
  hh_reemplazo: number;
  hh_parada_planta: number;
  hh_feriado_compensado: number;
  hh_apoyo_oficina: number;
  hh_otras: number;
  monto_hh_reemplazo: number;
  monto_hh_parada_planta: number;
  monto_hh_feriado_compensado: number;
  monto_hh_apoyo_oficina: number;
  monto_hh_otras: number;
  horas_extra_cantidad: number;
  total_no_imponible: number;
  otros_haberes: number;
  otros_haberes_detalle: unknown;
  leyes_sociales: number;
  costo_total: number;
  contratos: { nombre: string } | null;
};

export async function cargarPersonal(): Promise<CostoPersonal[]> {
  const { data, error } = await supabase
    .from("costos_personal")
    .select(
      "id, contrato_id, anexo_id, categoria_id, faena, periodo, dotacion, horas_hombre, remuneraciones, " +
        "sueldo_bruto, horas_extra_monto, hh_reemplazo, hh_parada_planta, " +
        "hh_feriado_compensado, hh_apoyo_oficina, hh_otras, horas_extra_cantidad, " +
        "monto_hh_reemplazo, monto_hh_parada_planta, monto_hh_feriado_compensado, monto_hh_apoyo_oficina, monto_hh_otras, " +
        "total_no_imponible, otros_haberes, otros_haberes_detalle, leyes_sociales, costo_total, datos, contratos(nombre)",
    )
    .order("periodo", { ascending: false })
    .order("contrato_id");

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaPersonal[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
    datos: f.datos ?? {},
    contrato: f.contratos?.nombre ?? f.contrato_id,
    categoriaId: f.categoria_id ?? null,
    faena: f.faena,
    periodo: f.periodo,
    dotacion: f.dotacion,
    horasHombre: f.horas_hombre,
    remuneraciones: f.remuneraciones,
    sueldoBruto: Number(f.sueldo_bruto ?? 0),
    horasExtraMonto: Number(f.horas_extra_monto ?? 0),
    hhReemplazo: Number(f.hh_reemplazo ?? 0),
    hhParadaPlanta: Number(f.hh_parada_planta ?? 0),
    hhFeriadoCompensado: Number(f.hh_feriado_compensado ?? 0),
    hhApoyoOficina: Number(f.hh_apoyo_oficina ?? 0),
    hhOtras: Number(f.hh_otras ?? 0),
    montosHh: Object.fromEntries(motivosHhExtra.map((m) => [m.monto, Number(f[m.monto] ?? 0)])) as Record<MontoHh, number>,
    horasExtraCantidad: Number(f.horas_extra_cantidad ?? 0),
    totalNoImponible: Number(f.total_no_imponible ?? 0),
    otrosHaberes: Number(f.otros_haberes ?? 0),
    otrosHaberesDetalle: detalleDeOtrosHaberes(f.otros_haberes_detalle, Number(f.otros_haberes ?? 0)),
    leyesSociales: f.leyes_sociales,
    costoTotal: f.costo_total,
  }));
}

/* ── Servicios y subcontratos ─────────────────────────────────────────────── */

export type TipoServicio = "subcontrato" | "arriendo" | "flete" | "asesoria" | "otro";

export const tiposServicio: { id: TipoServicio; titulo: string }[] = [
  { id: "subcontrato", titulo: "Subcontrato" },
  { id: "arriendo", titulo: "Arriendo de equipos" },
  { id: "flete", titulo: "Flete y transporte" },
  { id: "asesoria", titulo: "Asesoría" },
  { id: "otro", titulo: "Otro" },
];

export type Servicio = {
  /** El anexo al que se carga (0059); nulo = contrato base. */
  anexoId: string | null;
  /** Los campos propios del contrato. */
  datos: Datos;
  id: string;
  contratoId: string;
  contrato: string;
  contratista: string;
  /** En qué línea de la planilla del contrato entra. */
  categoriaId: string | null;
  documento: string | null;
  detalle: string;
  tipoServicio: TipoServicio;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  total: number;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  /** Un arriendo se repite todos los meses; un flete puntual no. */
  recurrente: boolean;
  periodicidad: Periodicidad | null;
  estadoPago: EstadoPagoCompra;
};

export type Periodicidad = "mensual" | "quincenal" | "semanal" | "anual";

export const periodicidades: { id: Periodicidad; titulo: string }[] = [
  { id: "mensual", titulo: "Mensual" },
  { id: "quincenal", titulo: "Quincenal" },
  { id: "semanal", titulo: "Semanal" },
  { id: "anual", titulo: "Anual" },
];

type FilaServicio = {
  anexo_id?: string | null;
  datos: Datos | null;
  id: string;
  contrato_id: string;
  categoria_id: string | null;
  contratista: string;
  documento: string | null;
  detalle: string;
  tipo_servicio: TipoServicio;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  total: number;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  recurrente: boolean;
  periodicidad: Periodicidad | null;
  estado_pago: EstadoPagoCompra;
  contratos: { nombre: string } | null;
};

export async function cargarServicios(): Promise<Servicio[]> {
  const { data, error } = await supabase
    .from("servicios")
    .select(
      "id, contrato_id, anexo_id, categoria_id, contratista, documento, detalle, tipo_servicio, tipo, neto, iva, total, fecha, desde, hasta, recurrente, periodicidad, estado_pago, datos, contratos(nombre)",
    )
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaServicio[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
    datos: f.datos ?? {},
    contrato: f.contratos?.nombre ?? f.contrato_id,
    categoriaId: f.categoria_id ?? null,
    contratista: f.contratista,
    documento: f.documento,
    detalle: f.detalle,
    tipoServicio: f.tipo_servicio,
    tipo: f.tipo,
    neto: f.neto,
    iva: f.iva,
    total: f.total,
    fecha: f.fecha,
    desde: f.desde,
    hasta: f.hasta,
    recurrente: Boolean(f.recurrente),
    periodicidad: f.periodicidad,
    estadoPago: f.estado_pago,
  }));
}

/* ── Compras y servicios, en una sola lista ───────────────────────────────── */

/**
 * Los dos son la misma pregunta —qué se gastó con terceros— aunque cada uno
 * guarde campos propios: un arriendo tiene período y recurrencia que una compra
 * de ferretería no tiene.
 *
 * Por eso se unen en una vista y no en una tabla: forzarlos a una sola tabla
 * llenaría de nulos la mitad de las columnas, y una columna que casi siempre
 * está vacía deja de leerse.
 */
export type EgresoTercero = {
  id: string;
  origen: "compra" | "servicio";
  contratoId: string;
  categoria: string;
  tercero: string;
  documento: string | null;
  detalle: string;
  tipo: TipoCompra;
  /** Qué clase de servicio es. Nulo en las compras. */
  clase: TipoServicio | null;
  recurrente: boolean;
  periodicidad: Periodicidad | null;
  fecha: string;
  periodo: string;
  desde: string | null;
  hasta: string | null;
  neto: number;
  iva: number;
  total: number;
  estadoPago: EstadoPagoCompra;
};

export async function cargarEgresosTerceros(): Promise<EgresoTercero[]> {
  const { data, error } = await supabase
    .from("egresos_terceros")
    .select("*")
    .order("periodo", { ascending: false })
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    origen: f.origen as "compra" | "servicio",
    contratoId: f.contrato_id as string,
    categoria: f.categoria as string,
    tercero: f.tercero as string,
    documento: (f.documento as string | null) ?? null,
    detalle: f.detalle as string,
    tipo: f.tipo as TipoCompra,
    clase: (f.clase as TipoServicio | null) ?? null,
    recurrente: Boolean(f.recurrente),
    periodicidad: (f.periodicidad as Periodicidad | null) ?? null,
    fecha: f.fecha as string,
    periodo: f.periodo as string,
    desde: (f.desde as string | null) ?? null,
    hasta: (f.hasta as string | null) ?? null,
    neto: Number(f.neto),
    iva: Number(f.iva),
    total: Number(f.total),
    estadoPago: f.estado_pago as EstadoPagoCompra,
  }));
}

/**
 * El código de un registro de personal: PE-MISC-2026-09.
 *
 * Lo arma la app y no lo teclea nadie. Antes se pedía a mano y era la única
 * forma de equivocarse en esta pantalla: un código repetido rebota contra la
 * base con un error que no dice nada, y uno mal escrito rompe el orden.
 *
 * Puede haber más de una línea por contrato y mes —la dotación base y las HH
 * extra van separadas—, así que cuando el código base ya existe se le agrega un
 * correlativo.
 */
/**
 * El código de una compra: "CO-C2601-2026-09".
 *
 * Correlativo por contrato y mes, igual que el de personal, porque el egreso de
 * Control de Gestión es mensual. Si en el mismo mes hay más de una línea del
 * mismo contrato —materiales y fletes van separados— se le agrega un número.
 */
export function siguienteIdCompra(existentes: Compra[], contratoId: string, periodo: string) {
  const base = `CO-${contratoId.replace(/^C-/, "")}-${periodo.slice(0, 7)}`;
  const usados = new Set(existentes.map((c) => c.id));

  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function siguienteIdPersonal(
  existentes: CostoPersonal[],
  contratoId: string,
  periodo: string,
) {
  const base = `PE-${contratoId.replace(/^C-/, "")}-${periodo.slice(0, 7)}`;
  const usados = new Set(existentes.map((p) => p.id));

  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
