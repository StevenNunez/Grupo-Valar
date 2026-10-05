"use client";

import { supabase } from "./supabase";
import { emisorOC as emisorSolicitud } from "./empresa";
import { formatearFecha } from "./formato";

/**
 * Datos del módulo de Abastecimiento: proveedores y SOLPED.
 *
 * El ciclo que sostiene es: llega una solicitud de faena → se aprueba la
 * necesidad → se cotiza → se compra. Las órdenes de compra ya existían y viven
 * en `lib/ordenes.ts`; acá está lo que va antes.
 *
 * Ver `supabase/migraciones/0015_abastecimiento.sql` para el modelo.
 */

/* ── Proveedores ──────────────────────────────────────────────────────────── */

export type EstadoProveedor = "activo" | "por_completar" | "suspendido" | "inactivo";

export const estadosProveedor: { id: EstadoProveedor; titulo: string }[] = [
  { id: "activo", titulo: "Activo" },
  { id: "por_completar", titulo: "Por completar" },
  { id: "suspendido", titulo: "Suspendido" },
  { id: "inactivo", titulo: "Inactivo" },
];

export type Proveedor = {
  id: string;
  /** Puede faltar: se carga desde el listado y se completa después. */
  rut: string | null;
  razonSocial: string;
  nombreFantasia: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  contacto: string | null;
  correo: string | null;
  correoPago: string | null;
  telefono: string | null;
  banco: string | null;
  tipoCuenta: string | null;
  numeroCuenta: string | null;
  condicionPago: string;
  diasCredito: number;
  rubros: string[];
  estado: EstadoProveedor;
  observaciones: string | null;
  /** El mismo proveedor en Pagnol, si se enlazó. Solo la referencia. */
  pagnolProveedorId: string | null;
};

type FilaProveedor = {
  id: string;
  rut: string | null;
  razon_social: string;
  nombre_fantasia: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  contacto: string | null;
  correo: string | null;
  correo_pago: string | null;
  telefono: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  condicion_pago: string;
  dias_credito: number;
  rubros: string[] | null;
  estado: EstadoProveedor;
  observaciones: string | null;
  pagnol_proveedor_id?: string | null;
};

function mapearProveedor(f: FilaProveedor): Proveedor {
  return {
    id: f.id,
    rut: f.rut,
    razonSocial: f.razon_social,
    nombreFantasia: f.nombre_fantasia,
    giro: f.giro,
    direccion: f.direccion,
    comuna: f.comuna,
    ciudad: f.ciudad,
    contacto: f.contacto,
    correo: f.correo,
    correoPago: f.correo_pago,
    telefono: f.telefono,
    banco: f.banco,
    tipoCuenta: f.tipo_cuenta,
    numeroCuenta: f.numero_cuenta,
    condicionPago: f.condicion_pago,
    diasCredito: f.dias_credito,
    rubros: f.rubros ?? [],
    estado: f.estado,
    observaciones: f.observaciones,
    pagnolProveedorId: f.pagnol_proveedor_id ?? null,
  };
}

export async function cargarProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .order("razon_social");

  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaProveedor[]).map(mapearProveedor);
}

/**
 * El RUT, en la forma en que se guarda: sin puntos, con guion, K mayúscula.
 *
 * La base lo normaliza igual con un trigger —es ahí donde tiene que estar la
 * verdad—, pero repetirlo acá deja que la pantalla muestre en el momento cómo va
 * a quedar, en vez de que el usuario descubra el cambio después de guardar.
 */
