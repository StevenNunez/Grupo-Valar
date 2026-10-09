"use client";

import { emisorOC } from "./empresa";
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
  };
}

export async function cargarOrdenes(): Promise<Orden[]> {
  const { data, error } = await supabase
    .from("ordenes_proveedor_resumen")
    .select("*")
    .order("fecha_emision", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaOrden[]).map(mapear);
}

/** Una sola orden, con su avance. */
export async function cargarOrden(id: string): Promise<Orden> {
  const { data, error } = await supabase.from("ordenes_proveedor_resumen").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return mapear(data as FilaOrden);
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
    .select("id, descripcion, unidad, cantidad, precio_unitario, tipo, categoria_id, pagnol_material_id")
    .eq("orden_id", ordenId)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({
    id: f.id as string,
    descripcion: f.descripcion as string,
    unidad: f.unidad as string,
    cantidad: Number(f.cantidad),
    precioUnitario: Number(f.precio_unitario),
    tipo: f.tipo as "ordinario" | "reembolsable",
    categoriaId: (f.categoria_id as string | null) ?? null,
    pagnolMaterialId: (f.pagnol_material_id as string | null) ?? null,
  }));
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
  const { data, error } = await supabase
    .from("ordenes_envios")
    .select("id, orden_id, enviada_en, enviada_por_nombre, para, cc, vista_en, vistas, confirmada_en, confirmada_por, fecha_entrega, comentario")
    .order("enviada_en", { ascending: false });
  if (error) {
    console.warn("No se pudieron leer los envíos de OC:", error.message);
    return [];
  }
  return (data ?? []).map((e) => ({
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

export async function cargarDestinatarios(): Promise<Respuesta<Destinatario[]>> {
  const t = await token();
  if (!t) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch("/api/ordenes/destinatarios/", { headers: { Authorization: `Bearer ${t}` } });
    return (await r.json()) as Respuesta<Destinatario[]>;
  } catch {
    return { ok: false, error: "No se pudo cargar la lista de personas de Valar." };
  }
}

export async function enviarOrdenAlProveedor(
  ordenId: string,
  datos: { para: string; cc: string[]; asunto: string; mensaje: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await token();
  if (!t) return { ok: false, error: "La sesión expiró. Vuelve a ingresar." };
  try {
    const r = await fetch(`/api/ordenes/${encodeURIComponent(ordenId)}/enviar/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    return (await r.json()) as { ok: true } | { ok: false; error: string };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor. Revisa la conexión." };
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
