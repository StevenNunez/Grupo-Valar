"use client";

import { eliminar } from "./crud";
import { emisorOC } from "./empresa";
import { traerTodo } from "./paginar";
import { supabase } from "./supabase";

/**
 * Órdenes de compra que Valar emite a sus proveedores, y los ítems que las
 * componen.
 *
 * OJO: `ordenes_compra` (en `ingresos.ts`) son las que el MANDANTE nos emite y
 * autorizan lo que podemos cobrar. Estas son al revés. En obra las dos se
 * llaman "OC"; se distinguen por dónde viven: Ingresos o Egresos.
 */

export type EstadoOrden =
  | "borrador"
  | "emitida"
  | "parcial"
  | "recibida"
  | "cerrada"
  | "anulada";

export const estadosOrden: { id: EstadoOrden; titulo: string }[] = [
  { id: "borrador", titulo: "Borrador" },
  { id: "emitida", titulo: "Emitida" },
  { id: "parcial", titulo: "Recepción parcial" },
  { id: "recibida", titulo: "Recibida" },
  { id: "cerrada", titulo: "Cerrada" },
  { id: "anulada", titulo: "Anulada" },
];

export type Orden = {
  /** El anexo al que se carga (0059); nulo = contrato base. */
  anexoId: string | null;
  id: string;
  contratoId: string;
  numero: string;
  /** A quién apunta en el maestro. Nulo en las órdenes anteriores al maestro. */
  proveedorId: string | null;
  proveedor: string;
  rutProveedor: string | null;
  direccionProveedor: string | null;
  ciudadProveedor: string | null;
  comunaProveedor: string | null;
  contacto: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
  emisorNombre: string | null;
  emisorCorreo: string | null;
  emisorTelefono: string | null;
  proyecto: string | null;
  fechaEmision: string;
  fechaRequerida: string | null;
  lugarEntrega: string | null;
  condicionesPago: string | null;
  solicitadoPor: string | null;
  retira: string | null;
  estado: EstadoOrden;
  observaciones: string | null;
  /* Calculados por la vista a partir de los ítems. */
  items: number;
  itemsRecibidos: number;
  itemsFacturados: number;
  neto: number;
  total: number;
  reembolsable: number;
  /** Facturado neto de notas de crédito. */
  facturado: number;
  /* El ciclo (0051), en pesos netos. */
  recibido: number;
  /** Facturado y todavía no llega: es lo que retiene el pago y pide NC. */
  sinRecibir: number;
  recibidoSinFacturar: number;
  acreditado: number;
  cerrado: number;
  porRecibir: number;
  pagado: number;
  facturas: number;
  /** Lleva más de 5 días facturado algo que no llegó. */
  solicitarNc: boolean;
  /** Lo que cobraron las facturas reales de la OC (con IVA, neto de NC). */
  facturadoReal: number;
  /** Lo ya pagado de esas facturas, entero o en cuotas. */
  pagadoReal: number;
  /** N.º de la cotización del proveedor en que se basa la OC (0104). */
  numeroCotizacion: string | null;
};

type FilaOrden = {
  anexo_id?: string | null;
  id: string;
  contrato_id: string;
  numero: string;
  proveedor_id: string | null;
  proveedor: string;
  rut_proveedor: string | null;
  direccion_proveedor: string | null;
  ciudad_proveedor: string | null;
  comuna_proveedor: string | null;
  contacto: string | null;
  correo_contacto: string | null;
  telefono_contacto: string | null;
  emisor_nombre: string | null;
  emisor_correo: string | null;
  emisor_telefono: string | null;
  proyecto: string | null;
  fecha_emision: string;
  fecha_requerida: string | null;
  lugar_entrega: string | null;
  condiciones_pago: string | null;
  solicitado_por: string | null;
  retira: string | null;
  estado: EstadoOrden;
  observaciones: string | null;
  items: number;
  items_recibidos: number;
  items_facturados: number;
  neto: number;
  total: number;
  reembolsable: number;
  facturado: number;
  recibido: number;
  sin_recibir: number;
  recibido_sin_facturar: number;
  acreditado: number;
  cerrado: number;
  por_recibir: number;
  pagado: number;
  facturas: number;
  solicitar_nc: boolean;
};