export function normalizarRut(entrada: string) {
  const limpio = entrada.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** El dígito verificador, para avisar de un RUT mal tecleado antes de guardarlo. */
export function rutValido(entrada: string) {
  const normalizado = normalizarRut(entrada);
  const [cuerpo, dv] = normalizado.split("-");
  if (!cuerpo || !dv || cuerpo.length < 7) return false;

  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return esperado === dv;
}

/**
 * "77.256.185-7", para mostrar. Se guarda sin puntos.
 *
 * Acepta nulo porque un proveedor puede entrar sin RUT: los 80 del listado de
 * Valar vinieron así, y exigirlo habría dejado el listado en el Excel.
 */
export function formatearRut(rut: string | null) {
  if (!rut) return "Sin RUT";
  const [cuerpo, dv] = rut.split("-");
  if (!cuerpo || !dv) return rut;
  return `${Number(cuerpo).toLocaleString("es-CL")}-${dv}`;
}

/** Correlativo del maestro: PRV-0001, PRV-0002… */
export function siguienteIdProveedor(proveedores: Proveedor[]) {
  const numeros = proveedores
    .map((p) => Number(/^PRV-(\d+)$/.exec(p.id)?.[1] ?? 0))
    .filter((n) => n > 0);
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1;
  return `PRV-${String(siguiente).padStart(4, "0")}`;
}

export function opcionesDeProveedor(proveedores: Proveedor[]) {
  return proveedores
    .filter((p) => p.estado === "activo" || p.estado === "por_completar")
    .map((p) => ({
      id: p.id,
      titulo: p.rut ? `${p.razonSocial} · ${formatearRut(p.rut)}` : p.razonSocial,
    }));
}

/* ── Condiciones de pago ──────────────────────────────────────────────────── */

/**
 * Con qué plazo se le paga a un proveedor. Es una lista corta y cerrada: al
 * contado, o crédito a 30, 60 o 90 días. No hay una quinta forma.
 *
 * ERA TEXTO LIBRE, y eso significaba que "30 días", "30 dias", "Crédito 30" y
 * "a 30 días" eran cuatro condiciones distintas para cualquier consulta, y que
 * el vencimiento de la factura —que se calcula con los DÍAS— podía no tener
 * nada que ver con lo que decía la orden impresa.
 *
 * El dato duro son los días: de ahí sale el vencimiento en `cuentas_por_pagar`.
 * El texto es la etiqueta, y existe porque es lo que se imprime en la OC.
 */
export const condicionesPago = [
  { id: "Contado", titulo: "Al contado", dias: 0 },
  { id: "Crédito 30 días", titulo: "Crédito a 30 días", dias: 30 },
  { id: "Crédito 60 días", titulo: "Crédito a 60 días", dias: 60 },
  { id: "Crédito 90 días", titulo: "Crédito a 90 días", dias: 90 },
] as const;

export type CondicionPago = (typeof condicionesPago)[number]["id"];

export const opcionesCondicionPago = condicionesPago.map((c) => ({
  id: c.id,
  titulo: c.titulo,
}));

/** Los días de crédito de una condición. Lo que no se reconoce va a contado. */
export function diasDeCondicion(condicion: string | null) {
  return condicionesPago.find((c) => c.id === condicion)?.dias ?? 0;
}

/**
 * La condición que corresponde a una ficha de proveedor.
 *
 * Las fichas viejas traen texto libre ("30 días", "Contado", null) y días por
 * separado. Mandan los días, porque son con los que se calcula el vencimiento;
 * el texto solo desempata cuando los días no calzan con ninguna condición.
 */
export function condicionDeProveedor(p: {
  condicionPago?: string | null;
  diasCredito?: number | null;
}): CondicionPago {
  const porDias = condicionesPago.find((c) => c.dias === (p.diasCredito ?? 0));
  if (porDias && (p.diasCredito ?? 0) > 0) return porDias.id;

  const texto = (p.condicionPago ?? "").toLowerCase();
  if (/90/.test(texto)) return "Crédito 90 días";
  if (/60/.test(texto)) return "Crédito 60 días";
  if (/30/.test(texto)) return "Crédito 30 días";
  return "Contado";
}

/* ── SOLPED ───────────────────────────────────────────────────────────────── */

export type EstadoSolped =
  | "borrador"
  | "en-aprobacion"
  | "aprobada"
  | "en-cotizacion"
  | "cotizada"
  | "en-compra"
  | "parcial"
  | "cerrada"
  | "rechazada"
  | "anulada";

/** El camino normal de una solicitud, en orden. */
export const etapasSolped: EstadoSolped[] = [
  "borrador",
  "en-aprobacion",
  "aprobada",
  "en-cotizacion",
  "cotizada",
  "en-compra",
  "parcial",
  "cerrada",
];

export const nombreEstadoSolped: Record<EstadoSolped, string> = {
  borrador: "Borrador",
  "en-aprobacion": "En aprobación",
  aprobada: "Aprobada",
  "en-cotizacion": "En cotización",
  cotizada: "Cotizada",
  "en-compra": "En compra",
  parcial: "Recepción parcial",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
  anulada: "Anulada",
};

export type Prioridad = "normal" | "alta" | "urgente";

export const prioridades: { id: Prioridad; titulo: string }[] = [
  { id: "normal", titulo: "Normal" },
  { id: "alta", titulo: "Alta" },
  { id: "urgente", titulo: "Urgente" },
];

export const tiposGasto = [
  { id: "ordinario" as const, titulo: "No reembolsable" },
  { id: "reembolsable" as const, titulo: "Reembolsable" },
];

export type Solped = {
  id: string;
  numero: string;
  contratoId: string;
  contrato: string;
  solicitanteNombre: string;
  solicitanteCargo: string | null;
  area: string | null;
  fechaEmision: string;
  fechaRequerida: string | null;
  tipoGasto: "ordinario" | "reembolsable";
  prioridad: Prioridad;
  estado: EstadoSolped;
  items: number;
  cantidadPedida: number;
  cantidadComprada: number;
  cantidadRecibida: number;
  compradoNeto: number;
  diasAbierta: number;
};

type FilaSolped = {
  id: string;
  numero: string;
  contrato_id: string;
  contrato: string;
  solicitante_nombre: string;
  solicitante_cargo: string | null;
  area: string | null;
  fecha_emision: string;
  fecha_requerida: string | null;
  tipo_gasto: "ordinario" | "reembolsable";
  prioridad: Prioridad;
  estado: EstadoSolped;
  items: number;
  cantidad_pedida: number;
  cantidad_comprada: number;
  cantidad_recibida: number;
  comprado_neto: number;
  dias_abierta: number;
};

export async function cargarSolped(): Promise<Solped[]> {
  const { data, error } = await supabase
    .from("solped_resumen")
    .select("*")
    .order("fecha_emision", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as FilaSolped[]).map((f) => ({
    id: f.id,
    numero: f.numero,
    contratoId: f.contrato_id,
    contrato: f.contrato,
    solicitanteNombre: f.solicitante_nombre,
    solicitanteCargo: f.solicitante_cargo,
    area: f.area,
    fechaEmision: f.fecha_emision,
    fechaRequerida: f.fecha_requerida,
    tipoGasto: f.tipo_gasto,
    prioridad: f.prioridad,
    estado: f.estado,
    items: Number(f.items),
    cantidadPedida: Number(f.cantidad_pedida),
    cantidadComprada: Number(f.cantidad_comprada),
    cantidadRecibida: Number(f.cantidad_recibida),
    compradoNeto: Number(f.comprado_neto),
    diasAbierta: Number(f.dias_abierta),
  }));
}

export type ItemSolped = {
  id: string;
  solpedId: string;
  linea: number;
  /** Como lo escribió faena. */
  descripcion: string;
  unidad: string;
  cantidad: number;
  categoriaId: string | null;
  observacion: string | null;
  /** Del maestro, cuando el ítem quedó enlazado. */
  articuloId: string | null;
  /** El material en Pagnol, si se eligió de ahí. Solo la referencia. */
  pagnolMaterialId: string | null;
  /** Con el que hay que pedirlo: el técnico si se conoce, si no el de faena. */
  nombreParaPedir: string;
  especificacion: string | null;
};

export async function cargarItemsDeSolped(solpedId: string): Promise<ItemSolped[]> {
  /* Se trae el artículo enlazado para saber con qué nombre pedirlo: faena pide
     "lentes oscuros" y al proveedor hay que decirle "LENTE MAX FENIX IN OUT".
     Ver `lib/articulos.ts` para por qué son dos nombres y no uno. */
  const { data, error } = await supabase
    .from("solped_items")
    .select("*, articulos(nombre, nombre_tecnico, especificacion)")
    .eq("solped_id", solpedId)
    .order("linea");

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => {
    const articulo = [f.articulos].flat()[0] as
      | { nombre: string; nombre_tecnico: string | null; especificacion: string | null }
      | undefined;
    const descripcion = f.descripcion as string;

    return {
      id: f.id as string,
      solpedId: f.solped_id as string,
      linea: Number(f.linea),
      descripcion,
      unidad: f.unidad as string,
      cantidad: Number(f.cantidad),
      categoriaId: (f.categoria_id as string | null) ?? null,
      observacion: (f.observacion as string | null) ?? null,
      articuloId: (f.articulo_id as string | null) ?? null,
      pagnolMaterialId: (f.pagnol_material_id as string | null) ?? null,
      nombreParaPedir: articulo?.nombre_tecnico?.trim() || descripcion,
      especificacion: articulo?.especificacion ?? null,
    };
  });
}

