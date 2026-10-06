import { puedeConsultarPagnol, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { listarPanoles } from "@/lib/pagnol/recepcion";

/** Los pañoles de Pagnol, para elegir dónde entra lo recibido. */
export async function GET(pedido: Request) {
  if (!(await puedeConsultarPagnol(pedido))) return Response.json(SIN_ACCESO, { status: 401 });
  const resultado = await listarPanoles();
  return Response.json(resultado, { status: resultado.ok ? 200 : 502 });
}