function mapear(f: FilaOrden): Orden {
  return {
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
    id: f.id,
    contratoId: f.contrato_id,
    numero: f.numero,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    rutProveedor: f.rut_proveedor,
    direccionProveedor: f.direccion_proveedor,
    ciudadProveedor: f.ciudad_proveedor,
    comunaProveedor: f.comuna_proveedor,
    contacto: f.contacto,
    correoContacto: f.correo_contacto,
    telefonoContacto: f.telefono_contacto,
    emisorNombre: f.emisor_nombre,
    emisorCorreo: f.emisor_correo,
    emisorTelefono: f.emisor_telefono,
    proyecto: f.proyecto,
    fechaEmision: f.fecha_emision,
    fechaRequerida: f.fecha_requerida,
    lugarEntrega: f.lugar_entrega,
    condicionesPago: f.condiciones_pago,
    solicitadoPor: f.solicitado_por,
    retira: f.retira,
    estado: f.estado,
    observaciones: f.observaciones,
    items: f.items,
    itemsRecibidos: f.items_recibidos,
    itemsFacturados: f.items_facturados,
    neto: f.neto,
    total: f.total,
    reembolsable: f.reembolsable,
    facturado: f.facturado,
    recibido: f.recibido ?? 0,
    sinRecibir: f.sin_recibir ?? 0,
    recibidoSinFacturar: f.recibido_sin_facturar ?? 0,
    acreditado: f.acreditado ?? 0,
    cerrado: f.cerrado ?? 0,
    porRecibir: f.por_recibir ?? 0,
    pagado: f.pagado ?? 0,
    facturas: f.facturas ?? 0,
    solicitarNc: f.solicitar_nc ?? false,
    facturadoReal: 0,
    pagadoReal: 0,
    numeroCotizacion: null,
  };
}

/**
 * El N.º de cotización de cada OC. Va aparte de la vista de resumen (no lo
 * trae); si la consulta falla —p. ej. sin la migración 0104— las órdenes salen
 * sin él y nada se rompe.
 */
async function cotizacionesPorOrden(ids?: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  type Fila = { id: string; numero_cotizacion: string | null };
  let filas: Fila[];
  try {
    filas = await traerTodo<Fila>((desde, hasta) => {
      let consulta = supabase
        .from("ordenes_compra_proveedor")
        .select("id, numero_cotizacion")
        .not("numero_cotizacion", "is", null)
        .order("id")
        .range(desde, hasta);
      if (ids) consulta = consulta.in("id", ids);
      return consulta as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>;
    });
  } catch (e) {
    console.warn("No se pudo leer el N.º de cotización de las órdenes:", e instanceof Error ? e.message : e);
    return mapa;
  }
  for (const f of filas) {
    if (f.numero_cotizacion?.trim()) mapa.set(f.id, f.numero_cotizacion.trim());
  }
  return mapa;
}

/**
 * Lo facturado y lo pagado de cada OC, sacado de sus facturas reales (las mismas
 * que ve Pagos): con IVA, neto de notas de crédito, y lo pagado entero o en
 * cuotas. La vista de resumen calcula a precio de la orden y no sabe de cuotas.
 * Si la consulta falla, las órdenes salen sin marca de pago y nada se rompe.
 */
