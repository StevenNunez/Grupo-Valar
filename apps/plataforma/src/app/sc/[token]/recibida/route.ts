import { abrirEnlaceSolicitud, marcarRecibida } from "@/lib/oc-envio/publico-solicitud";

/** El proveedor avisa que recibió la solicitud. */

type Contexto = { params: Promise<{ token: string }> };

const falla = (error: string, status: number) => Response.json({ ok: false, error }, { status });

export async function POST(pedido: Request, { params }: Contexto) {
  const { token } = await params;
  const r = await abrirEnlaceSolicitud(token);
  if (r.estado !== "ok") return falla("Este enlace no es válido o ya venció.", 404);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await pedido.json();
  } catch {
    return falla("El pedido no es JSON.", 400);
  }

  const nombre = String(cuerpo.nombre ?? "").trim().slice(0, 120);
  const comentario = String(cuerpo.comentario ?? "").trim().slice(0, 1000) || null;
  if (!nombre) return falla("Escribe tu nombre.", 400);

  try {
    await marcarRecibida(r.envio, { nombre, comentario });
  } catch (e) {
    return falla(e instanceof Error ? e.message : String(e), 500);
  }
  return Response.json({ ok: true });
}
