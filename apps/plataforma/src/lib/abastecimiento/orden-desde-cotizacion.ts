"use client";

import { ivaDe } from "../iva";
import { supabase } from "../supabase";
import { condicionDeProveedor } from "./condiciones-pago";
import { cargarItemsDeCotizacion, type Cotizacion } from "./cotizaciones";
import type { Proveedor } from "./proveedores";
import { esOficina } from "../contratos";
import { cargarCentroDeSolped, cargarItemsDeSolped, type Solped } from "./solped";

/**
 * Elige un proveedor.
 *
 * Deja una sola cotización seleccionada —las demás quedan descartadas— y exige
 * motivo: la base tiene una restricción que no deja seleccionar sin decir por
 * qué. Escribir "menor precio" cuesta un segundo y deja el criterio por escrito
 * incluso cuando la razón es obvia.
 */
export async function seleccionarCotizacion(
  solpedId: string,
  cotizacionId: string,
  motivo: string,
) {
  const limpio = motivo.trim();
  if (!limpio) throw new Error("Falta el motivo de la selección.");

  /* Una solicitud se compra en varias órdenes, a distintos proveedores. Elegir a
     otro para lo que falta no puede dar por descartado a quien ya tiene una OC:
     esa cotización queda como respondida, no como rechazada. */
  const conOrden = await supabase
    .from("ordenes_compra_proveedor")
    .select("cotizacion_id")
    .eq("solped_id", solpedId)
    .not("cotizacion_id", "is", null);
  if (conOrden.error) throw new Error(conOrden.error.message);
  const yaCompradas = (conOrden.data ?? []).map((o) => o.cotizacion_id as string).filter((id) => id !== cotizacionId);

  const otras = await supabase
    .from("cotizaciones")
    .update({ seleccionada: false, estado: "descartada" })
    .eq("solped_id", solpedId)
    .neq("id", cotizacionId)
    .not("id", "in", `(${yaCompradas.map((id) => `"${id}"`).join(",") || '""'})`);
  if (otras.error) throw new Error(otras.error.message);

  if (yaCompradas.length > 0) {
    const compradas = await supabase
      .from("cotizaciones")
      .update({ seleccionada: false, estado: "recibida" })
      .in("id", yaCompradas);
    if (compradas.error) throw new Error(compradas.error.message);
  }

  const elegida = await supabase
    .from("cotizaciones")
    .update({ seleccionada: true, estado: "seleccionada", motivo_seleccion: limpio })
    .eq("id", cotizacionId);
  if (elegida.error) throw new Error(elegida.error.message);

  // Con proveedor elegido, la solicitud queda lista para que se autorice la
  // compra: ese es el momento en que el monto pasa por el umbral. Si ya se está
  // comprando, el estado no retrocede.
  const solped = await supabase
    .from("solped")
    .update({ estado: "cotizada" })
    .eq("id", solpedId)
    .in("estado", ["aprobada", "en-cotizacion", "cotizada"]);
  if (solped.error) throw new Error(solped.error.message);
}

/**
 * Convierte la cotización elegida en una orden de compra.
 *
 * Copia los datos del proveedor dentro de la orden —razón social, RUT,
 * dirección, contacto— en vez de dejarlos apuntando al maestro: la OC es un
 * documento que se imprime y se manda, y tiene que seguir diciendo lo mismo
 * dentro de dos años aunque el proveedor se cambie de oficina.
 *
 * Cada ítem se crea apuntando a su ítem de la solicitud (`solped_item_id`), que
 * es lo que permite después saber cuánto de lo pedido ya se compró.
 */