async function pagosPorOrden(ids?: string[]): Promise<Map<string, { facturado: number; pagado: number }>> {
  const mapa = new Map<string, { facturado: number; pagado: number }>();
  type Fila = {
    orden_id: string;
    total: number;
    pagado: number | null;
    estado_pago: string;
    notas_credito: { total: number }[] | null;
  };
  let filas: Fila[];
  try {
    filas = await traerTodo<Fila>((desde, hasta) => {
      let consulta = supabase
        .from("compras")
        .select("orden_id, total, pagado, estado_pago, notas_credito(total)")
        .not("orden_id", "is", null)
        .neq("estado_pago", "anulada")
        .order("id")
        .range(desde, hasta);
      if (ids) consulta = consulta.in("orden_id", ids);
      return consulta as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>;
    });
  } catch (e) {
    console.warn("No se pudo leer el pago de las órdenes:", e instanceof Error ? e.message : e);
    return mapa;
  }
  for (const c of filas) {
    const facturado = Number(c.total) - (c.notas_credito ?? []).reduce((t, nc) => t + Number(nc.total), 0);
    const pagado = c.estado_pago === "pagada" ? facturado : Math.min(Number(c.pagado ?? 0), facturado);
    const previo = mapa.get(c.orden_id) ?? { facturado: 0, pagado: 0 };
    mapa.set(c.orden_id, { facturado: previo.facturado + facturado, pagado: previo.pagado + pagado });
  }
  return mapa;
}

/**
 * El pago de una OC, para la marca del estado. Nada si no hay facturas; "total"
 * cuando todo lo facturado está pagado; "parcial" con el porcentaje si no.
 */
export function pagoDeOrden(o: Orden): { tipo: "total" } | { tipo: "parcial"; pct: number } | null {
  if (o.estado === "borrador" || o.estado === "anulada") return null;
  if (o.facturadoReal <= 0 || o.pagadoReal <= 0) return null;
  if (o.pagadoReal >= o.facturadoReal) return { tipo: "total" };
  return { tipo: "parcial", pct: Math.floor((o.pagadoReal / o.facturadoReal) * 100) };
}

export async function cargarOrdenes(): Promise<Orden[]> {
  // Todas, no solo las primeras 1000 que devuelve la API por defecto.
  const data = await traerTodo<FilaOrden>(
    (desde, hasta) =>
      supabase
        .from("ordenes_proveedor_resumen")
        .select("*")
        .order("fecha_emision", { ascending: false })
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: FilaOrden[] | null; error: { message: string } | null }>,
  );
  const ordenes = data.map(mapear);
  const [pagos, cotizaciones] = await Promise.all([pagosPorOrden(), cotizacionesPorOrden()]);
  for (const o of ordenes) {
    const p = pagos.get(o.id);
    if (p) {
      o.facturadoReal = p.facturado;
      o.pagadoReal = p.pagado;
    }
    o.numeroCotizacion = cotizaciones.get(o.id) ?? null;
  }
  return ordenes;
}

/* ── La lista de Órdenes, por partes ──────────────────────────────────────────
   La pantalla abre con las más recientes y el resto se busca: filtros, buscador
   y orden se resuelven en la base, no sobre una lista completa en el navegador. */

export type OrdenDeLista = "numero-desc" | "numero-asc" | "fecha-desc" | "fecha-asc" | "monto-desc" | "monto-asc" | "proveedor";

export type FiltrosOrdenes = {
  /** Nulo = todos los estados. */
  estados: EstadoOrden[] | null;
  /** "AAAA-MM", o vacío. */
  mes: string;
  texto: string;
  orden: OrdenDeLista;
};

/** Saca lo que rompería la sintaxis de `.or()` de PostgREST. */
const limpiarBusqueda = (t: string) => t.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();

