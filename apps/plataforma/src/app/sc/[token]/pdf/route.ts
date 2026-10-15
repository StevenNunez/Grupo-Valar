import { pdfDeSolicitud } from "@/lib/oc-envio/pdf-solicitud";
import { abrirEnlaceSolicitud } from "@/lib/oc-envio/publico-solicitud";

/** El PDF de la solicitud para el proveedor, por su enlace. Se arma al pedirlo; no se guarda. */

type Contexto = { params: Promise<{ token: string }> };

export async function GET(_pedido: Request, { params }: Contexto) {
  const { token } = await params;
  const r = await abrirEnlaceSolicitud(token);
  if (r.estado !== "ok") return new Response("Este enlace no es válido o ya venció.", { status: 404 });

  const pdf = await pdfDeSolicitud(r.contenido);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.contenido.numero}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