export async function generarOrdenDesdeCotizacion({
  solped,
  cotizacion,
  proveedor,
  numero,
  emisor,
  soloItems,
  cantidades,
  incluirFlete = true,
  proyecto = null,
  anexoId,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  proveedor: Proveedor;
  numero: string;
  emisor: { nombre: string; correo: string };
  /**
   * Qué ítems de la solicitud entran en ESTA orden, por `solped_item_id`.
   *
   * Existe porque una solicitud no se le compra entera a un solo proveedor: el
   * acero conviene en uno y la pintura en otro, y esa es justamente la razón de
   * cotizar ítem por ítem. Sin esto, elegir un proveedor obligaba a comprarle
   * todo o a borrar líneas de la orden después, que es donde se pierde la
   * trazabilidad contra lo que se pidió.
   *
   * Vacío o sin definir = todos los cotizados con precio.
   */
  soloItems?: string[];
  /**
   * Cantidad a comprar por `solped_item_id` cuando difiere de la cotizada: se
   * pidieron 3 bolsas y se compra por paquetes de 10. Sin entrada, la cotizada.
   */
  cantidades?: Record<string, number>;
  /** El flete se cobra una vez. En una segunda orden del mismo proveedor, no. */
  incluirFlete?: boolean;
  /**
   * Lo que se imprime en la línea "Proyecto" de la orden.
   *
   * Por omisión es el nombre del contrato, porque el centro de costo ES el
   * contrato y preguntarlo era pedir que alguien volviera a escribir algo que
   * el sistema ya sabe. Solo se manda cuando la compra va contra un anexo
   * —una extensión o un adicional—, que es el único caso en que difiere.
   */
  proyecto?: string | null;
  /** Contra qué anexo se compra (0059). Si no se dice, el de la solicitud. */
  anexoId?: string | null;
}) {
  const items = await cargarItemsDeCotizacion(cotizacion.id);
  const elegidos = soloItems && soloItems.length > 0 ? new Set(soloItems) : null;
  const cotizados = items.filter(
    (i) =>
      i.disponible &&
      i.precioUnitario > 0 &&
      (elegidos === null || elegidos.has(i.solpedItemId)),
  );

  if (cotizados.length === 0) {
    throw new Error("No hay ítems elegidos con precio para esta orden.");
  }

  const pedidos = await cargarItemsDeSolped(solped.id);
  const porId = new Map(pedidos.map((p) => [p.id, p]));

  /* Oficina Central (0122): la orden hereda el centro de costo de la solicitud y
     cada línea su categoría de oficina. En un contrato esas columnas no se mandan. */
  const oficina = esOficina(solped.contratoId);
  const centroCosto = oficina ? await cargarCentroDeSolped(solped.id) : null;

  /* El código interno sale del contrato y de los últimos 6 dígitos del número,
     así que dos números distintos pueden dar el mismo código ("OC22-001128" y
     "OC23-001128"). Si el código ya está ocupado por OTRO número se le agrega un
     sufijo; si está ocupado por el MISMO número, es una OC repetida y se avisa.
     Desde la 0120 eso lo decide la base, dentro de la misma transacción. */
  const baseId = `OCP-${solped.contratoId.replace(/^C-/, "")}-${numero.replace(/\D/g, "").slice(-6)}`;

  const cabecera = {
    id: baseId,
    contrato_id: solped.contratoId,
    numero,
    solped_id: solped.id,
    cotizacion_id: cotizacion.id,
    proveedor_id: proveedor.id,
    proveedor: proveedor.razonSocial,
    rut_proveedor: proveedor.rut,
    direccion_proveedor: proveedor.direccion,
    ciudad_proveedor: proveedor.ciudad,
    comuna_proveedor: proveedor.comuna,
    contacto: proveedor.contacto,
    correo_contacto: proveedor.correoPago ?? proveedor.correo,
    telefono_contacto: proveedor.telefono,
    emisor_nombre: emisor.nombre,
    emisor_correo: emisor.correo,
    // El centro de costo es el contrato; solo se dice otra cosa cuando la
    // compra va contra un anexo.
    proyecto: proyecto ?? solped.contrato,
    anexo_id: oficina ? null : anexoId === undefined ? solped.anexoId : anexoId,
    ...(oficina ? { centro_costo: centroCosto } : {}),
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_requerida: solped.fechaRequerida,
    condiciones_pago: condicionDeProveedor(proveedor),
    solicitado_por: solped.solicitanteNombre,
    estado: "borrador",
    observaciones: `Generada desde ${solped.numero}.`,
  };

  /* Las líneas sin `id` ni `orden_id`: los pone la base cuando sabe el código final. */
  const lineas: Record<string, unknown>[] = cotizados.map((i) => {
    const pedido = porId.get(i.solpedItemId);
    const cantidad = cantidades?.[i.solpedItemId] && cantidades[i.solpedItemId] > 0 ? cantidades[i.solpedItemId] : i.cantidad;
    const neto = Math.round(cantidad * i.precioUnitario);
    return {
      contrato_id: solped.contratoId,
      solped_item_id: i.solpedItemId,
      // Lo que se pidió del catálogo de Pagnol se compra con la misma referencia.
      pagnol_material_id: pedido?.pagnolMaterialId ?? null,
      categoria_id: oficina ? null : pedido?.categoriaId ?? null,
      ...(oficina ? { categoria_oficina: pedido?.categoriaOficina ?? null } : {}),
      // El nombre técnico con que lo cotizó el proveedor: es con el que se compra.
      descripcion: i.nombreCotizado || (pedido?.descripcion ?? "Ítem cotizado"),
      unidad: pedido?.unidad ?? "un",
      cantidad,
      precio_unitario: i.precioUnitario,
      iva: ivaDe(neto),
      // El tipo de gasto viene de la solicitud: es lo que decide si castiga el
      // margen, y no debería volver a decidirse acá.
      tipo: solped.tipoGasto,
    };
  });

  /* El flete viaja como una línea más de la orden.
   *
   * Si se quedara solo en la cotización, pasaría lo siguiente: se decide con el
   * costo puesto en obra —$354.100— y la orden queda por $329.100, así que esos
   * $25.000 no llegan nunca al costo del contrato y el margen del mes sale
   * inflado. Se decidió con un número y se contabilizó con otro.
   *
   * Va sin categoría a propósito: el flete no es de ninguna en particular, y la
   * pantalla ya avisa cuando un ítem no tiene categoría. */
  if (incluirFlete && cotizacion.flete > 0) {
    lineas.push({
      es_flete: true,
      contrato_id: solped.contratoId,
      descripcion: "Flete y despacho",
      unidad: "gl",
      cantidad: 1,
      precio_unitario: cotizacion.flete,
      iva: ivaDe(cotizacion.flete),
      tipo: solped.tipoGasto,
    });
  }

  /* Todo en una transacción (0120): la orden queda completa o no queda. */
  const { data, error } = await supabase.rpc("crear_orden_desde_cotizacion", {
    p_orden: cabecera,
    p_items: lineas,
    p_solped: solped.id,
  });
  if (!error) return data as string;
  throw new Error(error.message);
}
