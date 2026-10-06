import { revalidateTag } from "next/cache";
import { Webhook } from "standardwebhooks";
import type { TagPagnol } from "@/lib/pagnol/client";
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
 *   3. se responde rápido: lo que no es trivial queda anotado para después.
 *
 * Se registra en Pagnol con la URL CON barra final
 * (https://plataforma.grupovalar.cl/api/webhooks/pagnol/): sin ella la
 * plataforma redirige, y un webhook no sigue redirecciones.
 */

type EventoPagnol = {
  id: string;
  type: string;
  created_at: string;
  organization_id: string;
  data: unknown;
};

/** Qué caché limpia cada familia de eventos. */
function tagsDe(tipo: string): TagPagnol[] {
  if (tipo.startsWith("material.")) return ["pagnol:materiales"];
  if (tipo.startsWith("proveedor.")) return ["pagnol:proveedores"];
  if (tipo.startsWith("activo.")) return ["pagnol:activos", "pagnol:materiales"];
  // El stock cambió: las sugerencias muestran stock. La solicitud de compra
  // automática (Fase 4) lo toma de la tabla, donde queda sin procesar.
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
  if (sb) {
    const { error } = await sb.from("pagnol_webhooks_recibidos").insert({
      webhook_id: id,
      tipo: evento.type,
      organization_id: evento.organization_id ?? null,
      payload: evento,
    });
    // Ya había llegado: se confirma sin volver a procesarlo.
    if (error?.code === "23505") return Response.json({ ok: true, duplicado: true });
    if (error) return Response.json({ error: "No se pudo anotar el aviso." }, { status: 500 });
  }

  // Limpiar la caché es idempotente: aunque no se haya podido anotar, se hace.
  for (const tag of tagsDe(evento.type)) revalidateTag(tag, { expire: 0 });

  if (sb && evento.type !== "stock.bajo_minimo") {
    await sb.from("pagnol_webhooks_recibidos").update({ procesado_en: new Date().toISOString() }).eq("webhook_id", id);
  }
  return Response.json({ ok: true });
}
