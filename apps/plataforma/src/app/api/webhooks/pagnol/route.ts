import { revalidateTag } from "next/cache";
import { Webhook } from "standardwebhooks";
import type { TagPagnol } from "@/lib/pagnol/client";
import { registrarCompraRecibida, registrarCorreccion } from "@/lib/pagnol/recepciones-entrantes";
import { procesarYAnotar } from "@/lib/pagnol/reposicion";
import { procesarSolicitudYAnotar, type AvisoSolicitud } from "@/lib/pagnol/solicitudes-entrantes";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Los avisos de Pagnol (Fase 3 del contrato, docs/integracion-pagnol-valar.md).
 *
 * Pagnol firma cada aviso con el estándar *Standard Webhooks*: si la firma no
 * calza, o la hora del aviso está a más de 5 minutos de la nuestra, se
 * rechaza con 401 (la librería oficial verifica las dos cosas). Lo que sí
 * viene de Pagnol:
 *
 *   1. se anota por su `webhook-id`: si ya llegó, no se procesa otra vez
 *      (Pagnol reintenta hasta recibir un 2xx);
 *   2. se limpia la caché de lo que cambió, para que la próxima búsqueda en
 *      Abastecimiento ya traiga el dato nuevo;
 *   3. si es `stock.bajo_minimo`, se suma al borrador de reposición del
 *      contrato del pañol (Fase 4, lib/pagnol/reposicion.ts); si no se puede
 *      —pañol sin contrato—, queda anotado en la bandeja de Abastecimiento;
 *   4. se responde rápido.
 *
 * Se registra en Pagnol con la URL CON barra final
 * (https://plataforma.grupovalar.cl/api/webhooks/pagnol/): sin ella la
 * plataforma redirige, y un webhook no sigue redirecciones.
 */

type FilaWebhook = Parameters<typeof procesarYAnotar>[1];

type EventoPagnol = {
  id: string;
  type: string;
  created_at: string;
  organization_id: string;
  data: unknown;
};

/** `compra.recibida` y `compra.recepcion_corregida`: la recepción vive en Pagnol (Fase 5). */
const esDeCompra = (tipo: string) => tipo === "compra.recibida" || tipo === "compra.recepcion_corregida";

/** `solicitud_compra.creada|aprobada|rechazada`: las solicitudes de Pagnol (Fase 5 · C). */
const esDeSolicitud = (tipo: string) => tipo.startsWith("solicitud_compra.");

/** Qué caché limpia cada familia de eventos. */
function tagsDe(tipo: string): TagPagnol[] {
  if (tipo.startsWith("material.")) return ["pagnol:materiales"];
  if (tipo.startsWith("proveedor.")) return ["pagnol:proveedores"];
  if (tipo.startsWith("activo.")) return ["pagnol:activos", "pagnol:materiales"];
  // El stock cambió: las sugerencias muestran stock.
  if (tipo === "stock.bajo_minimo") return ["pagnol:materiales"];
  return [];
}

export async function POST(pedido: Request) {
  const secreto = process.env.PAGNOL_WEBHOOK_SECRET;
  if (!secreto) {
    // 503 y no 2xx: así Pagnol reintenta cuando el secreto esté configurado.
    return Response.json({ error: "Webhook de Pagnol no configurado." }, { status: 503 });
  }

  const cuerpo = await pedido.text();
  const cabeceras = {
    "webhook-id": pedido.headers.get("webhook-id") ?? "",
    "webhook-timestamp": pedido.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": pedido.headers.get("webhook-signature") ?? "",
  };

  let evento: EventoPagnol;
  try {
    evento = new Webhook(secreto).verify(cuerpo, cabeceras) as EventoPagnol;
  } catch {
    return Response.json({ error: "Firma inválida." }, { status: 401 });
  }

  const sb = supabaseDeServicio();
  const id = cabeceras["webhook-id"];
  // De qué empresa de Valar es: la que está enlazada a esa organización de Pagnol.
  let empresa: string | null = null;
  if (sb && evento.organization_id) {
    const { data } = await sb.from("empresas").select("id").eq("pagnol_organization_id", evento.organization_id).maybeSingle();
    empresa = (data?.id as string | undefined) ?? null;
  }

  if (sb) {
    const { error } = await sb.from("pagnol_webhooks_recibidos").insert({
      webhook_id: id,
      tipo: evento.type,
      organization_id: evento.organization_id ?? null,
      empresa_id: empresa,
      payload: evento,
    });
    if (error?.code === "23505") {
      // Ya había llegado. Una recepción que no se pudo aplicar (aviso con
      // `procesado_en` vacío) se reintenta; todo lo demás se confirma sin repetir.
      const { data: previo } = await sb.from("pagnol_webhooks_recibidos").select("procesado_en").eq("webhook_id", id).maybeSingle();
      if (!esDeCompra(evento.type) || previo?.procesado_en) return Response.json({ ok: true, duplicado: true });
    } else if (error) {
      return Response.json({ error: "No se pudo anotar el aviso." }, { status: 500 });
    }
  }

  // Limpiar la caché es idempotente: aunque no se haya podido anotar, se hace.
  for (const tag of tagsDe(evento.type)) revalidateTag(tag, { expire: 0 });

  if (sb && esDeCompra(evento.type)) {
    // Fase 5 · B: lo que el pañolero recibe en Pagnol. Si no se puede aplicar
    // por algo pasajero se responde 500 y Pagnol reintenta; si no tiene arreglo
    // (la OC no existe) queda anotado y se confirma, para no reintentar 7 días.
    if (!empresa) {
      await sb.from("pagnol_webhooks_recibidos").update({ error: "La organización de Pagnol no está enlazada a ninguna empresa.", procesado_en: new Date().toISOString() }).eq("webhook_id", id);
      return Response.json({ ok: true, ignorado: true });
    }
    const r = evento.type === "compra.recibida"
      ? await registrarCompraRecibida(sb, empresa, evento.data as Parameters<typeof registrarCompraRecibida>[2])
      : await registrarCorreccion(sb, empresa, evento.data as Parameters<typeof registrarCorreccion>[2]);
    if (!r.ok && !r.permanente) {
      await sb.from("pagnol_webhooks_recibidos").update({ error: r.error }).eq("webhook_id", id);
      return Response.json({ error: r.error }, { status: 500 });
    }
    await sb
      .from("pagnol_webhooks_recibidos")
      .update({ procesado_en: new Date().toISOString(), error: r.ok ? null : r.error })
      .eq("webhook_id", id);
  } else if (sb && esDeSolicitud(evento.type)) {
    // Fase 5 · C: una solicitud de compra aprobada en Pagnol → borrador de SOLPED.
    // Sin contrato asociado, queda en la bandeja con el motivo y se responde 2xx:
    // el aviso llegó bien; reintentarlo no lo arreglaría.
    await procesarSolicitudYAnotar(sb, { webhook_id: id, empresa_id: empresa, tipo: evento.type, payload: evento as AvisoSolicitud["payload"] });
  } else if (sb && evento.type === "stock.bajo_minimo") {
    // Si no se puede (pañol sin contrato), queda en la bandeja con el motivo.
    // Igual se responde 2xx: el aviso llegó bien; reintentarlo no lo arreglaría.
    await procesarYAnotar(sb, { webhook_id: id, empresa_id: empresa, payload: evento as FilaWebhook["payload"] });
  } else if (sb) {
    await sb.from("pagnol_webhooks_recibidos").update({ procesado_en: new Date().toISOString() }).eq("webhook_id", id);
  }
  return Response.json({ ok: true });
}
