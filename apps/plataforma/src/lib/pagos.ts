"use client";

import { supabase } from "./supabase";
import { actualizar } from "./crud";
import { empresaActual } from "./sesion";

/**
 * Cuentas por pagar: qué se le debe a cada proveedor y qué se paga esta semana.
 *
 * Es la planilla «Pago Proveedores» de Valar, con sus mismas reglas. La más
 * importante, la que decide todo lo demás: **sin factura registrada no se
 * paga**. Una OC emitida es plata comprometida y aparece en la lista, pero
 * bloqueada; lo que la desbloquea es que llegue la factura.
 *
 * El cálculo no vive acá sino en la vista `cuentas_por_pagar`
 * (`supabase/migraciones/0026_pago_a_proveedores.sql`): el vencimiento, el
 * estado y `apto_para_pago` salen de la base, para que la pantalla, un informe
 * o una consulta suelta digan siempre lo mismo.
 */

/* ── Parámetros ───────────────────────────────────────────────────────────── */

export type ParametrosPago = {
  plazoPagoDias: number;
  topeSemanal: number;
  diasAlertaVencimiento: number;
  diasMaximosSinFactura: number;
  /** 1 = lunes … 7 = domingo. En Valar, jueves. */
  diaPagoSemanal: number;
};

const PARAMETROS_POR_DEFECTO: ParametrosPago = {
  plazoPagoDias: 30,
  topeSemanal: 20_000_000,
  diasAlertaVencimiento: 7,
  diasMaximosSinFactura: 15,
  diaPagoSemanal: 4,
};

export async function cargarParametrosPago(): Promise<ParametrosPago> {
  /* El filtro por empresa es obligatorio aunque el RLS ya recorte: el rol
     `soporte` ve TODAS las empresas, así que sin esto llegaría una fila por
     empresa y `maybeSingle()` se cae con "multiple rows returned". */
  const empresa = await empresaActual();

  let consulta = supabase.from("parametros_pago").select("*");
  if (empresa) consulta = consulta.eq("empresa_id", empresa);

  const { data, error } = await consulta.maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return PARAMETROS_POR_DEFECTO;

  return {
    plazoPagoDias: data.plazo_pago_dias,
    topeSemanal: data.tope_semanal,
    diasAlertaVencimiento: data.dias_alerta_vencimiento,
    diasMaximosSinFactura: data.dias_maximos_sin_factura,
    diaPagoSemanal: data.dia_pago_semanal,
  };
}

/* ── Una línea por pagar ──────────────────────────────────────────────────── */

/** El estado del documento, en el mismo orden con que se prioriza la semana. */
export type EstadoDocumento =
  | "vencido"
  | "por_vencer"
  | "pendiente"
  | "no_facturado"
  | "retenido"
  | "pagado"
  | "anulado";

export const nombreEstadoDocumento: Record<EstadoDocumento, string> = {
  vencido: "Vencido",
  por_vencer: "Por vencer",
  pendiente: "Pendiente",
  no_facturado: "Sin factura",
  retenido: "Retenido",
  pagado: "Pagado",
  anulado: "Anulado",
};

export type AlertaDocumental = "ok" | "falta_factura" | "factura_atrasada" | "pagado_sin_factura";

export const nombreAlerta: Record<AlertaDocumental, string> = {
  ok: "Documento completo",
  falta_factura: "Falta la factura",
  factura_atrasada: "Factura atrasada",
  pagado_sin_factura: "Pagado sin factura",
};

export type EstadoCuenta = "creada" | "nueva_cuenta" | "por_validar";

export const nombreEstadoCuenta: Record<EstadoCuenta, string> = {
  creada: "Cuenta creada",
  nueva_cuenta: "Cuenta nueva",
  por_validar: "Cuenta por validar",
};

export type CuentaPorPagar = {
  id: string;
  /** "factura" = documento del proveedor. "orden" = saldo de una OC sin facturar. */
  origen: "factura" | "orden";
  compraId: string | null;
  ordenId: string | null;
  ordenNumero: string | null;
  contratoId: string;
  contrato: string;
  proveedorId: string | null;
  proveedor: string;
  rut: string | null;
  estadoCuenta: EstadoCuenta;
  banco: string | null;
  numeroCuenta: string | null;
  detalle: string;
  documento: string | null;
  fechaFactura: string | null;
  neto: number;
  iva: number;
  total: number;
  plazoDias: number;
  vencimiento: string | null;
  diasParaVencer: number | null;
  diasSinFacturar: number | null;
  estadoDocumento: EstadoDocumento;
  alertaDocumental: AlertaDocumental;
  aptoParaPago: boolean;
  fechaPagoProgramada: string | null;
  fechaPago: string | null;
  semanaPago: string | null;
};

