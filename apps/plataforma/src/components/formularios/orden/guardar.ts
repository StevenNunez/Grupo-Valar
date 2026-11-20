import { actualizar, crear, eliminar } from "@/lib/crud";
import { ivaDe } from "@/lib/iva";
import { precioConDescuento, type EstadoOrden, type Orden } from "@/lib/ordenes";
import { cancelarOrdenEnPagnol } from "@/lib/pagnol/navegador";
import { supabase } from "@/lib/supabase";
import type { Linea } from "./borrador";

/**
 * Guarda la orden con sus ítems: la cabecera, los ítems borrados y después cada
 * línea, nueva o corregida.
 *
 * `orden` es la que se está editando, o `null` si es nueva. `alCrear` se llama
 * apenas existe la cabecera de una orden nueva (ahí suben sus respaldos).
 */
export async function guardarOrden({
  orden,
  ordenId,
  cabecera,
  lineas,
  eliminadas,
  exenta,
  descuento,
  descuentoInicial,
  enUf,
  enUfInicial,
  oficina,
  eraOficina,
  listaEnPesos,
  alCrear,
}: {
  orden: Orden | null;
  ordenId: string;
  cabecera: Record<string, unknown> & { id: string; contrato_id: string; estado: EstadoOrden };
  lineas: Linea[];
  eliminadas: string[];
  exenta: boolean;
  descuento: number;
  descuentoInicial: number;
  enUf: boolean;
  enUfInicial: boolean;
  /** Orden de Oficina Central (0122): la categoría de cada línea es la de oficina. */
  oficina: boolean;
  /** Lo era al abrirla: si dejó de serlo, hay que vaciar su categoría de oficina. */
  eraOficina: boolean;
  listaEnPesos: (l: Linea) => number;
  alCrear: (id: string) => void;
}) {
  /* Sacarla de borrador va al final, con los ítems ya guardados: la base revisa
     ahí que la compra tenga sus firmas (0127) y tiene que ver el monto nuevo,
     no el de antes. Si falta una firma, la orden queda en borrador con todo lo
     demás guardado. */
  const emite = cabecera.estado !== "borrador" && cabecera.estado !== "anulada" && (!orden || orden.estado === "borrador");
  const primero = emite ? { ...cabecera, estado: "borrador" as EstadoOrden } : cabecera;

  if (orden) {
    await actualizar("ordenes_compra_proveedor", orden.id, primero);
    // Fase 5: una orden anulada deja de esperarse en Pagnol (sin efecto si nunca se anunció).
    if (cabecera.estado === "anulada" && orden.estado !== "anulada") void cancelarOrdenEnPagnol(orden.id);
  } else {
    await crear("ordenes_compra_proveedor", primero);
    alCrear(cabecera.id);
  }

  for (const borrada of eliminadas) await eliminar("items_compra", borrada);

  /* El código de un ítem nuevo sigue al mayor correlativo que ya existe en la
     orden (o que se acaba de borrar), no a su posición en pantalla: si se
     quitó un ítem o la orden vino de una cotización, contar posiciones
     repite un código ya usado y la base rechaza el guardado. */
  const { data: enBase } = await supabase
    .from("items_compra")
    .select("id")
    .like("id", `IT-${ordenId}-%`);
  const usados = [
    ...lineas.filter((l) => !l.nuevo).map((l) => l.id),
    ...eliminadas,
    ...((enBase ?? []) as { id: string }[]).map((i) => i.id),
  ];
  let n = usados.reduce((mayor, id) => Math.max(mayor, Number(/-(\d+)$/.exec(id)?.[1] ?? 0)), 0);
  for (const l of lineas) {
    if (!l.descripcion.trim()) continue;
    if (l.nuevo) n += 1;
    const fila = {
      contrato_id: cabecera.contrato_id,
      orden_id: ordenId,
      categoria_id: oficina ? null : l.categoria_id || null,
      ...(oficina ? { categoria_oficina: l.categoria_id || null } : eraOficina ? { categoria_oficina: null } : {}),
      pagnol_material_id: l.pagnol_material_id || null,
      descripcion: l.descripcion.trim(),
      unidad: l.unidad || "UN",
      cantidad: l.cantidad || 1,
      // Con descuento, el precio que se paga es el de lista menos el descuento; la lista queda aparte.
      precio_unitario: precioConDescuento(listaEnPesos(l), descuento),
      ...(descuento > 0 || descuentoInicial > 0 ? { precio_lista: descuento > 0 ? listaEnPesos(l) : null } : {}),
      // El IVA de la línea sigue la regla general, salvo en la orden exenta.
      iva: exenta ? 0 : ivaDe(l.cantidad * precioConDescuento(listaEnPesos(l), descuento)),
      ...(enUf || enUfInicial ? { precio_uf: enUf ? l.precio_uf : null } : {}),
      // En Oficina Central no hay mandante a quien cobrarle: todo es gasto propio.
      tipo: oficina ? "ordinario" : l.tipo,
    };

    if (l.nuevo) {
      await crear("items_compra", {
        ...fila,
        id: `IT-${ordenId}-${String(n).padStart(3, "0")}`,
      });
    } else {
      await actualizar("items_compra", l.id, fila);
    }
  }

  if (emite) await actualizar("ordenes_compra_proveedor", ordenId, { estado: cabecera.estado });
}