/** Primer día del mes siguiente, para el rango [mes, siguiente). */
function mesSiguiente(aaaamm: string): string {
  const [a, m] = aaaamm.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export async function cargarPaginaOrdenes(f: FiltrosOrdenes, desde: number, cuantos: number): Promise<Orden[]> {
  let q = supabase.from("ordenes_proveedor_resumen").select("*");

  if (f.estados) q = q.in("estado", f.estados);
  if (f.mes) q = q.gte("fecha_emision", `${f.mes}-01`).lt("fecha_emision", mesSiguiente(f.mes));

  const texto = limpiarBusqueda(f.texto);
  if (texto) {
    const condiciones = ["numero", "proveedor", "rut_proveedor", "proyecto", "contrato_id"].map((c) => `${c}.ilike.*${texto}*`);
    // El N.º de cotización no está en la vista: se buscan primero las órdenes que lo tienen.
    const { data: porCotizacion, error } = await supabase
      .from("ordenes_compra_proveedor")
      .select("id")
      .ilike("numero_cotizacion", `%${texto}%`)
      .limit(200);
    if (!error && porCotizacion?.length) condiciones.push(`id.in.(${porCotizacion.map((o) => o.id).join(",")})`);
    q = q.or(condiciones.join(","));
  }

  switch (f.orden) {
    case "numero-desc": q = q.order("numero", { ascending: false }); break;
    case "numero-asc": q = q.order("numero", { ascending: true }); break;
    case "fecha-asc": q = q.order("fecha_emision", { ascending: true }); break;
    case "monto-desc": q = q.order("total", { ascending: false }); break;
    case "monto-asc": q = q.order("total", { ascending: true }); break;
    case "proveedor": q = q.order("proveedor", { ascending: true }); break;
    default: q = q.order("fecha_emision", { ascending: false });
  }
  // Desempate fijo: sin él, las páginas siguientes pueden repetir o saltarse filas.
  const { data, error } = await q.order("id").range(desde, desde + cuantos - 1);
  if (error) throw new Error(error.message);

  const ordenes = ((data ?? []) as FilaOrden[]).map(mapear);
  if (ordenes.length > 0) {
    const ids = ordenes.map((o) => o.id);
    const [pagos, cotizaciones] = await Promise.all([pagosPorOrden(ids), cotizacionesPorOrden(ids)]);
    for (const o of ordenes) {
      const p = pagos.get(o.id);
      if (p) {
        o.facturadoReal = p.facturado;
        o.pagadoReal = p.pagado;
      }
      o.numeroCotizacion = cotizaciones.get(o.id) ?? null;
    }
  }
  return ordenes;
}

export type ResumenOrdenes = {
  cantidad: number;
  neto: number;
  abiertas: number;
  /** Comprometido en órdenes abiertas que el proveedor aún no facturó. */
  porFacturar: number;
  reembolsable: number;
  ultimoNumero: string | null;
  /** Los meses con órdenes, del más reciente al más antiguo ("AAAA-MM"). */
  meses: string[];
};

/**
 * Las cifras de arriba de la pantalla, sobre TODAS las órdenes (la lista solo
 * trae las más recientes). Pide pocas columnas y de a tandas.
 */
export async function cargarResumenOrdenes(): Promise<ResumenOrdenes> {
  type Fila = { numero: string; estado: EstadoOrden; fecha_emision: string; neto: number; facturado: number; reembolsable: number };
  const filas = await traerTodo<Fila>(
    (desde, hasta) =>
      supabase
        .from("ordenes_proveedor_resumen")
        .select("numero, estado, fecha_emision, neto, facturado, reembolsable")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>,
  );
  const correlativo = (n: string) => Number(/(\d+)\D*$/.exec(n ?? "")?.[1] ?? 0);
  let neto = 0, abiertas = 0, porFacturar = 0, reembolsable = 0;
  let ultimo: Fila | null = null;
  for (const o of filas) {
    neto += Number(o.neto);
    reembolsable += Number(o.reembolsable);
    if (o.estado === "emitida" || o.estado === "parcial") {
      abiertas++;
      porFacturar += Number(o.neto) - Number(o.facturado);
    }
    if (!ultimo || correlativo(o.numero) > correlativo(ultimo.numero)) ultimo = o;
  }
  return {
    cantidad: filas.length,
    neto,
    abiertas,
    porFacturar,
    reembolsable,
    ultimoNumero: ultimo?.numero ?? null,
    meses: [...new Set(filas.map((o) => o.fecha_emision.slice(0, 7)))].sort().reverse(),
  };
}

/** Una sola orden, con su avance. */
export async function cargarOrden(id: string): Promise<Orden> {
  const { data, error } = await supabase.from("ordenes_proveedor_resumen").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  const orden = mapear(data as FilaOrden);
  const [pagos, cotizaciones] = await Promise.all([pagosPorOrden([id]), cotizacionesPorOrden([id])]);
  const p = pagos.get(id);
  if (p) {
    orden.facturadoReal = p.facturado;
    orden.pagadoReal = p.pagado;
  }
  orden.numeroCotizacion = cotizaciones.get(id) ?? null;
  return orden;
}

/**
 * El siguiente número de la serie. Es una sugerencia: el campo se edita.
 *
 * Se calcula acá y no con la función `siguiente_numero_oc()` de la base porque
 * PostgREST solo expone las funciones que tiene en su caché de esquema, y una
 * recién creada puede tardar en aparecer. Proponer un número no vale una
 * dependencia que puede fallar en silencio.
 */
export async function siguienteNumero(): Promise<string> {
  const { data, error } = await supabase
    .from("ordenes_compra_proveedor")
    .select("numero");

  const porDefecto = `${emisorOC.serieOC}-${String(emisorOC.siguienteCorrelativo).padStart(emisorOC.digitosCorrelativo, "0")}`;

  if (error) {
    // Que falle la sugerencia no puede impedir emitir una orden.
    console.warn("No se pudo proponer el número de OC:", error.message);
    return porDefecto;
  }

  const numeros = (data ?? []) as { numero: string }[];
  let mayor = 0;
  let prefijo = emisorOC.serieOC + "-";
  let digitos: number = emisorOC.digitosCorrelativo;

  for (const { numero } of numeros) {
    // Se compara la parte NUMÉRICA, no el texto: como texto, "OC22-9" le
    // ganaría a "OC22-001128" y propondríamos un número ya usado.
    const partes = /^(.*-)(\d+)$/.exec(numero ?? "");
    if (!partes) continue;
    const valor = Number(partes[2]);
    if (valor > mayor) {
      mayor = valor;
      prefijo = partes[1];
      digitos = partes[2].length;
    }
  }

  if (mayor === 0) return porDefecto;
  return prefijo + String(mayor + 1).padStart(digitos, "0");
}

/**
 * El teléfono con que esta persona firmó su última orden. El perfil no guarda
 * teléfono, y teclearlo en cada OC es la forma de terminar con uno distinto en
 * cada una; se propone el último y se corrige si cambió.
 */
export async function ultimoTelefonoDeEmisor(correo: string): Promise<string> {
  const { data, error } = await supabase
    .from("ordenes_compra_proveedor")
    .select("emisor_telefono")
    .eq("emisor_correo", correo)
    .not("emisor_telefono", "is", null)
    .neq("emisor_telefono", "")
    .order("fecha_emision", { ascending: false })
    .limit(1);
  if (error) return "";
  return ((data ?? [])[0] as { emisor_telefono: string } | undefined)?.emisor_telefono ?? "";
}

/* ── Ítems ────────────────────────────────────────────────────────────────── */

export type Etapa = "pendiente" | "parcial" | "recibido" | "facturado" | "pagado";

export const etapas: Record<Etapa, { titulo: string; tono: "neutro" | "info" | "aviso" | "bueno" }> = {
  pendiente: { titulo: "Pendiente", tono: "neutro" },
  parcial: { titulo: "Parcial", tono: "aviso" },
  recibido: { titulo: "Recibido", tono: "info" },
  facturado: { titulo: "Facturado", tono: "info" },
  pagado: { titulo: "Pagado", tono: "bueno" },
};

export type Item = {
  id: string;
  contratoId: string;
  ordenId: string | null;
  compraId: string | null;
  categoriaId: string | null;
  categoria: string;
  familia: string;
  ordenNumero: string | null;
  facturaNumero: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  neto: number;
  iva: number;
  total: number;
  tipo: "ordinario" | "reembolsable";
  estadoRecepcion: "pendiente" | "parcial" | "recibido";
  cantidadRecibida: number;
  fechaRecepcion: string | null;
  fecha: string;
  etapa: Etapa;
};

type FilaItem = {
  id: string;
  contrato_id: string;
  orden_id: string | null;
  compra_id: string | null;
  categoria_id: string | null;
  categoria: string;
  familia: string;
  orden_numero: string | null;
  factura_numero: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  neto: number;
  iva: number;
  total: number;
  tipo: "ordinario" | "reembolsable";
  estado_recepcion: "pendiente" | "parcial" | "recibido";
  cantidad_recibida: number;
  fecha_recepcion: string | null;
  fecha: string;
  etapa: Etapa;
};

function mapearItem(f: FilaItem): Item {
  return {
    id: f.id,
    contratoId: f.contrato_id,
    ordenId: f.orden_id,
    compraId: f.compra_id,
    categoriaId: f.categoria_id,
    categoria: f.categoria,
    familia: f.familia,
    ordenNumero: f.orden_numero,
    facturaNumero: f.factura_numero,
    descripcion: f.descripcion,
    cantidad: Number(f.cantidad),
    unidad: f.unidad,
    precioUnitario: f.precio_unitario,
    neto: f.neto,
    iva: f.iva,
    total: f.total,
    tipo: f.tipo,
    estadoRecepcion: f.estado_recepcion,
    cantidadRecibida: Number(f.cantidad_recibida),
    fechaRecepcion: f.fecha_recepcion,
    fecha: f.fecha,
    etapa: f.etapa,
  };
}

export async function cargarItemsDeOrden(ordenId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items_detalle")
    .select("*")
    .eq("orden_id", ordenId)
    .order("id");

  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaItem[]).map(mapearItem);
}

