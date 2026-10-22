"use client";

import { supabase } from "./supabase";

/**
 * Tres datos informativos de cada contrato, que se muestran junto a las ventas
 * del Dashboard y en la ficha de cierre. Ninguno es gasto ni cambia un resultado.
 *
 *   porCobrar          estados de pago presentados, aprobados o facturados que aún no se pagan (neto)
 *   porPagar           facturas y servicios de proveedores sin pagar, con IVA, menos las cuotas ya transferidas
 *   activos            valor neto de los activos del contrato: la suma de sus activos con valor
 *                      cargado o, mientras no lo tengan, el valor de referencia anotado en el contrato
 */

export type InformativosContrato = {
  porCobrar: number;
  porPagar: number;
  activos: number;
  /** De dónde sale `activos`: el detalle de cada activo o el valor anotado en el contrato. */
  activosFuente: "detalle" | "referencia" | null;
  /** Lo que se debe, por proveedor, de mayor a menor. */
  deudaPorProveedor: { proveedor: string; monto: number }[];
};

const vacio = (): InformativosContrato => ({ porCobrar: 0, porPagar: 0, activos: 0, activosFuente: null, deudaPorProveedor: [] });

export async function cargarInformativos(): Promise<Map<string, InformativosContrato>> {
  const [edps, compras, servicios, cuotas, contratos, activos] = await Promise.all([
    supabase.from("estados_pago").select("contrato_id, monto_neto, monto_cobrado, estado").in("estado", ["presentado", "aprobado", "facturado"]),
    supabase.from("compras").select("id, contrato_id, proveedor, total, estado_pago").in("estado_pago", ["pendiente", "retenida"]),
    supabase.from("servicios").select("contrato_id, proveedor, total, estado_pago").eq("estado_pago", "pendiente"),
    supabase.from("pagos_factura").select("compra_id, monto").not("fecha_pago", "is", null),
    supabase.from("contratos").select("id, valor_activos_referencia"),
    supabase.from("activos_valar").select("contrato_origen_id, valor").not("contrato_origen_id", "is", null),
  ]);
  /* Los datos de EDP y de compras son la base: si fallan, se avisa. El resto es un extra
     (una migración sin aplicar no debe tumbar el Dashboard). */
  const fallo = edps.error ?? compras.error;
  if (fallo) throw new Error(fallo.message);

  const mapa = new Map<string, InformativosContrato>();
  const de = (id: string) => {
    let f = mapa.get(id);
    if (!f) mapa.set(id, (f = vacio()));
    return f;
  };

  const deber = (contratoId: string, proveedor: string, monto: number) => {
    const f = de(contratoId);
    f.porPagar += monto;
    const previo = f.deudaPorProveedor.find((x) => x.proveedor === proveedor);
    if (previo) previo.monto += monto;
    else f.deudaPorProveedor.push({ proveedor, monto });
  };

  for (const e of edps.data ?? []) {
    de(e.contrato_id as string).porCobrar += Math.max(0, Number(e.monto_neto ?? 0) - Number(e.monto_cobrado ?? 0));
  }

  /* Una factura en cuotas debe lo que falta, no el total: se resta lo ya transferido. */
  const pagado = new Map<string, number>();
  for (const q of cuotas.error ? [] : cuotas.data ?? []) {
    pagado.set(q.compra_id as string, (pagado.get(q.compra_id as string) ?? 0) + Number(q.monto ?? 0));
  }
  for (const c of compras.data ?? []) {
    const debe = Math.max(0, Number(c.total ?? 0) - (pagado.get(c.id as string) ?? 0));
    deber(c.contrato_id as string, (c.proveedor as string | null) ?? "Sin proveedor", debe);
  }
  for (const s of servicios.error ? [] : servicios.data ?? []) {
    deber(s.contrato_id as string, (s.proveedor as string | null) ?? "Sin proveedor", Number(s.total ?? 0));
  }

  /* Activos: primero el detalle; si no hay valores cargados, el valor anotado en el contrato. */
  const deDetalle = new Map<string, number>();
  for (const a of activos.error ? [] : activos.data ?? []) {
    const id = a.contrato_origen_id as string;
    deDetalle.set(id, (deDetalle.get(id) ?? 0) + Number(a.valor ?? 0));
  }
  for (const c of contratos.error ? [] : contratos.data ?? []) {
    const id = c.id as string;
    const detalle = deDetalle.get(id) ?? 0;
    const referencia = Number(c.valor_activos_referencia ?? 0);
    if (detalle > 0) Object.assign(de(id), { activos: detalle, activosFuente: "detalle" });
    else if (referencia > 0) Object.assign(de(id), { activos: referencia, activosFuente: "referencia" });
  }

  return mapa;
}

/** La suma de varios contratos (lo que el Dashboard tiene a la vista). */
export function sumarInformativos(mapa: Map<string, InformativosContrato>, ids: Iterable<string>): InformativosContrato {
  const total = vacio();
  const fuentes = new Set<string>();
  for (const id of ids) {
    const f = mapa.get(id);
    if (!f) continue;
    total.porCobrar += f.porCobrar;
    total.porPagar += f.porPagar;
    total.activos += f.activos;
    for (const d of f.deudaPorProveedor) {
      const previo = total.deudaPorProveedor.find((x) => x.proveedor === d.proveedor);
      if (previo) previo.monto += d.monto;
      else total.deudaPorProveedor.push({ ...d });
    }
    if (f.activosFuente) fuentes.add(f.activosFuente);
  }
  total.deudaPorProveedor.sort((a, b) => b.monto - a.monto);
  total.activosFuente = fuentes.size === 0 ? null : fuentes.size === 1 ? ([...fuentes][0] as "detalle" | "referencia") : "detalle";
  return total;
}
