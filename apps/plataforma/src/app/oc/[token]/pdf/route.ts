import { pdfDeOrden } from "@/lib/oc-envio/pdf";
import { cargarFirmasDeOrden } from "@/lib/oc-envio/firmas";
import { abrirEnlace } from "@/lib/oc-envio/publico";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/** El PDF de la orden para el proveedor, por su enlace. */

type Contexto = { params: Promise<{ token: string }> };

export async function GET(_pedido: Request, { params }: Contexto) {
  const { token } = await params;
  const r = await abrirEnlace(token);
  if (r.estado !== "ok") return new Response("Este enlace no es válido o ya venció.", { status: 404 });

  // La firma de quien envió la orden y la de quien la empresa tiene para autorizar.
  const servicio = supabaseDeServicio();
  if (servicio) r.orden.firmas = await cargarFirmasDeOrden(servicio, r.orden.empresaId, r.envio.enviadaPor);

  const pdf = await pdfDeOrden(r.orden);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.orden.numero}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
