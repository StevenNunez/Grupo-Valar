import { sesionConPermiso } from "@/lib/pagnol/acceso";
import { sincronizarActivos, type ModoSincronia } from "@/lib/pagnol/activos-sincronia";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * «Actualizar desde Pagnol» en la pantalla de Activos (0109).
 *
 * Cuerpo: `{ modo: "uno", id }`, `{ modo: "cambios" }` o `{ modo: "todo" }`.
 * Pide sesión con acceso a los activos (`oficina_central.ver`) y trabaja SOLO sobre
 * la empresa de esa persona. Lee de Pagnol sin caché y escribe con la clave de
 * servicio, porque la función de la base que corrige la copia no está abierta al
 * navegador.
 */
export async function POST(pedido: Request) {
  const sb = await sesionConPermiso(pedido, "oficina_central.ver");
  if (!sb) return Response.json({ ok: false, error: "Tu sesión no permite ver los activos." }, { status: 401 });

  const cuerpo = (await pedido.json().catch(() => ({}))) as { modo?: string; id?: string };
  const modo = cuerpo.modo;
  if (modo !== "uno" && modo !== "cambios" && modo !== "todo") {
    return Response.json({ ok: false, error: "Modo no válido." }, { status: 400 });
  }
  if (modo === "uno" && !/^[0-9a-f-]{36}$/i.test(cuerpo.id ?? "")) {
    return Response.json({ ok: false, error: "Activo no válido." }, { status: 400 });
  }

  const { data: empresa } = await sb.rpc("empresa_actual");
  const servicio = supabaseDeServicio();
  if (!empresa || !servicio) {
    return Response.json({ ok: false, error: "La sincronización no está configurada en el servidor." }, { status: 503 });
  }
  const r = await sincronizarActivos(servicio, empresa as string, modo as ModoSincronia, cuerpo.id);
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
