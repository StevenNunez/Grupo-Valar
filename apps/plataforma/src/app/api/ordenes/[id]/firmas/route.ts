import { cargarOrdenParaEnviar, remitenteDe } from "@/lib/oc-envio/datos";
import { cargarFirmasDeOrden } from "@/lib/oc-envio/firmas";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Las firmas dibujadas que lleva la hoja impresa de una orden: las mismas que
 * estampa el PDF. La tabla `firmas` es solo de su dueña, así que se leen aquí
 * con la clave de servicio, después de comprobar que la persona alcanza la orden.
 */

type Contexto = { params: Promise<{ id: string }> };

const dataUrl = (b: Uint8Array | null) => (b ? `data:image/png;base64,${Buffer.from(b).toString("base64")}` : null);

export async function GET(pedido: Request, { params }: Contexto) {
  const remitente = await remitenteDe(pedido);
  if (!remitente) return Response.json({ ok: false, error: "Sin acceso." }, { status: 401 });

  const { id } = await params;
  const orden = await cargarOrdenParaEnviar(remitente.sb, decodeURIComponent(id));
  if (!orden) return Response.json({ ok: false, error: "No se encontró la orden." }, { status: 404 });

  const servicio = supabaseDeServicio();
  if (!servicio) return Response.json({ ok: true, datos: { emite: null, autoriza: null, autorizaNombre: null } });

  const f = await cargarFirmasDeOrden(servicio, orden.empresaId, remitente.id);
  return Response.json(
    { ok: true, datos: { emite: dataUrl(f.emite), autoriza: dataUrl(f.autoriza), autorizaNombre: f.autorizaNombre } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
