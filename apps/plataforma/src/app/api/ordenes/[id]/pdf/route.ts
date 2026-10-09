import { cargarOrdenParaEnviar, remitenteDe } from "@/lib/oc-envio/datos";
import { pdfDeOrden } from "@/lib/oc-envio/pdf";

/**
 * El PDF de una orden, el mismo que va adjunto al correo. Sirve para revisarlo
 * antes de enviar. La orden se lee con la sesión de la persona: el RLS decide
 * si la alcanza.
 */

type Contexto = { params: Promise<{ id: string }> };

export async function GET(pedido: Request, { params }: Contexto) {
  const remitente = await remitenteDe(pedido);
  if (!remitente) return new Response("Sin acceso.", { status: 401 });

  const { id } = await params;
  const orden = await cargarOrdenParaEnviar(remitente.sb, decodeURIComponent(id));
  if (!orden) return new Response("No se encontró la orden.", { status: 404 });

  const pdf = await pdfDeOrden(orden);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${orden.numero}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