/** Todos los ítems de un contrato, con o sin orden. */
export async function cargarItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items_detalle")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaItem[]).map(mapearItem);
}

/* ── Las líneas tal como se pidieron ──────────────────────────────────────── */

/**
 * Las líneas de la orden desde la tabla, para editarla. `items_detalle` ya no
 * sirve para esto: desde la 0051 su cantidad es lo VIGENTE (descontadas NC y
 * cierres), y guardar eso como cantidad pedida borraría la historia.
 */
export async function cargarLineasDeOrden(ordenId: string) {
  const { data, error } = await supabase
    .from("items_compra")
    .select("id, descripcion, unidad, cantidad, precio_unitario, iva, tipo, categoria_id, pagnol_material_id")
    .eq("orden_id", ordenId)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({
    id: f.id as string,
    descripcion: f.descripcion as string,
    unidad: f.unidad as string,
    cantidad: Number(f.cantidad),
    precioUnitario: Number(f.precio_unitario),
    iva: Number(f.iva ?? 0),
    tipo: f.tipo as "ordinario" | "reembolsable",
    categoriaId: (f.categoria_id as string | null) ?? null,
    pagnolMaterialId: (f.pagnol_material_id as string | null) ?? null,
  }));
}

/* ── Descuento de la orden (0102) ─────────────────────────────────────────── */

