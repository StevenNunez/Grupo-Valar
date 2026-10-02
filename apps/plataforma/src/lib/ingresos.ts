"use client";

import type { Datos } from "./campos";
import type { PlantillaEdp } from "./plantillas-edp";
import { resolverPlantillaEdp } from "./plantillas-edp";
import { supabase } from "./supabase";

/**
 * Ingresos del módulo Control de Gestión: estados de pago, órdenes de compra y
 * facturas emitidas.
 *
 * Ninguna consulta filtra por usuario: quién ve qué lo deciden las políticas
 * RLS. Sin sesión, todas devuelven cero filas.
 */

/* ── Estados de pago ──────────────────────────────────────────────────────── */

export type EstadoEP = "presentado" | "aprobado" | "facturado" | "pagado" | "rechazado";

export type TipoEdp = "ordinario" | "extraordinario";

export type EstadoPago = {
  id: string;
  contratoId: string;
  contrato: string;
  cliente: string;
  numero: number;
  periodo: string;
  tipoEdp: TipoEdp;
  avancePeriodo: number;
  montoNeto: number;
  montoUf: number | null;
  retenciones: number;
  montoCobrado: number;
  estado: EstadoEP;
  fechaPresentacion: string;
  fechaAprobacion: string | null;
  /* Lo que este contrato pide y ningun otro. Ver `lib/campos`. */
  datos: Datos;
};

/* Postgres devuelve snake_case; la app trabaja en camelCase. La relación con
   `contratos` viene anidada porque PostgREST resuelve la clave foránea. */
type FilaEP = {
  id: string;
  contrato_id: string;
  numero: number;
  periodo: string;
  tipo_edp: TipoEdp;
  avance_periodo: number;
  monto_neto: number;
  monto_uf: number | null;
  retenciones: number;
  monto_cobrado: number;
  estado: EstadoEP;
  fecha_presentacion: string;
  fecha_aprobacion: string | null;
  datos: Datos | null;
  contratos: { nombre: string; cliente: string } | null;
};

export async function cargarEstadosPago(): Promise<EstadoPago[]> {
  const { data, error } = await supabase
    .from("estados_pago")
    .select(
      "id, contrato_id, numero, periodo, tipo_edp, avance_periodo, monto_neto, monto_uf, retenciones, monto_cobrado, estado, fecha_presentacion, fecha_aprobacion, datos, contratos(nombre, cliente)",
    )
    .order("periodo", { ascending: false })
    .order("contrato_id");

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaEP[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    contrato: f.contratos?.nombre ?? f.contrato_id,
    cliente: f.contratos?.cliente ?? "",
    numero: f.numero,
    periodo: f.periodo,
    tipoEdp: f.tipo_edp,
    avancePeriodo: Number(f.avance_periodo),
    montoNeto: f.monto_neto,
    montoUf: f.monto_uf === null ? null : Number(f.monto_uf),
    retenciones: f.retenciones,
    montoCobrado: Number(f.monto_cobrado ?? 0),
    estado: f.estado,
    fechaPresentacion: f.fecha_presentacion,
    fechaAprobacion: f.fecha_aprobacion,
    datos: f.datos ?? {},
  }));
}

/* ── Órdenes de compra ────────────────────────────────────────────────────── */

export type EstadoOC = "vigente" | "consumida" | "vencida";

export type OrdenCompra = {
  id: string;
  contratoId: string;
  contrato: string;
  numero: string;
  mandante: string;
  montoAutorizado: number;
  /** Cuánto se lleva presentado en estados de pago contra esta OC. */
  consumido: number;
  fechaEmision: string;
  vigencia: string | null;
  estado: EstadoOC;
};

type FilaOC = {
  id: string;
  contrato_id: string;
  numero: string;
  mandante: string;
  monto_autorizado: number;
  fecha_emision: string;
  vigencia: string | null;
  estado: EstadoOC;
  contratos: { nombre: string } | null;
};

export async function cargarOrdenesCompra(): Promise<OrdenCompra[]> {
  // El consumo sale de los EP del mismo contrato: la OC autoriza y los estados
  // de pago van descontando de ese techo.
  const [ocs, eps] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select(
        "id, contrato_id, numero, mandante, monto_autorizado, fecha_emision, vigencia, estado, contratos(nombre)",
      )
      .order("fecha_emision", { ascending: false }),
    supabase.from("estados_pago").select("contrato_id, monto_neto"),
  ]);

  const fallo = ocs.error ?? eps.error;
  if (fallo) throw new Error(fallo.message);

  const consumoPorContrato = new Map<string, number>();
  for (const ep of (eps.data ?? []) as { contrato_id: string; monto_neto: number }[]) {
    consumoPorContrato.set(
      ep.contrato_id,
      (consumoPorContrato.get(ep.contrato_id) ?? 0) + ep.monto_neto,
    );
  }

  return ((ocs.data ?? []) as unknown as FilaOC[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    contrato: f.contratos?.nombre ?? f.contrato_id,
    numero: f.numero,
    mandante: f.mandante,
    montoAutorizado: f.monto_autorizado,
    consumido: consumoPorContrato.get(f.contrato_id) ?? 0,
    fechaEmision: f.fecha_emision,
    vigencia: f.vigencia,
    estado: f.estado,
  }));
}

