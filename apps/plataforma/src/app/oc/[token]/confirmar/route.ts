import { abrirEnlace, confirmarEnvio } from "@/lib/oc-envio/publico";

/** El proveedor confirma la orden y la fecha en que la entrega. */

type Contexto = { params: Promise<{ token: string }> };

const falla = (error: string, status: number) => Response.json({ ok: false, error }, { status });

export async function POST(pedido: Request, { params }: Contexto) {
  const { token } = await params;
  const r = await abrirEnlace(token);
  if (r.estado !== "ok") return falla("Este enlace no es válido o ya venció.", 404);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await pedido.json();
  } catch {
    return falla("El pedido no es JSON.", 400);
  }

  const nombre = String(cuerpo.nombre ?? "").trim().slice(0, 120);
  const fechaEntrega = String(cuerpo.fechaEntrega ?? "").trim();
  const comentario = String(cuerpo.comentario ?? "").trim().slice(0, 1000) || null;

  if (!nombre) return falla("Escribe tu nombre.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega) || Number.isNaN(Date.parse(fechaEntrega))) {
    return falla("Indica la fecha de entrega.", 400);
  }
  if (fechaEntrega < r.orden.fechaEmision) {
    return falla("La fecha de entrega no puede ser anterior a la fecha de la orden.", 400);
  }

  try {
    await confirmarEnvio(r.envio, { nombre, fechaEntrega, comentario });
  } catch (e) {
    return falla(e instanceof Error ? e.message : String(e), 500);
  }
  return Response.json({ ok: true });
}