/** Una cotización suelta, para lo que la vista del comparativo no expone. */
export async function cargarCotizacion(id: string) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("observaciones, validez_hasta")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return {
    observaciones: (data?.observaciones as string | null) ?? null,
    validezHasta: (data?.validez_hasta as string | null) ?? null,
  };
}

/**
 * El número que le toca a la próxima solicitud.
 *
 * Se calcula en la app y no con una función SQL por la misma razón que el
 * correlativo de la orden de compra: PostgREST sirve desde una caché de esquema
 * y una función recién creada puede no existir todavía para el cliente.
 *
 * Compara la parte numérica, no el texto: "SOLPED-9" no le gana a "SOLPED-097".
 */
export function siguienteNumeroSolped(solped: Solped[]) {
  const numeros = solped
    .map((s) => Number(/(\d+)\s*$/.exec(s.numero)?.[1] ?? 0))
    .filter((n) => n > 0);
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1;
  return `SOLPED-${String(siguiente).padStart(3, "0")}`;
}

/* ── Aprobaciones ─────────────────────────────────────────────────────────── */

export type Aprobacion = {
  id: number;
  documento: string;
  registroId: string;
  monto: number | null;
  accion: "aprobado" | "rechazado" | "devuelto";
  usuarioNombre: string | null;
  usuarioCargo: string | null;
  usuarioRol: string | null;
  comentario: string | null;
  ocurridoEn: string;
};