/* ── Facturas ─────────────────────────────────────────────────────────────── */

export type EstadoCobro = "emitida" | "enviada" | "pagada" | "vencida";

export type Factura = {
  id: string;
  contratoId: string;
  contrato: string;
  cliente: string;
  estadoPagoId: string | null;
  neto: number;
  iva: number;
  total: number;
  fechaEmision: string;
  vencimiento: string | null;
  estadoCobro: EstadoCobro;
};

type FilaFactura = {
  id: string;
  contrato_id: string;
  estado_pago_id: string | null;
  neto: number;
  iva: number;
  total: number;
  fecha_emision: string;
  vencimiento: string | null;
  estado_cobro: EstadoCobro;
  contratos: { nombre: string; cliente: string } | null;
};

export async function cargarFacturas(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from("facturas")
    .select(
      "id, contrato_id, estado_pago_id, neto, iva, total, fecha_emision, vencimiento, estado_cobro, contratos(nombre, cliente)",
    )
    .order("fecha_emision", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaFactura[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    contrato: f.contratos?.nombre ?? f.contrato_id,
    cliente: f.contratos?.cliente ?? "",
    estadoPagoId: f.estado_pago_id,
    neto: f.neto,
    iva: f.iva,
    total: f.total,
    fechaEmision: f.fecha_emision,
    vencimiento: f.vencimiento,
    estadoCobro: f.estado_cobro,
  }));
}

/* ── El ciclo del ingreso: EDP → OC → Factura ─────────────────────────────── */

/**
 * La cadena que sigue todo lo que se cobra.
 *
 * Sin estado de pago no hay orden de compra, y sin orden no se factura. Las
 * tres cosas existían sueltas en la base; la vista `ciclo_ingreso` las junta y
 * dice en qué etapa va cada una, que es lo que decide qué se puede hacer.
 */
export type Etapa = "edp" | "orden" | "factura" | "cobro" | "cerrado";

export const etapas: { id: Etapa; titulo: string; falta: string }[] = [
  { id: "edp", titulo: "Estado de pago", falta: "Falta que el mandante lo apruebe." },
  {
    id: "orden",
    titulo: "Orden de compra",
    falta: "Aprobado: ya se puede cargar la orden del mandante.",
  },
  { id: "factura", titulo: "Factura", falta: "Hay orden: ya se puede emitir la factura." },
  { id: "cobro", titulo: "Cobro", falta: "Facturado: falta que paguen." },
  { id: "cerrado", titulo: "Cerrado", falta: "Cobrado y cerrado." },
];

/**
 * Un estado de pago con su orden y su factura colgando.
 *
 * Es un `EstadoPago` completo mas los eslabones: asi la ficha desplegable puede
 * abrir el mismo formulario de edicion que la pantalla vieja, sin traducir el
 * objeto de ida y de vuelta.
 */
export type Ciclo = EstadoPago & {
  plantillaEdp: PlantillaEdp;
  ordenId: string | null;
  ordenNumero: string | null;
  ordenMandante: string | null;
  montoAutorizado: number | null;
  ordenFecha: string | null;
  ordenVigencia: string | null;
  ordenEstado: EstadoOC | null;

  facturaId: string | null;
  facturaNeto: number | null;
  facturaIva: number | null;
  facturaTotal: number | null;
  facturaFecha: string | null;
  facturaVencimiento: string | null;
  estadoCobro: EstadoCobro | null;

  etapa: Etapa;
};

/**
 * La orden y la factura del ciclo, con la forma que esperan sus formularios.
 *
 * Se reconstruyen en vez de escribir dos formularios nuevos: son los mismos
 * registros, y dos formularios para la misma tabla terminan divergiendo en qué
 * validan y qué dejan pasar.
 */
export function ordenDelCiclo(c: Ciclo): OrdenCompra | null {
  if (!c.ordenId) return null;
  return {
    id: c.ordenId,
    contratoId: c.contratoId,
    contrato: c.contrato,
    numero: c.ordenNumero ?? "",
    mandante: c.ordenMandante ?? c.cliente,
    montoAutorizado: c.montoAutorizado ?? 0,
    // El consumo se calcula en el listado; acá no se muestra.
    consumido: 0,
    fechaEmision: c.ordenFecha ?? "",
    vigencia: c.ordenVigencia,
    estado: c.ordenEstado ?? "vigente",
  };
}

export function facturaDelCiclo(c: Ciclo): Factura | null {
  if (!c.facturaId) return null;
  const neto = c.facturaNeto ?? 0;
  return {
    id: c.facturaId,
    contratoId: c.contratoId,
    contrato: c.contrato,
    cliente: c.cliente,
    estadoPagoId: c.id,
    neto,
    iva: c.facturaIva ?? (c.facturaTotal ?? neto) - neto,
    total: c.facturaTotal ?? neto,
    fechaEmision: c.facturaFecha ?? "",
    vencimiento: c.facturaVencimiento,
    estadoCobro: c.estadoCobro ?? "emitida",
  };
}

