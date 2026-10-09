import "server-only";

import { supabaseDeServicio } from "@/lib/supabase-servidor";
import { cargarOrdenParaEnviar, huellaDe, pareceEnlace, type OrdenParaEnviar } from "./datos";

/**
 * Lo que ve el proveedor por su enlace. No tiene sesión: el enlace ES la
 * llave, así que se busca por su huella con la clave de servicio, y de ahí en
 * adelante solo se toca la orden de ESE envío (empresa e id).
 */

export type Envio = {
  id: string;
  empresaId: string;
  ordenId: string;
  enviadaEn: string;
  enviadaPorNombre: string | null;
  expiraEn: string;
  confirmadaEn: string | null;
  confirmadaPor: string | null;
  fechaEntrega: string | null;
  comentario: string | null;
};

export type ResultadoEnlace =
  | { estado: "ok"; envio: Envio; orden: OrdenParaEnviar }
  | { estado: "invalido" | "vencido" | "anulada" };

export async function abrirEnlace(token: string, { contarVista = false } = {}): Promise<ResultadoEnlace> {
  const servicio = supabaseDeServicio();
  if (!servicio || !pareceEnlace(token)) return { estado: "invalido" };

  const { data: e } = await servicio
    .from("ordenes_envios")
    .select("*")
    .eq("token_hash", huellaDe(token))
    .maybeSingle();
  if (!e) return { estado: "invalido" };
  if (new Date(e.expira_en) < new Date()) return { estado: "vencido" };

  const orden = await cargarOrdenParaEnviar(servicio, e.orden_id, e.empresa_id);
  if (!orden) return { estado: "invalido" };
  if (orden.estado === "anulada") return { estado: "anulada" };

  if (contarVista) {
    await servicio
      .from("ordenes_envios")
      .update({ vista_en: e.vista_en ?? new Date().toISOString(), vistas: (e.vistas ?? 0) + 1 })
      .eq("id", e.id);
  }

  return {
    estado: "ok",
    orden,
    envio: {
      id: e.id,
      empresaId: e.empresa_id,
      ordenId: e.orden_id,
      enviadaEn: e.enviada_en,
      enviadaPorNombre: e.enviada_por_nombre,
      expiraEn: e.expira_en,
      confirmadaEn: e.confirmada_en,
      confirmadaPor: e.confirmada_por,
      fechaEntrega: e.fecha_entrega,
      comentario: e.comentario,
    },
  };
}

/**
 * La confirmación del proveedor. La fecha que compromete va también a la
 * orden: es la que usa el indicador de entregas a tiempo. Puede volver a
 * confirmar (si se equivocó de fecha): vale la última.
 */
export async function confirmarEnvio(
  envio: Envio,
  datos: { nombre: string; fechaEntrega: string; comentario: string | null },
) {
  const servicio = supabaseDeServicio()!;
  const ahora = new Date();
  const { error } = await servicio
    .from("ordenes_envios")
    .update({
      confirmada_en: ahora.toISOString(),
      confirmada_por: datos.nombre,
      fecha_entrega: datos.fechaEntrega,
      comentario: datos.comentario,
    })
    .eq("id", envio.id);
  if (error) throw new Error(error.message);

  const { error: e2 } = await servicio
    .from("ordenes_compra_proveedor")
    .update({ fecha_comprometida: datos.fechaEntrega, fecha_confirmacion: ahora.toISOString().slice(0, 10) })
    .eq("empresa_id", envio.empresaId)
    .eq("id", envio.ordenId);
  if (e2) throw new Error(e2.message);
}