export async function cargarAprobaciones(documento: string, registroId: string) {
  const { data, error } = await supabase
    .from("aprobaciones")
    .select("*")
    .eq("documento", documento)
    .eq("registro_id", registroId)
    .order("ocurrido_en", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: Number(f.id),
    documento: f.documento as string,
    registroId: f.registro_id as string,
    monto: f.monto === null ? null : Number(f.monto),
    accion: f.accion as Aprobacion["accion"],
    usuarioNombre: (f.usuario_nombre as string | null) ?? null,
    usuarioCargo: (f.usuario_cargo as string | null) ?? null,
    usuarioRol: (f.usuario_rol as string | null) ?? null,
    comentario: (f.comentario as string | null) ?? null,
    ocurridoEn: f.ocurrido_en as string,
  })) as Aprobacion[];
}

/**
 * Firma un documento.
 *
 * El usuario no viaja como dato de confianza: RLS exige que `usuario_id` sea
 * `auth.uid()` y que el rol pueda aprobar. El nombre y el cargo van copiados
 * para que la firma sobreviva al borrado de la cuenta.
 */
export async function firmar({
  documento,
  registroId,
  monto,
  accion,
  usuario,
  comentario,
}: {
  documento: "solped" | "compra";
  registroId: string;
  monto: number | null;
  accion: Aprobacion["accion"];
  usuario: { id: string; nombre: string; cargo: string; rol: string };
  comentario?: string;
}) {
  const { error } = await supabase.from("aprobaciones").insert({
    documento,
    registro_id: registroId,
    monto,
    accion,
    usuario_id: usuario.id,
    usuario_nombre: usuario.nombre,
    usuario_cargo: usuario.cargo,
    usuario_rol: usuario.rol,
    comentario: comentario?.trim() || null,
  });

  if (error) {
    if (/violates row-level security/i.test(error.message)) {
      throw new Error(
        "Tu cuenta no puede autorizar. Se necesita rol de administrador de contrato o de gerencia.",
      );
    }
    throw new Error(error.message);
  }
}

/** Qué roles tienen que firmar un documento de este monto, según las reglas. */
export async function aprobadoresRequeridos(documento: "solped" | "compra", monto: number) {
  const { data, error } = await supabase
    .from("reglas_aprobacion")
    .select("rol, monto_desde, monto_hasta, orden")
    .eq("documento", documento)
    .eq("activa", true)
    .order("orden");

  if (error) return [];

  return (data ?? [])
    .filter(
      (r: Record<string, unknown>) =>
        monto >= Number(r.monto_desde) &&
        (r.monto_hasta === null || monto <= Number(r.monto_hasta)),
    )
    .map((r: Record<string, unknown>) => r.rol as string);
}

/* ── Avance por ítem ──────────────────────────────────────────────────────── */

export type EstadoItem =
  | "pendiente"
  | "cotizado"
  | "comprado-parcial"
  | "comprado"
  | "recibido";

export const nombreEstadoItem: Record<EstadoItem, string> = {
  pendiente: "Pendiente",
  cotizado: "Cotizado",
  "comprado-parcial": "Comprado en parte",
  comprado: "Comprado",
  recibido: "Recibido",
};

export type AvanceItem = {
  id: string;
  linea: number;
  descripcion: string;
  unidad: string;
  cantidadPedida: number;
  cantidadComprada: number;
  cantidadRecibida: number;
  cantidadPendiente: number;
  compradoNeto: number;
  ordenes: number;
  estado: EstadoItem;
};

/**
 * Cuánto va de cada ítem pedido.
 *
 * El estado vive por ítem y no por documento: una solicitud puede tener un ítem
 * recibido, otro comprado y otro esperando cotización, y las tres cosas son
 * ciertas al mismo tiempo. Nada de esto se guarda: se deduce de las órdenes.
 */