export async function cargarCiclo(): Promise<Ciclo[]> {
  const [ciclos, contratos] = await Promise.all([
    supabase.from("ciclo_ingreso").select("*")
      .order("periodo", { ascending: false }).order("numero", { ascending: false }),
    supabase.from("contratos").select("id, plantilla_edp"),
  ]);

  const error = ciclos.error ?? contratos.error;
  if (error) throw new Error(error.message);
  const plantillas = new Map((contratos.data ?? []).map((fila) => [fila.id, fila.plantilla_edp as PlantillaEdp]));

  return (ciclos.data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    plantillaEdp: resolverPlantillaEdp(
      (f.datos as Datos | null)?.plantilla_edp,
      plantillas.get(f.contrato_id as string) ?? "general",
    ),
    contratoId: f.contrato_id as string,
    contrato: f.contrato as string,
    cliente: (f.cliente as string | null) ?? "",
    numero: Number(f.numero),
    periodo: f.periodo as string,
    tipoEdp: f.tipo_edp as TipoEdp,
    estado: f.estado as EstadoEP,
    avancePeriodo: Number(f.avance_periodo ?? 0),
    montoNeto: Number(f.monto_neto),
    montoUf: f.monto_uf === null ? null : Number(f.monto_uf),
    retenciones: Number(f.retenciones),
    montoCobrado: Number(f.monto_cobrado),
    fechaPresentacion: f.fecha_presentacion as string,
    fechaAprobacion: (f.fecha_aprobacion as string | null) ?? null,
    datos: (f.datos as Datos | null) ?? {},

    ordenId: (f.orden_id as string | null) ?? null,
    ordenNumero: (f.orden_numero as string | null) ?? null,
    ordenMandante: (f.orden_mandante as string | null) ?? null,
    montoAutorizado: f.monto_autorizado === null ? null : Number(f.monto_autorizado),
    ordenFecha: (f.orden_fecha as string | null) ?? null,
    ordenVigencia: (f.orden_vigencia as string | null) ?? null,
    ordenEstado: (f.orden_estado as EstadoOC | null) ?? null,

    facturaId: (f.factura_id as string | null) ?? null,
    facturaNeto: f.factura_neto === null ? null : Number(f.factura_neto),
    facturaIva:
      f.factura_iva === null || f.factura_iva === undefined ? null : Number(f.factura_iva),
    facturaTotal: f.factura_total === null ? null : Number(f.factura_total),
    facturaFecha: (f.factura_fecha as string | null) ?? null,
    facturaVencimiento: (f.factura_vencimiento as string | null) ?? null,
    estadoCobro: (f.estado_cobro as EstadoCobro | null) ?? null,

    etapa: f.etapa as Etapa,
  }));
}

/**
 * La orden de compra del mandante, nacida del estado de pago.
 *
 * Se prellena con lo que el EDP ya dice —contrato, monto, período— porque es
 * la misma información: volver a teclearla es la forma más común de que la
 * orden autorice un monto distinto del que se presentó.
 */
export async function crearOrdenDesdeEdp(
  ciclo: Ciclo,
  datos: {
    numero: string;
    mandante: string;
    montoAutorizado: number;
    fechaEmision: string;
    vigencia: string;
  },
) {
  const id = `OC-${ciclo.contratoId.replace(/^C-/, "")}-${ciclo.periodo.slice(0, 7)}-${ciclo.numero}`;

  const { error } = await supabase.from("ordenes_compra").insert({
    id,
    contrato_id: ciclo.contratoId,
    estado_pago_id: ciclo.id,
    numero: datos.numero.trim(),
    mandante: datos.mandante.trim(),
    monto_autorizado: datos.montoAutorizado,
    fecha_emision: datos.fechaEmision,
    vigencia: datos.vigencia || null,
    estado: "vigente",
  });

  if (error) throw new Error(error.message);
  return id;
}

/** La factura, nacida de la orden. El IVA se calcula; el total lo hace la base. */
export async function crearFacturaDesdeOrden(
  ciclo: Ciclo,
  datos: { folio: string; neto: number; fechaEmision: string; vencimiento: string },
) {
  const { error } = await supabase.from("facturas").insert({
    id: datos.folio.trim(),
    contrato_id: ciclo.contratoId,
    estado_pago_id: ciclo.id,
    orden_compra_id: ciclo.ordenId,
    neto: datos.neto,
    iva: Math.round(datos.neto * 0.19),
    fecha_emision: datos.fechaEmision,
    vencimiento: datos.vencimiento || null,
    estado_cobro: "emitida",
  });

  if (error) {
    if (/duplicate|already exists/i.test(error.message)) {
      throw new Error("Ya existe una factura con ese folio.");
    }
    throw new Error(error.message);
  }
  return datos.folio.trim();
}
