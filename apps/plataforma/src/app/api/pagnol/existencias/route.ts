import { puedeConsultarPagnol, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { existenciasDe } from "@/lib/pagnol/queries";

/** Dónde está el stock de un material de Pagnol, por pañol y contrato. */
export async function GET(pedido: Request) {
  if (!(await puedeConsultarPagnol(pedido))) return Response.json(SIN_ACCESO, { status: 401 });
  const id = new URL(pedido.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, error: "Material no válido." }, { status: 400 });
  const resultado = await existenciasDe(id);
  return Response.json(resultado, { status: resultado.ok ? 200 : 502 });
}