type FilaCuenta = {
  id: string;
  origen: "factura" | "orden";
  compra_id: string | null;
  orden_id: string | null;
  orden_numero: string | null;
  contrato_id: string;
  contrato: string;
  proveedor_id: string | null;
  proveedor: string;
  rut: string | null;
  estado_cuenta: EstadoCuenta;
  banco: string | null;
  numero_cuenta: string | null;
  detalle: string;
  documento: string | null;
  fecha_factura: string | null;
  neto: number;
  iva: number;
  total: number;
  plazo_dias: number;
  vencimiento: string | null;
  dias_para_vencer: number | null;
  dias_sin_facturar: number | null;
  estado_documento: EstadoDocumento;
  alerta_documental: AlertaDocumental;
  apto_para_pago: boolean;
  fecha_pago_programada: string | null;
  fecha_pago: string | null;
  semana_pago: string | null;
};

export async function cargarCuentasPorPagar(): Promise<CuentaPorPagar[]> {
  const { data, error } = await supabase
    .from("cuentas_por_pagar")
    .select("*")
    .order("vencimiento", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as FilaCuenta[]).map((f) => ({
    id: f.id,
    origen: f.origen,
    compraId: f.compra_id,
    ordenId: f.orden_id,
    ordenNumero: f.orden_numero,
    contratoId: f.contrato_id,
    contrato: f.contrato,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    rut: f.rut,
    estadoCuenta: f.estado_cuenta,
    banco: f.banco,
    numeroCuenta: f.numero_cuenta,
    detalle: f.detalle,
    documento: f.documento,
    fechaFactura: f.fecha_factura,
    neto: f.neto,
    iva: f.iva,
    total: f.total,
    plazoDias: f.plazo_dias,
    vencimiento: f.vencimiento,
    diasParaVencer: f.dias_para_vencer,
    diasSinFacturar: f.dias_sin_facturar,
    estadoDocumento: f.estado_documento,
    alertaDocumental: f.alerta_documental,
    aptoParaPago: f.apto_para_pago,
    fechaPagoProgramada: f.fecha_pago_programada,
    fechaPago: f.fecha_pago,
    semanaPago: f.semana_pago,
  }));
}

/* ── Lo mismo, por proveedor ──────────────────────────────────────────────── */

export type ProveedorPorPagar = {
  clave: string;
  proveedorId: string | null;
  proveedor: string;
  rut: string | null;
  estadoCuenta: EstadoCuenta;
  banco: string | null;
  numeroCuenta: string | null;
  lineas: number;
  pendienteTotal: number;
  /** Con factura registrada: es lo único que se puede transferir. */
  exigible: number;
  /** Sin factura: plata comprometida que todavía no se puede pagar. */
  bloqueado: number;
  vencido: number;
  porVencer: number;
  retenido: number;
  programado: number;
  vencePrimero: string | null;
};

