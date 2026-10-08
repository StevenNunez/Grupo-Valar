"use client";

import type { Datos } from "./campos";
import type { PlantillaEdp } from "./plantillas-edp";
import { resolverPlantillaEdp, resolverSeleccionEdp } from "./plantillas-edp";
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

/** Cómo se muestra cada estado. "Facturado" se lee "Pendiente de pago": lo que importa es que falta el pago. */
export const nombreEstadoEP: Record<EstadoEP, string> = {
  presentado: "Presentado",
  aprobado: "Aprobado",
  facturado: "Pendiente de pago",
  pagado: "Pagado",
  rechazado: "Rechazado",
};

/** "EP N° 26 extraordinario": el número solo no basta, el ordinario y el extraordinario se numeran aparte. */
export function nombreEdp(numero: number, tipo: TipoEdp) {
  return `EP N° ${numero} ${tipo}`;
}

type EdpBreve = { contratoId: string; anexoId: string | null; tipoEdp: TipoEdp; numero: number };

/**
 * El número que sigue. Es correlativo por contrato, anexo y tipo: el EP 23
 * ordinario y el EP 23 extraordinario del mismo contrato conviven (0067), y el
 * EP 30 de un contrato no choca con el EP 30 de otro.
 */
export function siguienteNumeroEdp(existentes: EdpBreve[], contratoId: string, anexoId: string | null, tipo: TipoEdp) {
  return existentes
    .filter((e) => e.contratoId === contratoId && (e.anexoId ?? null) === (anexoId || null) && e.tipoEdp === tipo)
    .reduce((max, e) => Math.max(max, e.numero), 0) + 1;
}

/** Si ese número ya está tomado en el contrato, anexo y tipo. */
export function edpRepetido<T extends EdpBreve & { id: string }>(existentes: T[], b: EdpBreve, propioId?: string): T | null {
  return existentes.find((e) => e.id !== propioId && e.contratoId === b.contratoId &&
    (e.anexoId ?? null) === (b.anexoId || null) && e.tipoEdp === b.tipoEdp && e.numero === b.numero) ?? null;
}

/** El código del EDP: no se teclea, sale del contrato, el anexo, el tipo y el número. "EP-9500013862-E26". */
export function idEdp(contratoId: string, anexoId: string | null, tipo: TipoEdp, numero: number) {
  const anexo = anexoId ? `-${anexoId.replace(/^AD-/, "")}` : `-${contratoId.replace(/^C-/, "")}`;
  return `EP${anexo}-${tipo === "extraordinario" ? "E" : "O"}${numero}`;
}

