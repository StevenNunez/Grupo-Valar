import { sesionDeAbastecimiento, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { deshacerCompraEnPagnol, estadoDeCompra, informarCompra, type LineaPorInformar, type Origen } from "@/lib/pagnol/compra";

/**
 * Una compra directa (o un egreso de Oficina Central, con `?origen=oficina`)
 * frente a Pagnol (0090, 0091).
 *
 *   GET    qué se le informó a Pagnol, y cómo quedó
 *   POST   informa líneas nuevas (cuerpo: { panol_id, lineas }) o reintenta lo pendiente
 *   DELETE lo deshace en Pagnol (reverso del stock, baja de los activos)
 *
 * Lo que se lee y escribe en Valar va con el token de la persona: si su acceso
 * no alcanza ese documento, la base no la deja.
 */

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Los ids de compra son texto ("C-MISC-2026-08-01"); los de Oficina Central, uuid. */
const IDCOMPRA = /^[\w.\-]{1,80}$/;

const falla = (e: unknown, estado = 500) =>
  Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: estado });

function origenDe(pedido: Request, id: string): Origen | null {
  const oficina = new URL(pedido.url).searchParams.get("origen") === "oficina";
  if (oficina) return UUID.test(id) ? { tipo: "oficina", id } : null;
  return IDCOMPRA.test(id) ? { tipo: "compra", id } : null;
}

export async function GET(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const origen = origenDe(pedido, (await params).id);
  if (!origen) return falla("Documento no válido.", 400);
  try {
    return Response.json({ ok: true, envios: await estadoDeCompra(sb, origen) });
  } catch (e) {
    return falla(e);
  }
}

export async function POST(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const origen = origenDe(pedido, (await params).id);
  if (!origen) return falla("Documento no válido.", 400);

  let cuerpo: { panol_id?: string | null; lineas?: LineaPorInformar[] } = {};
  try {
    cuerpo = (await pedido.json()) ?? {};
  } catch {
    // Sin cuerpo: es un reintento.
  }
  const lineas = Array.isArray(cuerpo.lineas) ? cuerpo.lineas.slice(0, 100) : [];

  try {
    const resumen = await informarCompra(sb, origen, cuerpo.panol_id ?? null, lineas);
    return Response.json({ ok: true, resumen, envios: await estadoDeCompra(sb, origen) });
  } catch (e) {
    return falla(e);
  }
}

export async function DELETE(pedido: Request, { params }: Contexto) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });
  const origen = origenDe(pedido, (await params).id);
  if (!origen) return falla("Documento no válido.", 400);
  try {
    const r = await deshacerCompraEnPagnol(sb, origen);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    return falla(e);
  }
}