/**
 * Precio que se paga: la lista menos el descuento, a peso entero. Es el que
 * se guarda como `precio_unitario`, así todo lo que cuelga de la orden (neto, IVA,
 * facturas, costo) cuadra con su total sin saber que hubo descuento.
 */
export const precioConDescuento = (lista: number, porcentaje: number) =>
  porcentaje > 0 ? Math.round(lista * (1 - porcentaje / 100)) : lista;

export type DescuentoDeOrden = {
  porcentaje: number;
  /** Precio de lista por línea (id del ítem). Vacío si la orden no tiene descuento. */
  listas: Map<string, number>;
  /** Número de la cotización del proveedor (0104). Vacío si no se anotó. */
  cotizacion: string;
};

/** El descuento de una orden y los precios de lista. Sin la 0102 aplicada, ninguno. */
export async function cargarDescuentoDeOrden(ordenId: string): Promise<DescuentoDeOrden> {
  const [orden, items] = await Promise.all([
    supabase.from("ordenes_compra_proveedor").select("descuento_porcentaje, numero_cotizacion").eq("id", ordenId).maybeSingle(),
    supabase.from("items_compra").select("id, precio_lista").eq("orden_id", ordenId),
  ]);
  if (orden.error || items.error) return { porcentaje: 0, listas: new Map(), cotizacion: "" };
  const listas = new Map<string, number>();
  for (const i of items.data ?? []) if (i.precio_lista != null) listas.set(i.id as string, Number(i.precio_lista));
  return {
    porcentaje: Number(orden.data?.descuento_porcentaje ?? 0),
    listas,
    cotizacion: (orden.data?.numero_cotizacion as string | null | undefined) ?? "",
  };
}

