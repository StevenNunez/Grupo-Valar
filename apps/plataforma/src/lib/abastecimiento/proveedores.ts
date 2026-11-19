"use client";

import { supabase } from "../supabase";
import { traerTodo } from "../paginar";
import { empresaActual } from "../sesion";

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

/**
 * Los proveedores de la empresa en la que se trabaja.
 *
 * El filtro es obligatorio aunque el RLS ya recorte: el rol `soporte` ve TODAS
 * las empresas, y los códigos se repiten entre ellas (PRV-0002 es Max Service en
 * Valar y Ferretería del Loa en el demo). Sin esto, elegir Max Service en una OC
 * copiaba la ficha del demo, y volver a elegirlo no la cambiaba (19-11-2026).
 */
export async function cargarProveedores(): Promise<Proveedor[]> {
  const empresa = await empresaActual();
  // De a tandas: PostgREST corta en 1000 sin avisar, y los selectores necesitan a todos.
  const filas = await traerTodo<FilaProveedor>((desde, hasta) => {
    let consulta = supabase.from("proveedores").select("*");
    if (empresa) consulta = consulta.eq("empresa_id", empresa);
    return consulta.order("razon_social").order("id").range(desde, hasta);
  });
  return filas.map(mapearProveedor);
}

/* ── La pantalla de Proveedores: por partes, buscando en la base ─────────── */

export type FiltradoProveedores = "todos" | "activos" | "por_completar" | "inactivos" | "incompletos";

export type OrdenProveedores = "nombre-asc" | "nombre-desc" | "recientes" | "codigo";

export type FiltrosProveedores = {
  estado: FiltradoProveedores;
  /** Un rubro exacto, o vacío. */
  rubro: string;
  texto: string;
  orden: OrdenProveedores;
};

/** Saca lo que rompería la sintaxis de `.or()` de PostgREST. */
const limpiar = (t: string) => t.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();

/** Dónde se busca cada palabra: nombre, fantasía, RUT, código, contacto, correo, giro. */
function dondeBuscar(palabra: string) {
  const campos = ["razon_social", "nombre_fantasia", "rut", "id", "contacto", "correo", "giro"].map(
    (c) => `${c}.ilike.*${palabra}*`,
  );
  // "76.756.768-5" o "76756768": el RUT se guarda sin puntos.
  const comoRut = palabra.replace(/\./g, "");
  if (comoRut !== palabra && comoRut) campos.push(`rut.ilike.*${comoRut}*`);
  return campos.join(",");
}

export async function cargarPaginaProveedores(
  f: FiltrosProveedores,
  desde: number,
  cuantos: number,
): Promise<Proveedor[]> {
  const empresa = await empresaActual();
  let q = supabase.from("proveedores").select("*");
  if (empresa) q = q.eq("empresa_id", empresa);

  if (f.estado === "activos") q = q.eq("estado", "activo");
  else if (f.estado === "por_completar") q = q.eq("estado", "por_completar");
  else if (f.estado === "inactivos") q = q.in("estado", ["inactivo", "suspendido"]);
  // Lo mismo que `faltantes()` en la pantalla: sin RUT, sin correo, sin contacto o sin cuenta.
  else if (f.estado === "incompletos") {
    // `.eq.` vacío = texto en blanco, que para la pantalla también es «falta».
    q = q.or(
      "rut.is.null,rut.eq.,correo.is.null,correo.eq.,numero_cuenta.is.null,numero_cuenta.eq.," +
        "and(or(telefono.is.null,telefono.eq.),or(contacto.is.null,contacto.eq.))",
    );
  }

  if (f.rubro) q = q.contains("rubros", [f.rubro]);

  // Palabra por palabra, como el buscador del formulario: "max 76" encuentra a Max Service por nombre y RUT.
  const palabras = limpiar(f.texto).split(" ").filter(Boolean);
  if (palabras.length === 1) q = q.or(dondeBuscar(palabras[0]));
  else if (palabras.length > 1) q = q.or(`and(${palabras.map((p) => `or(${dondeBuscar(p)})`).join(",")})`);

  switch (f.orden) {
    case "nombre-desc": q = q.order("razon_social", { ascending: false }); break;
    case "recientes": q = q.order("creado_en", { ascending: false }); break;
    case "codigo": q = q.order("id", { ascending: true }); break;
    default: q = q.order("razon_social", { ascending: true });
  }
  const { data, error } = await q.order("id").range(desde, desde + cuantos - 1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaProveedor[]).map(mapearProveedor);
}