export async function cargarAvanceDeSolped(solpedId: string): Promise<AvanceItem[]> {
  const { data, error } = await supabase
    .from("solped_items_avance")
    .select("*")
    .eq("solped_id", solpedId)
    .order("linea");

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    linea: Number(f.linea),
    descripcion: f.descripcion as string,
    unidad: f.unidad as string,
    cantidadPedida: Number(f.cantidad_pedida),
    cantidadComprada: Number(f.cantidad_comprada),
    cantidadRecibida: Number(f.cantidad_recibida),
    cantidadPendiente: Number(f.cantidad_pendiente),
    compradoNeto: Number(f.comprado_neto),
    ordenes: Number(f.ordenes),
    estado: f.estado as EstadoItem,
  }));
}

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
};

export async function cargarItemsDeCotizacion(cotizacionId: string): Promise<ItemCotizado[]> {
  const { data, error } = await supabase
    .from("cotizacion_items")
    .select("*")
    .eq("cotizacion_id", cotizacionId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.id as string,
    cotizacionId: f.cotizacion_id as string,
    solpedItemId: f.solped_item_id as string,
    cantidad: Number(f.cantidad),
    precioUnitario: Number(f.precio_unitario),
    neto: Number(f.neto),
    disponible: Boolean(f.disponible),
    plazoDias: f.plazo_dias === null ? null : Number(f.plazo_dias),
    observacion: (f.observacion as string | null) ?? null,
  }));
}

/** Correlativo de la cotización dentro de su solicitud: COT-<solped>-01. */
export function siguienteIdCotizacion(solpedId: string, cuantas: number) {
  return `COT-${solpedId}-${String(cuantas + 1).padStart(2, "0")}`;
}

/* ── Pedir cotización ─────────────────────────────────────────────────────── */

/**
 * El correlativo de la solicitud de cotización que se le manda al proveedor.
 *
 * Va aparte del id interno (`COT-SOLPED-100-01`): el proveedor menciona este
 * número al responder, y un identificador con el número de la solicitud interna
 * adentro le dice cosas de Valar que no le incumben.
 */
export function siguienteNumeroSolicitud(existentes: { numero: string | null }[]) {
  const usados = existentes
    .map((c) => Number(/^SC-(\d+)$/.exec(c.numero ?? "")?.[1] ?? 0))
    .filter((n) => n > 0);

  const siguiente = (usados.length > 0 ? Math.max(...usados) : 0) + 1;
  return `SC-${String(siguiente).padStart(4, "0")}`;
}

/**
 * Manda una solicitud de cotización a UN proveedor, con SOLO los ítems que se
 * le quieren pedir a él.
 *
 * Esto es lo que faltaba para poder cotizar de verdad: una solicitud no se le
 * pide entera al mismo proveedor —el ferretero no vende EPP y el de EPP no
 * vende fierro—, así que pedirle a cada uno la lista completa obligaba a que
 * respondiera "no tengo" en la mitad, o peor, a mandar tres correos a mano por
 * fuera de la plataforma.
 *
 * NO HAY TABLA NUEVA: una cotización en estado 'solicitada' y sin `recibida_en`
 * ES la solicitud enviada, y sus ítems son lo que se le pidió a ese proveedor.
 * Cuando responda, sobre esa misma fila se cargan los precios, y la diferencia
 * entre las dos fechas es su tiempo de respuesta.
 *
 * La SOLPED pasa a "en cotización" sola: lo hace un trigger de la base
 * (`marcar_solped_en_cotizacion`), para que valga aunque la solicitud entre por
 * un script y no por esta pantalla.
 */
export async function pedirCotizacion({
  solped,
  proveedorId,
  numero,
  items,
  validezHasta = null,
  observaciones = null,
}: {
  solped: Solped;
  proveedorId: string;
  numero: string;
  /** Qué se le pide a este proveedor: ítem de la solicitud y cuánto. */
  items: { solpedItemId: string; cantidad: number }[];
  validezHasta?: string | null;
  observaciones?: string | null;
}) {
  if (items.length === 0) {
    throw new Error("Elige al menos un ítem para pedirle a este proveedor.");
  }

  const { count } = await supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("solped_id", solped.id);

  const id = siguienteIdCotizacion(solped.id, count ?? 0);

  const { error } = await supabase.from("cotizaciones").insert({
    id,
    numero,
    solped_id: solped.id,
    proveedor_id: proveedorId,
    solicitada_en: new Date().toISOString().slice(0, 10),
    // Sin respuesta todavía: es exactamente lo que la deja "esperando".
    recibida_en: null,
    validez_hasta: validezHasta,
    estado: "solicitada",
    observaciones,
  });

  if (error) {
    if (/duplicate key|already exists/i.test(error.message)) {
      throw new Error("Ya se le pidió cotización a este proveedor para esta solicitud.");
    }
    throw new Error(error.message);
  }

  let n = 0;
  for (const i of items) {
    n += 1;
    const { error: fallo } = await supabase.from("cotizacion_items").insert({
      id: `${id}-${String(n).padStart(3, "0")}`,
      cotizacion_id: id,
      solped_item_id: i.solpedItemId,
      cantidad: i.cantidad,
      // Nace sin precio: el proveedor todavía no responde.
      precio_unitario: 0,
      disponible: true,
    });
    if (fallo) throw new Error(fallo.message);
  }

  return id;
}