export type EstadoPago = {
  /** El anexo al que se carga (0059); nulo = contrato base. */
  anexoId: string | null;
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
  anexo_id?: string | null;
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
      "id, contrato_id, anexo_id, numero, periodo, tipo_edp, avance_periodo, monto_neto, monto_uf, retenciones, monto_cobrado, estado, fecha_presentacion, fecha_aprobacion, datos, contratos(nombre, cliente)",
    )
    .order("periodo", { ascending: false })
    .order("contrato_id");

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaEP[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
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

/** La OC del mandante es para cobrarle, no para comprar: dice si paga al contado o a crédito, y cuándo. */
export type FormaPago = "contado" | "credito";

export const formasPago: { id: FormaPago; titulo: string }[] = [
  { id: "credito", titulo: "A crédito" },
  { id: "contado", titulo: "Al contado" },
];

export type OrdenCompra = {
  id: string;
  contratoId: string;
  contrato: string;
  numero: string;
  mandante: string;
  montoAutorizado: number;
  /** Lo presentado en los estados de pago que cubre esta OC. */
  consumido: number;
  /** Los EDP que cubre: una OC puede autorizar el ordinario y el extraordinario del mes. */
  edps: string[];
  fechaEmision: string;
  formaPago: FormaPago | null;
  fechaCobro: string | null;
  estado: EstadoOC;
};

type FilaOC = {
  id: string;
  contrato_id: string;
  numero: string;
  mandante: string;
  monto_autorizado: number;
  fecha_emision: string;
  forma_pago: FormaPago | null;
  fecha_cobro: string | null;
  estado: EstadoOC;
  contratos: { nombre: string } | null;
  estados_pago: { numero: number; tipo_edp: TipoEdp; monto_neto: number }[] | null;
};

export async function cargarOrdenesCompra(): Promise<OrdenCompra[]> {
  // El consumo sale de los EDP que cubre cada OC (0067): antes se sumaba todo
  // el contrato, y una OC nueva aparecía consumida por los EDP de otros meses.
  const { data, error } = await supabase
    .from("ordenes_compra")
    .select(
      "id, contrato_id, numero, mandante, monto_autorizado, fecha_emision, forma_pago, fecha_cobro, estado, contratos(nombre), estados_pago(numero, tipo_edp, monto_neto)",
    )
    .order("fecha_emision", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaOC[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    contrato: f.contratos?.nombre ?? f.contrato_id,
    numero: f.numero,
    mandante: f.mandante,
    montoAutorizado: f.monto_autorizado,
    consumido: (f.estados_pago ?? []).reduce((t, e) => t + Number(e.monto_neto), 0),
    edps: (f.estados_pago ?? []).map((e) => nombreEdp(e.numero, e.tipo_edp)),
    fechaEmision: f.fecha_emision,
    formaPago: f.forma_pago,
    fechaCobro: f.fecha_cobro,
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
  /** Los EDP que cobra: una factura puede incluir varios. */
  edps: string[];
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
  neto: number;
  iva: number;
  total: number;
  fecha_emision: string;
  vencimiento: string | null;
  estado_cobro: EstadoCobro;
  contratos: { nombre: string; cliente: string } | null;
  estados_pago: { numero: number; tipo_edp: TipoEdp }[] | null;
};

export async function cargarFacturas(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from("facturas")
    .select(
      "id, contrato_id, neto, iva, total, fecha_emision, vencimiento, estado_cobro, contratos(nombre, cliente), estados_pago(numero, tipo_edp)",
    )
    .order("fecha_emision", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FilaFactura[]).map((f) => ({
    id: f.id,
    contratoId: f.contrato_id,
    contrato: f.contratos?.nombre ?? f.contrato_id,
    cliente: f.contratos?.cliente ?? "",
    edps: (f.estados_pago ?? []).map((e) => nombreEdp(e.numero, e.tipo_edp)),
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
  { id: "cobro", titulo: "Pendiente de pago", falta: "Facturado: falta que paguen." },
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
  /** Plantilla configurable: los campos con que se emitió (o los del contrato). */
  camposEdp: string[];
  ordenId: string | null;
  ordenNumero: string | null;
  ordenMandante: string | null;
  montoAutorizado: number | null;
  ordenFecha: string | null;
  ordenFormaPago: FormaPago | null;
  ordenFechaCobro: string | null;
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
    edps: [],
    fechaEmision: c.ordenFecha ?? "",
    formaPago: c.ordenFormaPago,
    fechaCobro: c.ordenFechaCobro,
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
    edps: [],
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
    supabase.from("contratos").select("id, plantilla_edp, edp_campos"),
  ]);

  const error = ciclos.error ?? contratos.error;
  if (error) throw new Error(error.message);
  const plantillas = new Map((contratos.data ?? []).map((fila) => [fila.id, fila.plantilla_edp as PlantillaEdp]));
  const selecciones = new Map((contratos.data ?? []).map((fila) => [fila.id, (fila.edp_campos as string[] | null) ?? []]));

  return (ciclos.data ?? []).map((f: Record<string, unknown>) => ({
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
    camposEdp: resolverSeleccionEdp((f.datos as Datos | null)?.campos_edp, selecciones.get(f.contrato_id as string) ?? []),
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
    ordenFormaPago: (f.orden_forma_pago as FormaPago | null) ?? null,
    ordenFechaCobro: (f.orden_fecha_cobro as string | null) ?? null,
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
 * La orden de compra del mandante para uno o más estados de pago.
 *
 * El mandante emite UNA orden para el ordinario y el extraordinario del mes
 * (0067), así que la OC es un documento por contrato y número: si ese número
 * ya está cargado en el contrato, se usa esa y no se vuelve a pedir nada. El
 * mandante sale del contrato y la fecha de emisión es la de hoy; lo que se
 * pide es lo que sirve para cobrar: monto, forma de pago y fecha de cobro.
 *
 * Tener la orden es prueba de que el mandante aprobó: los EDP que siguen
 * "presentado" pasan a "aprobado".
 */
export async function cargarOrdenEnEdps(
  edps: Pick<Ciclo, "id" | "contratoId" | "cliente" | "estado">[],
  datos: { numero: string; montoAutorizado: number; formaPago: FormaPago; fechaCobro: string },
) {
  const contratoId = edps[0].contratoId;
  const numero = datos.numero.trim();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: existente, error: fallo } = await supabase
    .from("ordenes_compra").select("id").eq("contrato_id", contratoId).eq("numero", numero).maybeSingle();
  if (fallo) throw new Error(fallo.message);

  let id = existente?.id as string | undefined;
  if (!id) {
    id = `OC-${contratoId.replace(/^C-/, "")}-${numero.replace(/\s+/g, "")}`;
    const { error } = await supabase.from("ordenes_compra").insert({
      id,
      contrato_id: contratoId,
      numero,
      mandante: edps[0].cliente,
      monto_autorizado: datos.montoAutorizado,
      fecha_emision: hoy,
      forma_pago: datos.formaPago,
      fecha_cobro: datos.fechaCobro || null,
      estado: "vigente",
    });
    if (error) throw new Error(error.message);
  }

  for (const edp of edps) {
    const { error } = await supabase.from("estados_pago").update(
      edp.estado === "presentado"
        ? { orden_compra_id: id, estado: "aprobado", fecha_aprobacion: hoy }
        : { orden_compra_id: id },
    ).eq("id", edp.id);
    if (error) throw new Error(error.message);
  }
  return id;
}

/**
 * La factura de uno o más estados de pago: una factura del SII puede cobrar
 * el ordinario y el extraordinario juntos. Si el folio ya está emitido en el
 * contrato, solo se le suman estos EDP. El estado de cada EDP lo mueve la base
 * (0067): queda "Pendiente de pago" hasta que la factura se marque pagada.
 */
export async function facturarEdps(
  edps: Pick<Ciclo, "id" | "contratoId">[],
  datos: { folio: string; neto: number; fechaEmision: string; vencimiento: string },
) {
  const contratoId = edps[0].contratoId;
  const folio = datos.folio.trim();

  const { data: existente, error: fallo } = await supabase
    .from("facturas").select("id, contrato_id").eq("id", folio).maybeSingle();
  if (fallo) throw new Error(fallo.message);
  if (existente && existente.contrato_id !== contratoId) {
    throw new Error(`La factura ${folio} ya está emitida en otro contrato (${existente.contrato_id}).`);
  }

  if (!existente) {
    const { error } = await supabase.from("facturas").insert({
      id: folio,
      contrato_id: contratoId,
      neto: datos.neto,
      iva: Math.round(datos.neto * 0.19),
      fecha_emision: datos.fechaEmision,
      vencimiento: datos.vencimiento || null,
      estado_cobro: "emitida",
    });
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase.from("estados_pago").update({ factura_id: folio }).in("id", edps.map((e) => e.id));
  if (error) throw new Error(error.message);
  return folio;
}

/** El mandante pagó: la factura queda pagada y sus EDP pasan a "pagado" (lo hace la base). */
export async function marcarFacturaPagada(folio: string) {
  const { error } = await supabase.from("facturas").update({ estado_cobro: "pagada" }).eq("id", folio);
  if (error) throw new Error(error.message);
}
