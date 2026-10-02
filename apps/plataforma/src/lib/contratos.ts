"use client";

import { supabase } from "./supabase";
import type { PlantillaEdp } from "./plantillas-edp";
import type {
  Contrato,
  EstadoContrato,
  FormaContrato,
  Modalidad,
  Vigencia,
} from "./control-de-gestion";

/**
 * Contratos: la columna vertebral del módulo. Todo lo demás —estados de pago,
 * facturas, compras, personal— cuelga de un contrato, así que este es el
 * primer dato que hay que cargar.
 */

export const estadosContrato: { id: EstadoContrato; titulo: string }[] = [
  { id: "en-plazo", titulo: "En plazo" },
  { id: "en-riesgo", titulo: "En riesgo" },
  { id: "atrasado", titulo: "Atrasado" },
  { id: "cerrado", titulo: "Cerrado" },
];

/** Lo mínimo para llenar un selector de contrato en los formularios. */
export type ContratoBreve = {
  id: string;
  nombre: string;
  cliente: string;
  plantillaEdp: PlantillaEdp;
};

export async function cargarContratosBreve(): Promise<ContratoBreve[]> {
  const { data, error } = await supabase
    .from("contratos")
    .select("id, nombre, cliente, plantilla_edp")
    .order("id");

  if (error) throw new Error(error.message);
  return (data ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    cliente: fila.cliente,
    plantillaEdp: fila.plantilla_edp as PlantillaEdp,
  }));
}

export type ResumenBorradoContratoDemo = {
  total: number;
  adjuntos: number;
  eliminado: boolean;
  estados_pago: number;
  facturas: number;
  ordenes_compra: number;
  compras: number;
  servicios: number;
  costos_personal: number;
  items_compra: number;
  ordenes_compra_proveedor: number;
  solped: number;
  solped_items: number;
  cotizaciones: number;
  cotizacion_items: number;
  aprobaciones: number;
  campos_contrato: number;
  anexos: number;
  categorias_costo: number;
};

/** La base comprueba empresa y permiso; p_eliminar=false solo muestra el alcance. */
export async function borrarContratoDemo(id: string, eliminar = false): Promise<ResumenBorradoContratoDemo> {
  const { data, error } = await supabase.rpc("borrar_contrato_demo", {
    p_contrato_id: id,
    p_eliminar: eliminar,
  });
  if (error) throw new Error(error.message);
  return data as ResumenBorradoContratoDemo;
}

/** Opciones listas para `CampoSeleccion`. */
export function opcionesDeContrato(contratos: ContratoBreve[]) {
  return contratos.map((c) => ({
    id: c.id,
    titulo: `${c.id} · ${c.nombre}`,
  }));
}

/**
 * Contratos con su costo real deducido y su vigencia.
 *
 * Lee `contratos_detalle`, que monta sobre `contratos_resumen` y le suma lo que
 * mueven los anexos: un contrato muta, y el monto que rige hoy no es el que
 * se firmó.
 */
export async function cargarContratos(): Promise<Contrato[]> {
  const [detalle, configuracion] = await Promise.all([
    supabase.from("contratos_detalle").select("*").order("termino"),
    supabase.from("contratos").select("id, plantilla_edp"),
  ]);

  const error = detalle.error ?? configuracion.error;
  if (error) throw new Error(error.message);
  const plantillas = new Map((configuracion.data ?? []).map((fila) => [fila.id, fila.plantilla_edp as PlantillaEdp]));

  type Fila = {
    id: string; nombre: string; cliente: string; faena: string;
    avance: number; presupuesto: number; costo_real: number;
    costo_compras: number; costo_servicios: number;
    costo_reembolsable: number; costo_personal: number;
    facturado: number; estado: EstadoContrato; termino: string;
    modalidad: Modalidad;
    tipo: FormaContrato;
    inicio: string | null;
    vigencia: Vigencia;
    dias_restantes: number;
    dias_plazo_total: number | null;
    anexos: number; monto_anexos: number; dias_anexos: number;
    monto_vigente: number | null; termino_vigente: string;
  };

  return ((detalle.data ?? []) as Fila[]).map((c) => ({
    id: c.id,
    plantillaEdp: plantillas.get(c.id) ?? "general",
    nombre: c.nombre,
    cliente: c.cliente,
    faena: c.faena,
    avance: c.avance,
    presupuesto: c.presupuesto,
    costoReal: c.costo_real,
    costoCompras: c.costo_compras,
    costoServicios: c.costo_servicios,
    costoReembolsable: c.costo_reembolsable,
    costoPersonal: c.costo_personal,
    facturado: c.facturado,
    estado: c.estado,
    termino: c.termino,
    modalidad: c.modalidad,
    forma: c.tipo,
    inicio: c.inicio ?? null,
    vigencia: c.vigencia,
    diasRestantes: Number(c.dias_restantes ?? 0),
    diasPlazoTotal: c.dias_plazo_total === null ? null : Number(c.dias_plazo_total),
    anexos: Number(c.anexos ?? 0),
    montoAnexos: Number(c.monto_anexos ?? 0),
    diasAnexos: Number(c.dias_anexos ?? 0),
    montoVigente: c.monto_vigente === null ? null : Number(c.monto_vigente),
    terminoVigente: c.termino_vigente ?? c.termino,
  }));
}