/**
 * Carga la respuesta del proveedor sobre una solicitud ya enviada.
 *
 * Es el otro lado de `pedirCotizacion`: la fila ya existe, lo que llega son los
 * precios. Se actualiza en vez de crear una nueva para que `solicitada_en` siga
 * siendo cuándo se pidió — de ahí sale el tiempo de respuesta, que es lo que
 * después dice qué proveedor contesta y cuál hace perder una semana.
 */
export async function cargarRespuesta({
  cotizacionId,
  recibidaEn,
  plazoEntregaDias,
  condicionPago,
  flete,
  descuento,
  precios,
  validezHasta = null,
}: {
  cotizacionId: string;
  recibidaEn: string;
  plazoEntregaDias: number | null;
  condicionPago: string | null;
  flete: number;
  descuento: number;
  /** Por ítem de la solicitud: precio unitario y si lo tiene. */
  precios: { solpedItemId: string; precioUnitario: number; disponible: boolean }[];
  validezHasta?: string | null;
}) {
  const { error } = await supabase
    .from("cotizaciones")
    .update({
      recibida_en: recibidaEn,
      plazo_entrega_dias: plazoEntregaDias,
      condicion_pago: condicionPago,
      flete,
      descuento,
      validez_hasta: validezHasta,
      estado: "recibida",
    })
    .eq("id", cotizacionId);

  if (error) throw new Error(error.message);

  for (const p of precios) {
    const { error: fallo } = await supabase
      .from("cotizacion_items")
      .update({
        precio_unitario: p.disponible ? p.precioUnitario : 0,
        disponible: p.disponible,
      })
      .eq("cotizacion_id", cotizacionId)
      .eq("solped_item_id", p.solpedItemId);

    if (fallo) throw new Error(fallo.message);
  }
}

/* ── Enviarle la solicitud al proveedor ───────────────────────────────────── */

/**
 * El correo que se le manda al proveedor, armado entero.
 *
 * EL DETALLE VA EN EL CUERPO Y NO SOLO EN EL PDF. Un `mailto:` no puede
 * adjuntar archivos, y un correo que dice "adjunto solicitud" sin adjunto no
 * sirve de nada. Con los ítems escritos en el texto, el proveedor puede cotizar
 * respondiendo el correo, sin abrir nada. El PDF queda para quien lo quiera
 * adjuntar además.
 *
 * Se arma acá y no en la pantalla porque el mismo texto va a servir el día que
 * el envío salga desde una casilla de la empresa: lo único que cambia entonces
 * es quién aprieta "enviar".
 */
