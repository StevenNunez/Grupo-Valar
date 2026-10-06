import { sesionDeAbastecimiento, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { procesarPendientes } from "@/lib/pagnol/reposicion";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Reprocesa la bandeja de reposición: los avisos de stock bajo de Pagnol que
 * no pudieron armar solicitud (típicamente, un pañol sin contrato). Se usa
 * después de asignarle contrato al pañol.
 *
 * Pide sesión con acceso a Abastecimiento y permiso para crear solicitudes, y
 * procesa SOLO los avisos de la empresa de esa persona.
 */
export async function POST(pedido: Request) {
  const sb = await sesionDeAbastecimiento(pedido);
  if (!sb) return Response.json(SIN_ACCESO, { status: 401 });

  const { data: crea } = await sb.rpc("tiene_permiso", { clave: "solped.crear" });
  if (crea !== true) {
    return Response.json({ ok: false, error: "Tu acceso no permite crear solicitudes." }, { status: 403 });
  }
  const { data: empresa } = await sb.rpc("empresa_actual");
  const servicio = supabaseDeServicio();
  if (!empresa || !servicio) {
    return Response.json({ ok: false, error: "La reposición automática no está configurada en el servidor." }, { status: 503 });
  }
  return Response.json({ ok: true, ...(await procesarPendientes(servicio, empresa as string)) });
}