export type ResumenProveedores = {
  total: number;
  activos: number;
  incompletos: number;
  conRut: number;
  conCuenta: number;
  /** Los rubros en uso, para el filtro. */
  rubros: string[];
  /** Solo los códigos, para proponer el siguiente al crear uno. */
  ids: { id: string }[];
};

/** Las cifras de arriba, sobre todos los proveedores y con pocas columnas. */
export async function cargarResumenProveedores(): Promise<ResumenProveedores> {
  const empresa = await empresaActual();
  type Fila = Pick<FilaProveedor, "id" | "rut" | "correo" | "telefono" | "contacto" | "numero_cuenta" | "rubros" | "estado">;
  const filas = await traerTodo<Fila>((desde, hasta) => {
    let consulta = supabase
      .from("proveedores")
      .select("id, rut, correo, telefono, contacto, numero_cuenta, rubros, estado");
    if (empresa) consulta = consulta.eq("empresa_id", empresa);
    return consulta.order("id").range(desde, hasta);
  });
  const rubros = new Set<string>();
  for (const f of filas) for (const r of f.rubros ?? []) if (r.trim()) rubros.add(r.trim());
  return {
    total: filas.length,
    activos: filas.filter((f) => f.estado === "activo").length,
    incompletos: filas.filter((f) => !f.rut || !f.correo || !f.numero_cuenta || (!f.telefono && !f.contacto)).length,
    conRut: filas.filter((f) => f.rut).length,
    conCuenta: filas.filter((f) => f.numero_cuenta).length,
    rubros: [...rubros].sort((a, b) => a.localeCompare(b, "es")),
    ids: filas.map((f) => ({ id: f.id })),
  };
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
export function siguienteIdProveedor(proveedores: { id: string }[]) {
  const numeros = proveedores
    .map((p) => Number(/^PRV-(\d+)$/.exec(p.id)?.[1] ?? 0))
    .filter((n) => n > 0);
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1;
  return `PRV-${String(siguiente).padStart(4, "0")}`;
}

/**
 * Lo que se necesita saber JUSTO antes de crear un proveedor, preguntado a la
 * base y no a la lista que la pantalla cargó al abrirse: el código que le toca
 * y si ese RUT ya está. Con la lista vieja, dos altas seguidas proponían el
 * mismo código y la segunda chocaba con "ya existe un registro con ese código".
 */
export async function antesDeCrearProveedor(rut: string | null): Promise<{
  id: string;
  mismoRut: { id: string; razonSocial: string } | null;
}> {
  const empresa = await empresaActual();
  let consulta = supabase.from("proveedores").select("id, rut, razon_social");
  if (empresa) consulta = consulta.eq("empresa_id", empresa);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as { id: string; rut: string | null; razon_social: string }[];
  const igual = rut ? filas.find((p) => p.rut === rut) : undefined;
  return {
    id: siguienteIdProveedor(filas),
    mismoRut: igual ? { id: igual.id, razonSocial: igual.razon_social } : null,
  };
}

export function opcionesDeProveedor(proveedores: Proveedor[]) {
  return proveedores
    .filter((p) => p.estado === "activo" || p.estado === "por_completar")
    .map((p) => ({
      id: p.id,
      titulo: p.rut ? `${p.razonSocial} · ${formatearRut(p.rut)}` : p.razonSocial,
    }));
}

