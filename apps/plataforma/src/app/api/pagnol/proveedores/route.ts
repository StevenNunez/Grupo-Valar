import { parametrosDeBusqueda, puedeConsultarPagnol } from "@/lib/pagnol/acceso";
import { buscarProveedores } from "@/lib/pagnol/queries";

/** Busca proveedores en Pagnol. Ver `lib/pagnol/acceso.ts`. */
export async function GET(pedido: Request) {
  if (!(await puedeConsultarPagnol(pedido))) {
    return Response.json({ ok: false, error: "Tu sesión no permite consultar el catálogo de Pagnol." }, { status: 401 });
  }
  const { q, cursor } = parametrosDeBusqueda(pedido);
  const resultado = await buscarProveedores(q, cursor);
  return Response.json(resultado, { status: resultado.ok ? 200 : 502 });
}
