import type { ContratoBreve } from "@/lib/contratos";
import { emisorOC } from "@/lib/empresa";
import type { EstadoOrden, Orden } from "@/lib/ordenes";
import type { FilaPegada } from "@/lib/pegado";
import type { Usuario } from "@/lib/sesion";

export const hoy = () => new Date().toISOString().slice(0, 10);

export type BorradorOrden = {
  id: string;
  contrato_id: string;
  numero: string;
  proyecto: string;
  /** Contra qué anexo se compra (0059); vacío = contrato base. */
  anexo_id: string;
  proveedor_id: string;
  proveedor: string;
  rut_proveedor: string;
  direccion_proveedor: string;
  ciudad_proveedor: string;
  comuna_proveedor: string;
  contacto: string;
  correo_contacto: string;
  telefono_contacto: string;
  emisor_nombre: string;
  emisor_correo: string;
  emisor_telefono: string;
  fecha_emision: string;
  fecha_requerida: string;
  lugar_entrega: string;
  condiciones_pago: string;
  solicitado_por: string;
  retira: string;
  estado: EstadoOrden;
  observaciones: string;
};

/** Línea en edición. Vive en memoria hasta que se guarda la orden. */
export type Linea = {
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  /** Precio unitario cotizado en UF (solo si la orden es en UF). */
  precio_uf: number;
  tipo: "ordinario" | "reembolsable";
  categoria_id: string;
  /** El material en Pagnol, si se eligió de su catálogo. Solo la referencia. */
  pagnol_material_id: string;
  /** Su código, para mostrarlo bajo la descripción mientras se edita. */
  pagnol_codigo: string;
  /** Los que ya existen en la base se actualizan; los nuevos se insertan. */
  nuevo: boolean;
};

/* ── Lo que se estaba armando ─────────────────────────────────────────────────
   Una OC nueva se guarda en el navegador mientras se escribe. Si el diálogo se
   cierra sin guardar —un clic de más, la pestaña que se cae—, al volver a abrir
   "Nueva orden" se ofrece recuperarla. Se borra al crear la orden. */

export type Guardado = { datos: BorradorOrden; lineas: Linea[]; cuando: string; enUf?: boolean; valorUf?: number };

export function leerGuardado(clave: string | null): Guardado | null {
  if (!clave) return null;
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as Guardado) : null;
  } catch {
    return null;
  }
}

export function olvidarGuardado(clave: string | null) {
  if (!clave) return;
  try {
    localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Vale la pena guardarla si ya tiene proveedor o algún ítem escrito. */
export const tieneAlgo = (d: BorradorOrden, lineas: Linea[]) =>
  !!d.proveedor_id || lineas.some((l) => l.descripcion.trim() || l.precio_unitario > 0 || l.precio_uf > 0);

export function borradorDe(
  orden: Orden | null,
  contratos: ContratoBreve[],
  usuario: Usuario,
): BorradorOrden {
  if (!orden) {
    return {
      id: "",
      contrato_id: contratos[0]?.id ?? "",
      numero: "",
      proyecto: "",
      anexo_id: "",
      proveedor_id: "",
      proveedor: "",
      rut_proveedor: "",
      direccion_proveedor: "",
      ciudad_proveedor: "",
      comuna_proveedor: "",
      contacto: "",
      correo_contacto: "",
      telefono_contacto: "",
      // Quien emite es quien tiene la sesión abierta: crear una OC ya exige el
      // permiso, así que no hay nada que elegir. Solo el teléfono se escribe.
      emisor_nombre: usuario.nombre,
      emisor_correo: usuario.correo,
      emisor_telefono: "",
      fecha_emision: hoy(),
      fecha_requerida: "",
      lugar_entrega: "",
      condiciones_pago: emisorOC.condicionesPagoPorDefecto,
      solicitado_por: "",
      retira: "",
      estado: "borrador",
      observaciones: "",
    };
  }
  return {
    id: orden.id,
    contrato_id: orden.contratoId,
    numero: orden.numero,
    proyecto: orden.proyecto ?? "",
    anexo_id: orden.anexoId ?? "",
    proveedor_id: orden.proveedorId ?? "",
    proveedor: orden.proveedor,
    rut_proveedor: orden.rutProveedor ?? "",
    direccion_proveedor: orden.direccionProveedor ?? "",
    ciudad_proveedor: orden.ciudadProveedor ?? "",
    comuna_proveedor: orden.comunaProveedor ?? "",
    contacto: orden.contacto ?? "",
    correo_contacto: orden.correoContacto ?? "",
    telefono_contacto: orden.telefonoContacto ?? "",
    // Una orden ya emitida conserva a quien la emitió. Las anteriores a este
    // campo, que lo tienen vacío, lo toman de quien la está corrigiendo.
    emisor_nombre: orden.emisorNombre || usuario.nombre,
    emisor_correo: orden.emisorNombre ? orden.emisorCorreo ?? "" : usuario.correo,
    emisor_telefono: orden.emisorTelefono ?? "",
    fecha_emision: orden.fechaEmision,
    fecha_requerida: orden.fechaRequerida ?? "",
    lugar_entrega: orden.lugarEntrega ?? "",
    condiciones_pago: orden.condicionesPago ?? "",
    solicitado_por: orden.solicitadoPor ?? "",
    retira: orden.retira ?? "",
    estado: orden.estado,
    observaciones: orden.observaciones ?? "",
  };
}

export function lineaVacia(n: number): Linea {
  return {
    id: `nueva-${n}-${Date.now()}`,
    descripcion: "",
    unidad: "UN",
    cantidad: 1,
    precio_unitario: 0,
    precio_uf: 0,
    tipo: "ordinario",
    categoria_id: "",
    pagnol_material_id: "",
    pagnol_codigo: "",
    nuevo: true,
  };
}

export function lineaPegada(fila: FilaPegada, n: number): Linea {
  return {
    ...lineaVacia(n),
    descripcion: fila.descripcion,
    unidad: fila.unidad,
    cantidad: fila.cantidad,
    precio_unitario: fila.precioUnitario,
  };
}

/** Los estados que se ponen a mano. El resto lo dicen las líneas. */
export const estadoManual = (e: EstadoOrden) => e === "borrador" || e === "emitida" || e === "anulada";

export const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20";
