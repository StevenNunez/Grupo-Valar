import { sesionDeAbastecimiento, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { anularRecepcion, sincronizarRecepcion } from "@/lib/pagnol/recepcion";

/**
 * Una recepción de Valar frente a Pagnol (Fase 2 del contrato).
 *
 *   POST   informa lo recibido (o reintenta lo que quedó con error)
 *   DELETE la anula: primero se deshace en Pagnol, después se borra en Valar
 *
 * Lo que se lee y escribe en Valar va con el token de la persona: si su acceso
 * no alcanza esa recepción, la base no la deja.
 */

type Contexto = { params: Promise<{ id: string }> };

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function POST(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const { id } = await params;
  if (!esUuid(id)) return Response.json({ ok: false, error: "Recepción no válida." }, { status: 400 });
  try {
    return Response.json({ ok: true, resumen: await sincronizarRecepcion(sb, id) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const { id } = await params;
  if (!esUuid(id)) return Response.json({ ok: false, error: "Recepción no válida." }, { status: 400 });
  try {
    const r = await anularRecepcion(sb, id);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