/* ── Envío al proveedor (0069) ────────────────────────────────────────────── */

/**
 * Cada vez que la OC se le mandó al proveedor, y qué hizo él con el enlace.
 * La escribe el servidor al enviar y la página del proveedor al confirmar.
 */
export type EnvioOrden = {
  id: string;
  ordenId: string;
  enviadaEn: string;
  enviadaPor: string | null;
  para: string;
  cc: string[];
  vistaEn: string | null;
  vistas: number;
  confirmadaEn: string | null;
  confirmadaPor: string | null;
  fechaEntrega: string | null;
  comentario: string | null;
};

/** Todos, del más nuevo al más viejo. Sin la 0069 aplicada, ninguno. */
export async function cargarEnvios(): Promise<EnvioOrden[]> {
  type Fila = {
    id: string; orden_id: string; enviada_en: string; enviada_por_nombre: string | null; para: string;
    cc: string[] | null; vista_en: string | null; vistas: number | null; confirmada_en: string | null;
    confirmada_por: string | null; fecha_entrega: string | null; comentario: string | null;
  };
  let data: Fila[];
  try {
    data = await traerTodo<Fila>(
      (desde, hasta) =>
        supabase
          .from("ordenes_envios")
          .select("id, orden_id, enviada_en, enviada_por_nombre, para, cc, vista_en, vistas, confirmada_en, confirmada_por, fecha_entrega, comentario")
          .order("enviada_en", { ascending: false })
          .order("id")
          .range(desde, hasta) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>,
    );
  } catch (e) {
    console.warn("No se pudieron leer los envíos de OC:", e instanceof Error ? e.message : e);
    return [];
  }
  return data.map((e) => ({
    id: e.id,
    ordenId: e.orden_id,
    enviadaEn: e.enviada_en,
    enviadaPor: e.enviada_por_nombre,
    para: e.para,
    cc: e.cc ?? [],
    vistaEn: e.vista_en,
    vistas: e.vistas ?? 0,
    confirmadaEn: e.confirmada_en,
    confirmadaPor: e.confirmada_por,
    fechaEntrega: e.fecha_entrega,
    comentario: e.comentario,
  }));
}

/* Las llamadas al servidor llevan el token de la sesión: las rutas de /api/
   son públicas y es lo que les dice quién pide. Nunca lanzan: devuelven el
   error escrito para la pantalla. */

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };

export type Destinatario = { nombre: string; correo: string; cargo: string };

export async function cargarDestinatarios(
  para: "orden" | "cotizacion" = "orden",
): Promise<Respuesta<Destinatario[]>> {
  const t = await token();
  if (!t) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch(`/api/ordenes/destinatarios/${para === "cotizacion" ? "?para=cotizacion" : ""}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    return (await r.json()) as Respuesta<Destinatario[]>;
  } catch {
    return { ok: false, error: "No se pudo cargar la lista de personas de Valar." };
  }
}

export async function enviarOrdenAlProveedor(
  ordenId: string,
  datos: { para: string; cc: string[]; asunto: string; mensaje: string },
): Promise<{ ok: true; pagnol?: { ok: boolean; error?: string } | null } | { ok: false; error: string }> {
  const t = await token();
  if (!t) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch(`/api/ordenes/${encodeURIComponent(ordenId)}/enviar/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    return (await r.json()) as { ok: true; pagnol?: { ok: boolean; error?: string } | null } | { ok: false; error: string };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor. Revisa la conexión." };
  }
}

