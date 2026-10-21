import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { esRastreable, mandar, resumir, type Envio } from "./recepcion";
import type { EnvioDeCompra, ResumenEnvio } from "./tipos";

/**
 * Las compras directas y los egresos de Oficina Central frente a Pagnol
 * (0090, 0091).
 *
 * Una compra sin OC es mercadería que ya llegó, así que se informa igual que una
 * recepción: una herramienta o equipo (rastreable) entra como un activo POR
 * UNIDAD; un consumible (guantes, cemento), como ingreso de stock. Oficina
 * Central funciona igual, con su propio pañol en Pagnol.
 *
 * Se informa en un paso aparte y no por línea del documento: al guardar una
 * compra la base reemplaza todas sus líneas, y colgar el envío de cada una
 * duplicaría stock y activos con cada edición. Acá cada envío tiene su propia
 * referencia —`valar:compra:<id>:linea:<n>`— que se numera hacia adelante y no
 * se reutiliza, y Pagnol no duplica una referencia que ya conoce.
 *
 * Nada se manda sin quedar antes en `pagnol_envios`; si algo falla, la fila
 * queda en error y el reintento usa la misma `Idempotency-Key`.
 */

/**
 * De dónde sale lo que se informa: una compra directa de un contrato, o un
 * egreso de Oficina Central (que no es de ningún contrato).
 */
export type Origen = { tipo: "compra" | "oficina"; id: string };

const columna = (o: Origen) => (o.tipo === "compra" ? "compra_id" : "egreso_oficina_id");
const refDe = (o: Origen, n: number) => `valar:${o.tipo}:${o.id}:linea:${n}`;

