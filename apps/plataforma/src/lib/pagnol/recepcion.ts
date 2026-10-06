import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clientePagnol, clientePagnolEscritura, PagnolNoConfigurado } from "./client";
import type { PanolPagnol, ResumenEnvio } from "./tipos";

/**
 * La Fase 2 del contrato con Pagnol: lo que llega a Valar se informa a Pagnol.
 *
 *   línea rastreable (herramienta, equipo) → POST /activos, una vez POR UNIDAD
 *   línea consumible (guantes, cemento)     → POST /movimientos {tipo: "ingreso"}
 *   anular la recepción                     → reverso del ingreso, baja del activo
 *
 * Cada envío se registra en `pagnol_envios` ANTES de mandarlo, con su
 * `external_ref` (Pagnol no duplica una ref) y su `Idempotency-Key`. Si algo
 * falla, la fila queda en error y el reintento usa la misma llave: no hay
 * forma de crear dos veces la misma unidad.
 *
 * `sb` es la conexión de Supabase con el token de la persona: lo que se lee y
 * escribe en Valar pasa por sus políticas, igual que desde la pantalla.
 */

type Envio = {
  id: string;
  tipo: "activo" | "ingreso" | "reverso" | "baja";
  item_id: string | null;
  unidad: number | null;
  material_id: string | null;
  cantidad: number | null;
  external_ref: string;
  idempotency_key: string;
  estado: "pendiente" | "enviado" | "error";
  pagnol_id: string | null;
  error: string | null;
  intentos: number;
};

const refRecepcion = (recepcionId: string, itemId: string) => `valar:recepcion:${recepcionId}:item:${itemId}`;

/** El mensaje de Pagnol si lo hay; si no, uno según el código. */
function mensajeEscritura(estado: number | null, cuerpo?: unknown, e?: unknown): string {
  if (e instanceof PagnolNoConfigurado) return "La conexión con Pagnol no está configurada en el servidor.";
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) return "Pagnol no respondió a tiempo.";
  const propio = (cuerpo as { error?: { message?: string } } | undefined)?.error?.message;
  if (estado === 403) return "La llave de Pagnol no tiene permiso de escritura (activos:write / stock:write).";
  if (estado === 401) return "Pagnol rechazó la llave de acceso.";
  if (estado === 429) return "Demasiadas llamadas seguidas a Pagnol. Reintenta en unos segundos.";
  if (propio) return propio;
  if (estado === null) return "No se pudo conectar con Pagnol.";
  return `Pagnol respondió con un error (${estado}).`;
}

/** ¿Es rastreable? Sale del catálogo de Pagnol, con caché. */
async function esRastreable(materialId: string): Promise<{ ok: true; rastreable: boolean; nombre: string } | { ok: false; error: string }> {
  try {
    const { data, error, response } = await clientePagnol("pagnol:materiales").GET("/materiales/{id}", {
      params: { path: { id: materialId } },
    });
    if (error || !data) return { ok: false, error: mensajeEscritura(response.status, error) };
    return { ok: true, rastreable: data.rastreable, nombre: data.nombre };
  } catch (e) {
    return { ok: false, error: mensajeEscritura(null, undefined, e) };
  }
}

/** Manda un envío ya registrado y deja la fila con el resultado. */
async function mandar(sb: SupabaseClient, e: Envio, contexto: { panolId: string | null; fecha: string; proveedorId: string | null; valor: number | null; deshacerRef?: string; deshacerId?: string | null }) {
  const pagnol = clientePagnolEscritura;
  let estado: number | null = null;
  let cuerpo: unknown;
  let pagnolId: string | null = null;
  try {
    const cabeceras = { "Idempotency-Key": e.idempotency_key };
    if (e.tipo === "activo") {
      const r = await pagnol().POST("/activos", {
        params: { header: cabeceras },
        body: {
          material_id: e.material_id!,
          external_ref: e.external_ref,
          panol_id: contexto.panolId,
          proveedor_id: contexto.proveedorId,
          valor_compra: contexto.valor,
          fecha_compra: contexto.fecha,
        },
      });
      estado = r.response.status;
      cuerpo = r.error;
      pagnolId = r.data?.id ?? null;
    } else if (e.tipo === "ingreso") {
      const r = await pagnol().POST("/movimientos", {
        params: { header: cabeceras },
        body: {
          tipo: "ingreso",
          material_id: e.material_id!,
          cantidad: Number(e.cantidad),
          external_ref: e.external_ref,
          panol_id: contexto.panolId,
          fecha: contexto.fecha,
        },
      });
      estado = r.response.status;
      cuerpo = r.error;
      pagnolId = r.data?.id ?? null;
    } else if (e.tipo === "reverso") {
      const r = await pagnol().POST("/movimientos", {
        params: { header: cabeceras },
        body: { tipo: "reverso", external_ref: contexto.deshacerRef! },
      });
      estado = r.response.status;
      cuerpo = r.error;
      pagnolId = r.data?.id ?? null;
    } else {
      const r = await pagnol().PATCH("/activos/{id}", {
        params: { header: cabeceras, path: { id: contexto.deshacerId! } },
        body: { estado: "de_baja" },
      });
      estado = r.response.status;
      cuerpo = r.error;
      pagnolId = r.data?.id ?? contexto.deshacerId ?? null;
    }
  } catch (err) {
    cuerpo = err;
    await sb.from("pagnol_envios").update({ estado: "error", error: mensajeEscritura(null, undefined, err), intentos: e.intentos + 1 }).eq("id", e.id);
    return false;
  }

  const bien = estado !== null && estado >= 200 && estado < 300;
  await sb
    .from("pagnol_envios")
    .update(
      bien
        ? { estado: "enviado", pagnol_id: pagnolId, error: null, intentos: e.intentos + 1, enviado_en: new Date().toISOString() }
        : { estado: "error", error: mensajeEscritura(estado, cuerpo), intentos: e.intentos + 1 },
    )
    .eq("id", e.id);
  return bien;
}

