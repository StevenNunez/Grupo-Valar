import { sesionDeAbastecimiento, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { anuncioDeOrden, anunciarOrden, cancelarOrdenEnPagnol, modoDeRecepcion } from "@/lib/pagnol/compras-esperadas";

/**
 * Una OC frente a Pagnol como compra esperada (Fase 5 · B).
 *
 *   GET    cómo está: el modo de recepción de la empresa y si ya se anunció
 *   POST   la anuncia a Pagnol, o le manda lo que cambió (cuerpo: { panol_id? })
 *   DELETE la cancela en Pagnol (lo ya recibido se queda)
 *
 * Lo que se lee y escribe en Valar va con el token de la persona: si su acceso
 * no alcanza esa orden, la base no la deja.
 */

type Contexto = { params: Promise<{ id: string }> };

const IDORDEN = /^[\w.\-]{1,80}$/;

const falla = (e: unknown, estado = 500) =>
  Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: estado });

export async function GET(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const { id } = await params;
  if (!IDORDEN.test(id)) return falla("Orden no válida.", 400);
  try {
    return Response.json({ ok: true, modo: await modoDeRecepcion(sb), anuncio: await anuncioDeOrden(sb, id) });
  } catch (e) {
    return falla(e);
  }
}

export async function POST(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const { id } = await params;
  if (!IDORDEN.test(id)) return falla("Orden no válida.", 400);

  let panol: string | null = null;
  try {
    const cuerpo = (await pedido.json()) as { panol_id?: unknown };
    panol = typeof cuerpo?.panol_id === "string" && cuerpo.panol_id ? cuerpo.panol_id : null;
  } catch {
    // Sin cuerpo: se usa el pañol de siempre.
  }

  try {
    const r = await anunciarOrden(sb, id, panol);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    return falla(e);
  }
}

export async function DELETE(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const { id } = await params;
  if (!IDORDEN.test(id)) return falla("Orden no válida.", 400);
  try {
    const r = await cancelarOrdenEnPagnol(sb, id);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    return falla(e);
  }
}
