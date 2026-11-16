"use client";

import { supabase } from "../supabase";

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
  const { data, error } = await supabase.from("proveedores").select("id, rut, razon_social");
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as { id: string; rut: string | null; razon_social: string }[];
  const igual = rut ? filas.find((p) => p.rut === rut) : undefined;
  return {
    id: siguienteIdProveedor(filas as unknown as Proveedor[]),
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