export type LineaPorInformar = {
  material_id: string;
  cantidad: number;
  /** Neto por unidad: es el `valor_compra` del activo. */
  valor_unitario?: number | null;
  /** Lo que decía el documento, para reconocerla en la lista. */
  descripcion?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EnvioCompra = Envio & { panol_id: string | null; valor_unitario: number | null; fecha: string | null; descripcion: string | null; deshace_id: string | null };

const COLUMNAS =
  "id, tipo, item_id, unidad, material_id, cantidad, external_ref, idempotency_key, estado, pagnol_id, error, intentos, panol_id, valor_unitario, fecha, descripcion, deshace_id";

async function enviosDe(sb: SupabaseClient, origen: Origen): Promise<EnvioCompra[]> {
  const { data, error } = await sb.from("pagnol_envios").select(COLUMNAS).eq(columna(origen), origen.id).order("external_ref");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EnvioCompra[];
}

type Documento = { id: string; contrato_id: string | null; fecha: string; proveedor_id: string | null; orden_id: string | null };

async function leerDocumento(sb: SupabaseClient, origen: Origen): Promise<Documento | null> {
  if (origen.tipo === "oficina") {
    // Sin contrato ni maestro de proveedores: el proveedor es solo texto.
    const { data, error } = await sb.from("egresos_oficina_central").select("id, fecha").eq("id", origen.id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: String(data.id), contrato_id: null, fecha: String(data.fecha), proveedor_id: null, orden_id: null } : null;
  }
  const { data, error } = await sb
    .from("compras")
    .select("id, contrato_id, fecha, proveedor_id, orden_id")
    .eq("id", origen.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Documento | null;
}

async function proveedorEnPagnol(sb: SupabaseClient, proveedorId: string | null): Promise<string | null> {
  if (!proveedorId) return null;
  const { data } = await sb.from("proveedores").select("pagnol_proveedor_id").eq("id", proveedorId).maybeSingle();
  return (data?.pagnol_proveedor_id as string | null) ?? null;
}

/** Manda lo que quedó pendiente o con error (activos e ingresos, no deshacer). */
async function mandarPendientes(sb: SupabaseClient, doc: { fecha: string; proveedor_id: string | null }, origen: Origen) {
  const proveedorId = await proveedorEnPagnol(sb, doc.proveedor_id);
  for (const e of await enviosDe(sb, origen)) {
    if (e.estado === "enviado" || (e.tipo !== "activo" && e.tipo !== "ingreso")) continue;
    await mandar(sb, e, {
      panolId: e.panol_id,
      fecha: e.fecha ?? doc.fecha,
      proveedorId,
      valor: e.valor_unitario === null ? null : Number(e.valor_unitario),
    });
  }
}

/** Lo informado, con su estado, para mostrarlo en el formulario. */
export async function estadoDeCompra(sb: SupabaseClient, origen: Origen): Promise<EnvioDeCompra[]> {
  const todos = await enviosDe(sb, origen);
  const deshechos = new Set(todos.filter((e) => (e.tipo === "baja" || e.tipo === "reverso") && e.estado === "enviado").map((e) => e.deshace_id));
  return todos
    .filter((e) => e.tipo === "activo" || e.tipo === "ingreso")
    .map((e) => ({
      id: e.id,
      tipo: e.tipo as "activo" | "ingreso",
      descripcion: e.descripcion,
      unidad: e.unidad,
      cantidad: e.cantidad === null ? null : Number(e.cantidad),
      estado: e.estado,
      error: e.error,
      deshecho: deshechos.has(e.id),
    }));
}

/**
 * Informa líneas nuevas a Pagnol y reintenta lo que haya quedado con error.
 * Sin líneas, solo reintenta. Se puede llamar las veces que haga falta.
 */
export async function informarCompra(
  sb: SupabaseClient,
  origen: Origen,
  panolId: string | null,
  lineas: LineaPorInformar[],
): Promise<ResumenEnvio> {
  const doc = await leerDocumento(sb, origen);
  if (!doc) throw new Error("No se encontró el documento, o tu acceso no lo alcanza.");
  if (doc.orden_id) throw new Error("Esta factura viene de una orden de compra: se informa al recibir la orden.");
  if (panolId !== null && !UUID.test(panolId)) throw new Error("Pañol no válido.");

  const avisos: string[] = [];
  const nuevas: Record<string, unknown>[] = [];

  if (lineas.length > 0) {
    const previas = await enviosDe(sb, origen);
    let n = Math.max(0, ...previas.map((e) => Number(/:linea:(\d+)/.exec(e.external_ref)?.[1] ?? 0)));

    for (const linea of lineas) {
      const nombre = linea.descripcion?.trim() || "Línea";
      if (!UUID.test(linea.material_id)) { avisos.push(`${nombre}: elige un material de Pagnol.`); continue; }
      const cantidad = Number(linea.cantidad);
      if (!(cantidad > 0)) { avisos.push(`${nombre}: la cantidad debe ser mayor que cero.`); continue; }
      const tipo = await esRastreable(linea.material_id);
      if (!tipo.ok) { avisos.push(`${nombre}: ${tipo.error}`); continue; }
      if (tipo.rastreable && !Number.isInteger(cantidad)) {
        avisos.push(`${nombre}: es rastreable y la cantidad tiene decimales (${cantidad}); cada unidad es un activo.`);
        continue;
      }

      n += 1;
      const base = refDe(origen, n);
      const comun = {
        contrato_id: doc.contrato_id,
        [columna(origen)]: origen.id,
        material_id: linea.material_id,
        panol_id: panolId,
        valor_unitario: linea.valor_unitario ?? null,
        fecha: doc.fecha,
        descripcion: linea.descripcion?.trim() || tipo.nombre,
      };
      if (tipo.rastreable) {
        for (let u = 1; u <= cantidad; u++) nuevas.push({ ...comun, tipo: "activo", unidad: u, cantidad: 1, external_ref: `${base}:unidad:${u}` });
      } else {
        nuevas.push({ ...comun, tipo: "ingreso", cantidad, external_ref: base });
      }
    }

    if (nuevas.length > 0) {
      const { error } = await sb.from("pagnol_envios").upsert(nuevas, { onConflict: "empresa_id,external_ref", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  }

  await mandarPendientes(sb, doc, origen);
  const resultado = await enviosDe(sb, origen);
  return resumir(resultado.filter((e) => e.tipo === "activo" || e.tipo === "ingreso"), avisos);
}

/**
 * Deshace en Pagnol todo lo informado: reverso del stock y baja de los activos.
 * No borra el documento; quien lo borra lo hace después, y solo si esto salió
 * bien. Si Pagnol responde que esas unidades ya se entregaron o movieron (409),
 * no se deshace: hay que ajustarlo en Pagnol primero.
 */
export async function deshacerCompraEnPagnol(sb: SupabaseClient, origen: Origen): Promise<{ ok: true } | { ok: false; error: string }> {
  const doc = await leerDocumento(sb, origen);
  if (!doc) return { ok: true }; // sin documento no hay nada que deshacer

  // Lo que quedó a medias se termina de mandar, para saber si llegó a Pagnol.
  await mandarPendientes(sb, doc, origen);
  const previos = await enviosDe(sb, origen);
  if (previos.some((e) => (e.tipo === "activo" || e.tipo === "ingreso") && e.estado !== "enviado")) {
    return { ok: false, error: "Hay envíos a Pagnol con error. Reintenta el envío antes de deshacerlo." };
  }

  const yaDeshechos = new Set(previos.filter((e) => (e.tipo === "baja" || e.tipo === "reverso") && e.estado === "enviado").map((e) => e.deshace_id));
  const enviados = previos.filter((e) => (e.tipo === "activo" || e.tipo === "ingreso") && e.estado === "enviado" && !yaDeshechos.has(e.id));

  const deshacer = enviados.map((e) => {
    const sufijo = e.tipo === "activo" ? "baja" : "reverso";
    return {
      contrato_id: doc.contrato_id,
      [columna(origen)]: origen.id,
      tipo: sufijo,
      unidad: e.unidad,
      material_id: e.material_id,
      cantidad: e.cantidad,
      external_ref: `${e.external_ref}:${sufijo}`,
      deshace_id: e.id,
      descripcion: e.descripcion,
    };
  });
  if (deshacer.length > 0) {
    const { error } = await sb.from("pagnol_envios").upsert(deshacer, { onConflict: "empresa_id,external_ref", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }

  const porRef = new Map(enviados.map((e) => [e.external_ref, e]));
  const fallos: string[] = [];
  for (const e of await enviosDe(sb, origen)) {
    if ((e.tipo !== "reverso" && e.tipo !== "baja") || e.estado === "enviado") continue;
    const original = porRef.get(e.external_ref.replace(/:(baja|reverso)$/, ""));
    const bien = await mandar(sb, e, { panolId: null, fecha: doc.fecha, proveedorId: null, valor: null, deshacerRef: original?.external_ref, deshacerId: original?.pagnol_id });
    if (!bien) fallos.push(e.external_ref);
  }
  if (fallos.length > 0) {
    const detalle = (await enviosDe(sb, origen)).find((e) => fallos.includes(e.external_ref));
    return { ok: false, error: `Pagnol no aceptó deshacerlo${detalle ? `: ${detalle.error ?? ""}` : ""}. Si ya se entregaron esas unidades, ajústalo en Pagnol.` };
  }
  return { ok: true };
}
