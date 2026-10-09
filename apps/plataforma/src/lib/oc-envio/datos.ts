import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lo que el servidor necesita para mandarle una OC al proveedor.
 *
 * Se lee directo de las tablas y no con `lib/ordenes.ts`, que es del
 * navegador. Con el cliente de la PERSONA, el RLS decide qué orden alcanza;
 * con el de servicio (la página pública del proveedor), la orden sale del
 * envío, que ya dice de qué empresa es.
 */

export type OrdenParaEnviar = {
  empresaId: string;
  id: string;
  contratoId: string;
  numero: string;
  estado: string;
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
  fechaEmision: string;
  fechaRequerida: string | null;
  lugarEntrega: string | null;
  condicionesPago: string | null;
  solicitadoPor: string | null;
  retira: string | null;
  proyecto: string | null;
  observaciones: string | null;
  fechaComprometida: string | null;
  items: {
    descripcion: string;
    unidad: string;
    cantidad: number;
    precioUnitario: number;
    neto: number;
    iva: number;
    tipo: "ordinario" | "reembolsable";
  }[];
};

export async function cargarOrdenParaEnviar(
  sb: SupabaseClient,
  ordenId: string,
  empresaId?: string,
): Promise<OrdenParaEnviar | null> {
  let consulta = sb.from("ordenes_compra_proveedor").select("*").eq("id", ordenId);
  if (empresaId) consulta = consulta.eq("empresa_id", empresaId);
  const { data: o, error } = await consulta.maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) return null;

  const { data: items, error: e2 } = await sb
    .from("items_compra")
    .select("descripcion, unidad, cantidad, precio_unitario, neto, iva, tipo")
    .eq("empresa_id", o.empresa_id)
    .eq("orden_id", o.id)
    .order("id");
  if (e2) throw new Error(e2.message);

  return {
    empresaId: o.empresa_id,
    id: o.id,
    contratoId: o.contrato_id,
    numero: o.numero,
    estado: o.estado,
    proveedor: o.proveedor,
    rutProveedor: o.rut_proveedor,
    direccionProveedor: o.direccion_proveedor,
    ciudadProveedor: o.ciudad_proveedor,
    comunaProveedor: o.comuna_proveedor,
    contacto: o.contacto,
    correoContacto: o.correo_contacto,
    telefonoContacto: o.telefono_contacto,
    emisorNombre: o.emisor_nombre,
    emisorCorreo: o.emisor_correo,
    emisorTelefono: o.emisor_telefono,
    fechaEmision: o.fecha_emision,
    fechaRequerida: o.fecha_requerida,
    lugarEntrega: o.lugar_entrega,
    condicionesPago: o.condiciones_pago,
    solicitadoPor: o.solicitado_por,
    retira: o.retira,
    proyecto: o.proyecto,
    observaciones: o.observaciones,
    fechaComprometida: o.fecha_comprometida,
    items: (items ?? []).map((i) => ({
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precio_unitario),
      // `neto` puede venir nulo en filas viejas: se recalcula igual que la pantalla.
      neto: i.neto === null ? Math.round(Number(i.cantidad) * Number(i.precio_unitario)) : Number(i.neto),
      iva: Number(i.iva ?? 0),
      tipo: i.tipo,
    })),
  };
}

/* ── La sesión de quien envía ─────────────────────────────────────────────── */

export type Remitente = {
  sb: SupabaseClient;
  id: string;
  correo: string;
  nombre: string;
};

/**
 * La conexión con el token de la persona, si puede emitir órdenes. Las rutas
 * de `/api/` son públicas: sin esto cualquiera mandaría correos a nombre de
 * Valar.
 */
export async function remitenteDe(pedido: Request): Promise<Remitente | null> {
  const token = pedido.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: puede } = await sb.rpc("tiene_permiso", { clave: "ordenes.emitir" });
  if (puede !== true) return null;

  const { data: perfil } = await sb.from("perfiles").select("nombre").eq("id", data.user.id).maybeSingle();
  const correo = data.user.email ?? "";
  return { sb, id: data.user.id, correo, nombre: perfil?.nombre?.trim() || correo };
}

/* ── El enlace privado del proveedor ──────────────────────────────────────── */

/** 32 bytes al azar: el enlace. Lo que se guarda es su huella. */
export function nuevoEnlace() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: huellaDe(token) };
}

export const huellaDe = (token: string) => createHash("sha256").update(token).digest("hex");

/** Lo que llega en la URL tiene que tener la forma de un enlace nuestro. */
export const pareceEnlace = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export const DIAS_DEL_ENLACE = 90;

export const correoValido = (c: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(c);