export type FirmasImpresas = { emite: string | null; autoriza: string | null; autorizaNombre: string | null };

/** Las firmas dibujadas para la hoja impresa. Sin ellas la hoja sale con la raya en blanco, como antes. */
export async function cargarFirmasDeOrden(ordenId: string): Promise<FirmasImpresas | null> {
  const t = await token();
  if (!t) return null;
  try {
    const r = await fetch(`/api/ordenes/${encodeURIComponent(ordenId)}/firmas/`, { headers: { Authorization: `Bearer ${t}` } });
    const j = (await r.json()) as Respuesta<FirmasImpresas>;
    return j.ok ? j.datos : null;
  } catch {
    return null;
  }
}

/** El PDF que va adjunto, para revisarlo antes de enviar. Se abre en otra pestaña. */
export async function abrirPdfDeOrden(ordenId: string): Promise<string | null> {
  const t = await token();
  if (!t) return "La sesión expiró. Vuelve a ingresar.";
  // La pestaña se abre ANTES del fetch: después, el navegador la bloquea por no venir de un clic.
  const ventana = window.open("", "_blank");
  try {
    const r = await fetch(`/api/ordenes/${encodeURIComponent(ordenId)}/pdf/`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!r.ok) throw new Error(await r.text());
    const url = URL.createObjectURL(await r.blob());
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
    return null;
  } catch (e) {
    ventana?.close();
    return e instanceof Error ? e.message : "No se pudo generar el PDF.";
  }
}

/**
 * Borra la orden con todos sus ítems: una OC es un gasto, y sin ella sus líneas
 * no tienen mes ni sentido (quedaban sueltas, contando costo sin período).
 *
 * Se niega si algo ya se recibió o se facturó: ahí hay guías, facturas y pagos
 * que dependen de esas líneas, y borrarlas dejaría la historia incompleta. Para
 * esos casos el camino es anular la orden o cerrar lo pendiente.
 */
/**
 * Solo Soporte: borra la orden con TODO lo que cuelga (ítems, recepciones,
 * facturas propias y sus notas de crédito). Lo hace una función de la base en
 * una sola transacción (`eliminar_orden_completa`, migración 0087), que vuelve a
 * comprobar que quien llama es Soporte. Es irreversible.
 */
export async function eliminarOrdenCompleta(ordenId: string) {
  const { error } = await supabase.rpc("eliminar_orden_completa", { p_orden: ordenId });
  if (error) {
    throw new Error(
      /eliminar_orden_completa/.test(error.message) && /schema cache|not find|does not exist/i.test(error.message)
        ? "Falta aplicar la migración 0087 en la base."
        : error.message,
    );
  }
}

export async function eliminarOrdenConItems(ordenId: string) {
  const { data, error } = await supabase
    .from("items_compra")
    .select("id, compra_id, cantidad_recibida")
    .eq("orden_id", ordenId);
  if (error) throw new Error(error.message);

  const filas = (data ?? []) as { id: string; compra_id: string | null; cantidad_recibida: number }[];
  if (filas.some((i) => i.compra_id || Number(i.cantidad_recibida) > 0)) {
    throw new Error(
      "Esta orden ya tiene ítems recibidos o facturados, así que no se puede borrar. Anúlala (estado «Anulada») o cierra lo pendiente desde el ciclo de la orden.",
    );
  }

  if (filas.length > 0) {
    const { error: errItems } = await supabase.from("items_compra").delete().eq("orden_id", ordenId);
    if (errItems) throw new Error(errItems.message);
  }
  await eliminar("ordenes_compra_proveedor", ordenId);
}