export function armarCorreoSolicitud({
  numero,
  contrato,
  solicitante,
  fechaRequerida,
  contacto,
  items,
  observaciones,
}: {
  numero: string;
  contrato: string;
  solicitante: string;
  fechaRequerida: string | null;
  contacto: string | null;
  items: { linea: number; descripcion: string; unidad: string; cantidad: number }[];
  observaciones: string | null;
}) {
  const asunto = `Solicitud de cotización ${numero} · ${emisorSolicitud.razonSocial}`;

  const detalle = items
    .map(
      (i) =>
        `${String(i.linea).padStart(2, "0")}. ${i.descripcion} — ${i.cantidad} ${i.unidad}`,
    )
    .join("\n");

  const cuerpo = [
    contacto ? `Estimado/a ${contacto}:` : "Estimados:",
    "",
    "Agradeceremos cotizar los siguientes ítems:",
    "",
    detalle,
    "",
    `Contrato: ${contrato}`,
    `Solicita: ${solicitante}`,
    fechaRequerida ? `Se necesita en faena: ${formatearFecha(fechaRequerida)}` : null,
    observaciones ? `Observaciones: ${observaciones}` : null,
    "",
    `Al responder, por favor mencione el número ${numero}.`,
    "",
    "La cotización no constituye orden de compra: la compra se formaliza",
    `únicamente con una orden emitida por ${emisorSolicitud.razonSocial}.`,
    "",
    "Saludos,",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { asunto, cuerpo };
}


/**
 * Cuántos caracteres aguanta un `mailto:` antes de que el cliente lo corte.
 *
 * No hay un límite del estándar; el que manda es el más estrecho de la cadena,
 * y Outlook empieza a truncar cerca de los 2.000. Por debajo de eso el correo
 * llega entero; por encima conviene avisar antes de que el proveedor reciba una
 * lista cortada a la mitad y cotice de menos.
 */
export const TOPE_MAILTO = 1900;

/** El enlace que abre el cliente de correo con todo escrito. */
export function enlaceMailto(destinatario: string, asunto: string, cuerpo: string) {
  return `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(
    asunto,
  )}&body=${encodeURIComponent(cuerpo)}`;
}

/**
 * Deja constancia de que se mandó, y a qué correo.
 *
 * `enviada_en` es distinto de `solicitada_en`: entre crear la solicitud y
 * mandarla puede pasar un día, y ese rato no es demora del proveedor. El tiempo
 * de respuesta se cuenta desde acá.
 */
export async function registrarEnvio(cotizacionId: string, correo: string) {
  const { error } = await supabase
    .from("cotizaciones")
    .update({ enviada_en: new Date().toISOString(), enviada_a: correo })
    .eq("id", cotizacionId);

  if (error) throw new Error(error.message);
}

/**
 * Elige un proveedor.
 *
 * Deja una sola cotización seleccionada —las demás quedan descartadas— y exige
 * motivo: la base tiene una restricción que no deja seleccionar sin decir por
 * qué. Escribir "menor precio" cuesta un segundo y deja el criterio por escrito
 * incluso cuando la razón es obvia.
 */
export async function seleccionarCotizacion(
  solpedId: string,
  cotizacionId: string,
  motivo: string,
) {
  const limpio = motivo.trim();
  if (!limpio) throw new Error("Falta el motivo de la selección.");

  const otras = await supabase
    .from("cotizaciones")
    .update({ seleccionada: false, estado: "descartada" })
    .eq("solped_id", solpedId)
    .neq("id", cotizacionId);
  if (otras.error) throw new Error(otras.error.message);

  const elegida = await supabase
    .from("cotizaciones")
    .update({ seleccionada: true, estado: "seleccionada", motivo_seleccion: limpio })
    .eq("id", cotizacionId);
  if (elegida.error) throw new Error(elegida.error.message);

  // Con proveedor elegido, la solicitud queda lista para que se autorice la
  // compra: ese es el momento en que el monto pasa por el umbral.
  const solped = await supabase
    .from("solped")
    .update({ estado: "cotizada" })
    .eq("id", solpedId);
  if (solped.error) throw new Error(solped.error.message);
}

/**
 * Convierte la cotización elegida en una orden de compra.
 *
 * Copia los datos del proveedor dentro de la orden —razón social, RUT,
 * dirección, contacto— en vez de dejarlos apuntando al maestro: la OC es un
 * documento que se imprime y se manda, y tiene que seguir diciendo lo mismo
 * dentro de dos años aunque el proveedor se cambie de oficina.
 *
 * Cada ítem se crea apuntando a su ítem de la solicitud (`solped_item_id`), que
 * es lo que permite después saber cuánto de lo pedido ya se compró.
 */
export async function generarOrdenDesdeCotizacion({
  solped,
  cotizacion,
  proveedor,
  numero,
  emisor,
  soloItems,
  incluirFlete = true,
  proyecto = null,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  proveedor: Proveedor;
  numero: string;
  emisor: { nombre: string; correo: string };
  /**
   * Qué ítems de la solicitud entran en ESTA orden, por `solped_item_id`.
   *
   * Existe porque una solicitud no se le compra entera a un solo proveedor: el
   * acero conviene en uno y la pintura en otro, y esa es justamente la razón de
   * cotizar ítem por ítem. Sin esto, elegir un proveedor obligaba a comprarle
   * todo o a borrar líneas de la orden después, que es donde se pierde la
   * trazabilidad contra lo que se pidió.
   *
   * Vacío o sin definir = todos los cotizados con precio.
   */
  soloItems?: string[];
  /** El flete se cobra una vez. En una segunda orden del mismo proveedor, no. */
  incluirFlete?: boolean;
  /**
   * Lo que se imprime en la línea "Proyecto" de la orden.
   *
   * Por omisión es el nombre del contrato, porque el centro de costo ES el
   * contrato y preguntarlo era pedir que alguien volviera a escribir algo que
   * el sistema ya sabe. Solo se manda cuando la compra va contra un anexo
   * —una extensión o un adicional—, que es el único caso en que difiere.
   */
  proyecto?: string | null;
}) {
  const items = await cargarItemsDeCotizacion(cotizacion.id);
  const elegidos = soloItems && soloItems.length > 0 ? new Set(soloItems) : null;
  const cotizados = items.filter(
    (i) =>
      i.disponible &&
      i.precioUnitario > 0 &&
      (elegidos === null || elegidos.has(i.solpedItemId)),
  );

  if (cotizados.length === 0) {
    throw new Error("No hay ítems elegidos con precio para esta orden.");
  }

  const pedidos = await cargarItemsDeSolped(solped.id);
  const porId = new Map(pedidos.map((p) => [p.id, p]));

  const ordenId = `OCP-${solped.contratoId.replace(/^C-/, "")}-${numero.replace(/\D/g, "").slice(-6)}`;

  const cabecera = {
    id: ordenId,
    contrato_id: solped.contratoId,
    numero,
    solped_id: solped.id,
    cotizacion_id: cotizacion.id,
    proveedor_id: proveedor.id,
    proveedor: proveedor.razonSocial,
    rut_proveedor: proveedor.rut,
    direccion_proveedor: proveedor.direccion,
    ciudad_proveedor: proveedor.ciudad,
    comuna_proveedor: proveedor.comuna,
    contacto: proveedor.contacto,
    correo_contacto: proveedor.correoPago ?? proveedor.correo,
    telefono_contacto: proveedor.telefono,
    emisor_nombre: emisor.nombre,
    emisor_correo: emisor.correo,
    // El centro de costo es el contrato; solo se dice otra cosa cuando la
    // compra va contra un anexo.
    proyecto: proyecto ?? solped.contrato,
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_requerida: solped.fechaRequerida,
    condiciones_pago: condicionDeProveedor(proveedor),
    solicitado_por: solped.solicitanteNombre,
    estado: "borrador",
    observaciones: `Generada desde ${solped.numero}.`,
  };

  const { error: falloOrden } = await supabase
    .from("ordenes_compra_proveedor")
    .insert(cabecera);
  if (falloOrden) throw new Error(falloOrden.message);

  let n = 0;
  for (const i of cotizados) {
    n += 1;
    const pedido = porId.get(i.solpedItemId);
    const neto = Math.round(i.cantidad * i.precioUnitario);

    const { error } = await supabase.from("items_compra").insert({
      id: `IT-${ordenId}-${String(n).padStart(3, "0")}`,
      contrato_id: solped.contratoId,
      orden_id: ordenId,
      solped_item_id: i.solpedItemId,
      // Lo que se pidió del catálogo de Pagnol se compra con la misma referencia.
      pagnol_material_id: pedido?.pagnolMaterialId ?? null,
      categoria_id: pedido?.categoriaId ?? null,
      descripcion: pedido?.descripcion ?? "Ítem cotizado",
      unidad: pedido?.unidad ?? "un",
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
      iva: Math.round(neto * 0.19),
      // El tipo de gasto viene de la solicitud: es lo que decide si castiga el
      // margen, y no debería volver a decidirse acá.
      tipo: solped.tipoGasto,
    });
    if (error) throw new Error(error.message);
  }

  /* El flete viaja como una línea más de la orden.
   *
   * Si se quedara solo en la cotización, pasaría lo siguiente: se decide con el
   * costo puesto en obra —$354.100— y la orden queda por $329.100, así que esos
   * $25.000 no llegan nunca al costo del contrato y el margen del mes sale
   * inflado. Se decidió con un número y se contabilizó con otro.
   *
   * Va sin categoría a propósito: el flete no es de ninguna en particular, y la
   * pantalla ya avisa cuando un ítem no tiene categoría. */
  if (incluirFlete && cotizacion.flete > 0) {
    const { error } = await supabase.from("items_compra").insert({
      id: `IT-${ordenId}-FLETE`,
      contrato_id: solped.contratoId,
      orden_id: ordenId,
      descripcion: "Flete y despacho",
      unidad: "gl",
      cantidad: 1,
      precio_unitario: cotizacion.flete,
      iva: Math.round(cotizacion.flete * 0.19),
      tipo: solped.tipoGasto,
    });
    if (error) throw new Error(error.message);
  }

  await supabase.from("solped").update({ estado: "en-compra" }).eq("id", solped.id);

  return ordenId;
}
