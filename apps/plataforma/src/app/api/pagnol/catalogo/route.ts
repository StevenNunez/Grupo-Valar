import { puedeConsultarPagnol, SIN_ACCESO } from "@/lib/pagnol/acceso";
import { todosLosActivos, todosLosMateriales } from "@/lib/pagnol/queries";

/** El catálogo completo de Pagnol (materiales o activos) para la página Artículos. */
export async function GET(pedido: Request) {
  if (!(await puedeConsultarPagnol(pedido))) return Response.json(SIN_ACCESO, { status: 401 });
  const recurso = new URL(pedido.url).searchParams.get("recurso");
  if (recurso !== "materiales" && recurso !== "activos") {
    return Response.json({ ok: false, error: "Recurso no válido." }, { status: 400 });
  }
  const resultado = recurso === "materiales" ? await todosLosMateriales() : await todosLosActivos();
  return Response.json(resultado, { status: resultado.ok ? 200 : 502 });
}