type Recepcion = {
  id: string;
  orden_id: string;
  contrato_id: string;
  fecha: string;
  pagnol_panol_id: string | null;
  recepcion_items: { item_id: string; cantidad: number; items_compra: { pagnol_material_id: string | null; precio_unitario: number; descripcion: string } | null }[];
};

async function leerRecepcion(sb: SupabaseClient, recepcionId: string) {
  const { data, error } = await sb
    .from("recepciones")
    .select("id, orden_id, contrato_id, fecha, pagnol_panol_id, recepcion_items(item_id, cantidad, items_compra(pagnol_material_id, precio_unitario, descripcion))")
    .eq("id", recepcionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as Recepcion | null;
}

async function proveedorEnPagnol(sb: SupabaseClient, ordenId: string): Promise<string | null> {
  const { data } = await sb.from("ordenes_compra_proveedor").select("proveedor_id").eq("id", ordenId).maybeSingle();
  if (!data?.proveedor_id) return null;
  const { data: p } = await sb.from("proveedores").select("pagnol_proveedor_id").eq("id", data.proveedor_id).maybeSingle();
  return (p?.pagnol_proveedor_id as string | null) ?? null;
}

async function enviosDe(sb: SupabaseClient, recepcionId: string): Promise<Envio[]> {
  const { data, error } = await sb
    .from("pagnol_envios")
    .select("id, tipo, item_id, unidad, material_id, cantidad, external_ref, idempotency_key, estado, pagnol_id, error, intentos")
    .eq("recepcion_id", recepcionId)
    .order("external_ref");
  if (error) throw new Error(error.message);
  return (data ?? []) as Envio[];
}

function resumir(envios: Envio[], avisos: string[]): ResumenEnvio {
  const directos = envios.filter((e) => e.tipo === "activo" || e.tipo === "ingreso");
  return {
    total: directos.length,
    enviados: directos.filter((e) => e.estado === "enviado").length,
    errores: [...new Set([...avisos, ...directos.filter((e) => e.estado === "error").map((e) => `${e.external_ref.split(":item:")[1] ?? ""}: ${e.error ?? ""}`)])],
  };
}

/**
 * Informa a Pagnol una recepción: registra lo que falta registrar y manda lo
 * pendiente o con error. Se puede llamar las veces que sea: lo ya enviado no
 * se vuelve a mandar, y Pagnol tampoco lo duplicaría.
 */
export async function sincronizarRecepcion(sb: SupabaseClient, recepcionId: string): Promise<ResumenEnvio> {
  const rec = await leerRecepcion(sb, recepcionId);
  if (!rec) throw new Error("No se encontró la recepción, o tu acceso no la alcanza.");

  const avisos: string[] = [];
  const nuevas: Record<string, unknown>[] = [];
  for (const linea of rec.recepcion_items) {
    const materialId = linea.items_compra?.pagnol_material_id;
    if (!materialId) continue; // escrita a mano: no es del catálogo de Pagnol
    const base = refRecepcion(rec.id, linea.item_id);
    const tipo = await esRastreable(materialId);
    if (!tipo.ok) {
      avisos.push(`${linea.items_compra?.descripcion}: ${tipo.error}`);
      continue;
    }
    const cantidad = Number(linea.cantidad);
    if (tipo.rastreable) {
      if (!Number.isInteger(cantidad)) {
        avisos.push(`${linea.items_compra?.descripcion}: es rastreable y llegó una cantidad con decimales (${cantidad}); cada unidad es un activo.`);
        continue;
      }
      for (let n = 1; n <= cantidad; n++) {
        nuevas.push({ contrato_id: rec.contrato_id, recepcion_id: rec.id, item_id: linea.item_id, tipo: "activo", unidad: n, material_id: materialId, cantidad: 1, external_ref: `${base}:unidad:${n}` });
      }
    } else {
      nuevas.push({ contrato_id: rec.contrato_id, recepcion_id: rec.id, item_id: linea.item_id, tipo: "ingreso", material_id: materialId, cantidad, external_ref: base });
    }
  }

  if (nuevas.length > 0) {
    // Lo ya registrado se respeta: misma ref, misma llave.
    const { error } = await sb.from("pagnol_envios").upsert(nuevas, { onConflict: "empresa_id,external_ref", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const proveedorId = await proveedorEnPagnol(sb, rec.orden_id);
  const precio = new Map(rec.recepcion_items.map((l) => [l.item_id, Number(l.items_compra?.precio_unitario ?? 0)]));
  for (const e of await enviosDe(sb, rec.id)) {
    if (e.estado === "enviado" || (e.tipo !== "activo" && e.tipo !== "ingreso")) continue;
    await mandar(sb, e, { panolId: rec.pagnol_panol_id, fecha: rec.fecha, proveedorId, valor: e.item_id ? precio.get(e.item_id) ?? null : null });
  }
  return resumir(await enviosDe(sb, rec.id), avisos);
}

/**
 * Anula una recepción. Primero se deshace en Pagnol —reverso del stock, baja
 * de los activos— y solo si Pagnol acepta todo se borra en Valar. Si Pagnol
 * responde que esas unidades ya se entregaron o movieron (409), no se anula:
 * hay que ajustarlo en Pagnol primero.
 */
export async function anularRecepcion(sb: SupabaseClient, recepcionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Lo que quedó a medias se termina de mandar: si había llegado a Pagnol sin
  // que lo supiéramos, así se entera Valar y se puede deshacer.
  const previo = await sincronizarRecepcion(sb, recepcionId);
  if (previo.enviados < previo.total) {
    return { ok: false, error: "Hay envíos a Pagnol con error en esta recepción. Reintenta el envío antes de anularla." };
  }
  const rec = await leerRecepcion(sb, recepcionId);
  if (!rec) return { ok: false, error: "No se encontró la recepción." };

  const enviados = (await enviosDe(sb, recepcionId)).filter((e) => (e.tipo === "activo" || e.tipo === "ingreso") && e.estado === "enviado");
  const deshacer = enviados.map((e) => ({
    contrato_id: rec.contrato_id,
    recepcion_id: rec.id,
    item_id: e.item_id,
    tipo: e.tipo === "activo" ? "baja" : "reverso",
    unidad: e.unidad,
    material_id: e.material_id,
    cantidad: e.cantidad,
    external_ref: `${e.external_ref}:${e.tipo === "activo" ? "baja" : "reverso"}`,
    deshace_id: e.id,
  }));
  if (deshacer.length > 0) {
    const { error } = await sb.from("pagnol_envios").upsert(deshacer, { onConflict: "empresa_id,external_ref", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }

  const porRef = new Map(enviados.map((e) => [e.external_ref, e]));
  const fallos: string[] = [];
  for (const e of await enviosDe(sb, recepcionId)) {
    if ((e.tipo !== "reverso" && e.tipo !== "baja") || e.estado === "enviado") continue;
    const original = porRef.get(e.external_ref.replace(/:(baja|reverso)$/, ""));
    const bien = await mandar(sb, e, { panolId: null, fecha: rec.fecha, proveedorId: null, valor: null, deshacerRef: original?.external_ref, deshacerId: original?.pagnol_id });
    if (!bien) fallos.push(e.external_ref);
  }
  if (fallos.length > 0) {
    const detalle = (await enviosDe(sb, recepcionId)).find((e) => fallos.includes(e.external_ref));
    return { ok: false, error: `Pagnol no aceptó deshacer esta recepción${detalle ? `: ${detalle.error ?? ""}` : ""}. Si ya se entregaron esas unidades, ajústalo en Pagnol.` };
  }

  const { error } = await sb.from("recepciones").delete().eq("id", recepcionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Los pañoles activos, para elegir dónde entra lo recibido. */
export async function listarPanoles(): Promise<{ ok: true; datos: PanolPagnol[] } | { ok: false; error: string }> {
  try {
    const { data, error, response } = await clientePagnol("pagnol:materiales", 600).GET("/panoles");
    if (error || !data) return { ok: false, error: mensajeEscritura(response.status, error) };
    return { ok: true, datos: data.data.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, ubicacion: p.ubicacion, activo: p.activo })) };
  } catch (e) {
    return { ok: false, error: mensajeEscritura(null, undefined, e) };
  }
}