export async function cargarFlujoDePagos(): Promise<ProveedorPorPagar[]> {
  const { data, error } = await supabase
    .from("flujo_de_pagos")
    .select("*")
    .order("pendiente_total", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((f) => ({
    clave: f.clave,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    rut: f.rut,
    estadoCuenta: f.estado_cuenta,
    banco: f.banco,
    numeroCuenta: f.numero_cuenta,
    lineas: f.lineas,
    pendienteTotal: f.pendiente_total,
    exigible: f.exigible,
    bloqueado: f.bloqueado,
    vencido: f.vencido,
    porVencer: f.por_vencer,
    retenido: f.retenido,
    programado: f.programado,
    vencePrimero: f.vence_primero,
  }));
}

/* ── Lo que se puede hacer con una línea ──────────────────────────────────── */

/**
 * Registrar la factura contra una compra ya cargada. Es lo que desbloquea el
 * pago: mientras el número no esté, la línea no es pagable.
 */
export async function registrarFactura(
  compraId: string,
  datos: { documento: string; fechaFactura: string; vencimiento: string | null },
) {
  await actualizar("compras", compraId, {
    documento: datos.documento.trim(),
    fecha_factura: datos.fechaFactura,
    fecha_vencimiento: datos.vencimiento,
  });
}

/**
 * La factura que llega contra una OC: es el traspaso de Abastecimiento a
 * Control de Gestión.
 *
 * Crea la línea de compra —el documento— y le engancha los ítems de la orden
 * que todavía no estaban facturados. El costo del contrato no se mueve por
 * esto: los ítems ya pesaban desde que se emitió la orden. Lo que cambia es
 * que ahora tienen documento, proveedor y vencimiento, o sea que se pueden
 * pagar y se pueden auditar.
 */
export async function facturarOrden({
  ordenId,
  contratoId,
  proveedorId,
  proveedor,
  documento,
  fechaFactura,
  vencimiento,
  neto,
  iva,
  detalle,
}: {
  ordenId: string;
  contratoId: string;
  proveedorId: string | null;
  proveedor: string;
  documento: string;
  fechaFactura: string;
  vencimiento: string | null;
  neto: number;
  iva: number;
  detalle: string;
}) {
  // El mes contable de la factura: Control de Gestión trabaja por mes.
  const periodo = `${fechaFactura.slice(0, 7)}-01`;
  const id = await siguienteIdDeCompra(contratoId, periodo);

  const { data: items, error: errorItems } = await supabase
    .from("items_compra")
    .select("id, categoria_id, tipo")
    .eq("orden_id", ordenId)
    .is("compra_id", null);

  if (errorItems) throw new Error(errorItems.message);

  const { error } = await supabase.from("compras").insert({
    id,
    contrato_id: contratoId,
    proveedor_id: proveedorId,
    proveedor,
    documento: documento.trim(),
    detalle,
    // La categoría y el tipo se heredan de los ítems: son de ellos, no del
    // documento. Si la orden mezcla categorías, queda la del primer ítem y el
    // costo igual se reparte bien, porque se reparte por ítem.
    categoria_id: items?.[0]?.categoria_id ?? null,
    tipo: items?.every((i) => i.tipo === "reembolsable") ? "reembolsable" : "ordinario",
    neto,
    iva,
    fecha: periodo,
    fecha_factura: fechaFactura,
    fecha_vencimiento: vencimiento,
    orden_id: ordenId,
    estado_pago: "pendiente",
  });

  if (error) throw new Error(error.message);

  if (items && items.length > 0) {
    const { error: errorEnlace } = await supabase
      .from("items_compra")
      .update({ compra_id: id })
      .in(
        "id",
        items.map((i) => i.id),
      );
    if (errorEnlace) throw new Error(errorEnlace.message);
  }

  return id;
}

/** "CO-MISC-2026-09", y con sufijo si el mes ya tiene una. */
async function siguienteIdDeCompra(contratoId: string, periodo: string) {
  const base = `CO-${contratoId.replace(/^C-/, "")}-${periodo.slice(0, 7)}`;
  const { data, error } = await supabase.from("compras").select("id").like("id", `${base}%`);
  if (error) throw new Error(error.message);

  const usados = new Set((data ?? []).map((c) => c.id));
  if (!usados.has(base)) return base;

  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Agendar (o sacar de) una fecha de pago semanal. */
export async function programarPago(compraId: string, fecha: string | null) {
  await actualizar("compras", compraId, { fecha_pago_programada: fecha });
}

/** Dar por transferida una factura. */
export async function marcarPagada(compraId: string, fecha: string) {
  await actualizar("compras", compraId, { estado_pago: "pagada", fecha_pago: fecha });
}

/** Retener o soltar: la factura existe, pero hay una razón para no pagarla. */
export async function cambiarEstadoPago(
  compraId: string,
  estado: "pendiente" | "pagada" | "retenida" | "anulada",
) {
  await actualizar("compras", compraId, {
    estado_pago: estado,
    ...(estado === "pendiente" ? { fecha_pago: null } : {}),
  });
}

/* ── Las semanas de pago ──────────────────────────────────────────────────── */

/**
 * Las próximas fechas de pago, en el día de la semana que Valar transfiere.
 *
 * Se calculan y no se guardan: una lista de fechas escrita a mano se queda
 * atrás sola, y en la planilla eso significaba cambiar un parámetro cada lunes.
 */
export function proximasFechasDePago(diaSemana: number, cuantas = 6, desde = new Date()) {
  const hoy = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  // getDay() da 0 para domingo; el parámetro usa 1 = lunes … 7 = domingo.
  const actual = hoy.getDay() === 0 ? 7 : hoy.getDay();
  const faltan = (diaSemana - actual + 7) % 7;

  return Array.from({ length: cuantas }, (_, i) => {
    const f = new Date(hoy);
    f.setDate(hoy.getDate() + faltan + i * 7);
    return iso(f);
  });
}

function iso(f: Date) {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(
    f.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * La nómina para el banco: una línea por proveedor con lo que se le transfiere.
 *
 * El formato es el de la planilla «Cuentas Proveedores», que es el que el banco
 * acepta: el RUT viene partido en número y dígito verificador.
 */
export type LineaNomina = {
  rut: string;
  dv: string;
  beneficiario: string;
  banco: string;
  numeroCuenta: string;
  monto: number;
  descripcion: string;
  listo: boolean;
};

export function armarNomina(lineas: CuentaPorPagar[]): LineaNomina[] {
  const porProveedor = new Map<string, CuentaPorPagar[]>();
  for (const l of lineas) {
    const clave = l.proveedorId ?? l.proveedor;
    porProveedor.set(clave, [...(porProveedor.get(clave) ?? []), l]);
  }

  return [...porProveedor.values()].map((grupo) => {
    const primera = grupo[0];
    const [rut, dv] = partirRut(primera.rut);
    return {
      rut,
      dv,
      beneficiario: primera.proveedor,
      banco: primera.banco ?? "",
      numeroCuenta: primera.numeroCuenta ?? "",
      monto: grupo.reduce((t, l) => t + l.total, 0),
      // Lo que el proveedor va a leer en su cartola para reconocer el abono.
      descripcion: grupo
        .map((l) => l.documento ?? l.ordenNumero ?? "")
        .filter(Boolean)
        .join(", "),
      listo:
        primera.estadoCuenta === "creada" &&
        Boolean(primera.numeroCuenta) &&
        Boolean(primera.rut),
    };
  });
}

/** "76.175.835-7" → ["76175835", "7"]. Sin RUT devuelve dos vacíos. */
export function partirRut(rut: string | null): [string, string] {
  if (!rut) return ["", ""];
  const limpio = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return [limpio, ""];
  return [limpio.slice(0, -1), limpio.slice(-1)];
}
