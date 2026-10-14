-- ════════════════════════════════════════════════════════════════════════════
-- 0082 — Los finiquitos no son costo mensual: son informativos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pedido del 14-10-2026: un finiquito no se cuenta como costo del mes ni del
-- contrato. Se sigue registrando (con su documento y la reserva de derechos)
-- porque sirve para el cierre del contrato, pero ya no entra en el Dashboard,
-- ni en el resultado por mes, categoría o anexo, ni en el costo acumulado del
-- contrato. Antes (0063) sumaba al costo de personal en el mes de pago.
--
-- Mismas columnas y tipos que 0077 y 0080: create or replace alcanza.

create or replace view public.contratos_resumen
with (security_invoker = true) as
SELECT c.id,
    c.nombre,
    c.cliente,
    c.faena,
    c.avance,
        CASE
            WHEN c.moneda = 'UF'::text AND c.monto_uf IS NOT NULL AND uf_hoy() IS NOT NULL THEN round(c.monto_uf * uf_hoy())::bigint
            ELSE c.presupuesto
        END AS presupuesto,
    c.estado,
    c.termino,
    COALESCE(co.ordinario, 0::numeric)::bigint AS costo_compras,
    COALESCE(sv.ordinario, 0::numeric)::bigint AS costo_servicios,
    COALESCE(pe.personal, 0::numeric)::bigint AS costo_personal,
    (COALESCE(co.reembolsable, 0::numeric) + COALESCE(sv.reembolsable, 0::numeric))::bigint AS costo_reembolsable,
    (COALESCE(co.ordinario, 0::numeric) + COALESCE(sv.ordinario, 0::numeric) + COALESCE(pe.personal, 0::numeric))::bigint AS costo_real,
    COALESCE(fa.facturado, 0::numeric)::bigint AS facturado
   FROM contratos c
     LEFT JOIN ( SELECT compras.contrato_id,
            sum(compras.neto) FILTER (WHERE compras.tipo = 'ordinario'::text) AS ordinario,
            sum(compras.neto) FILTER (WHERE compras.tipo = 'reembolsable'::text) AS reembolsable
           FROM compras
          WHERE compras.estado_pago <> 'anulada'::text
          GROUP BY compras.contrato_id) co ON co.contrato_id = c.id
     LEFT JOIN ( SELECT servicios.contrato_id,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'ordinario'::text) AS ordinario,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'reembolsable'::text) AS reembolsable
           FROM servicios
          WHERE servicios.estado_pago <> 'anulada'::text
          GROUP BY servicios.contrato_id) sv ON sv.contrato_id = c.id
     LEFT JOIN ( SELECT costos_personal.contrato_id,
            sum(costos_personal.costo_total) AS personal
           FROM costos_personal
          GROUP BY costos_personal.contrato_id) pe ON pe.contrato_id = c.id
     LEFT JOIN ( SELECT facturas.contrato_id,
            sum(facturas.neto) AS facturado
           FROM facturas
          GROUP BY facturas.contrato_id) fa ON fa.contrato_id = c.id;

create or replace view public.costos_unificados
with (security_invoker = true) as
SELECT d.id,
    d.contrato_id,
    d.categoria_id,
    d.categoria,
    d.familia,
    d.fecha,
    d.periodo,
    COALESCE(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor'::text) AS tercero,
    d.descripcion AS detalle,
    d.tipo,
    d.neto,
    d.iva,
    d.total,
    COALESCE(d.estado_pago, 'pendiente'::text) AS estado_pago,
    d.anexo_id
   FROM items_detalle d
  WHERE NOT EXISTS ( SELECT 1
           FROM ordenes_compra_proveedor oc
          WHERE oc.id = d.orden_id AND oc.estado IN ('borrador', 'anulada'))
UNION ALL
 SELECT c.id,
    c.contrato_id,
    c.categoria_id,
    COALESCE(cat.nombre, 'Sin categoría'::text) AS categoria,
    COALESCE(cat.familia, 'compras'::text) AS familia,
    c.fecha,
    COALESCE(c.periodo_control, date_trunc('month'::text, c.fecha::timestamp with time zone)::date) AS periodo,
    c.proveedor AS tercero,
    c.detalle,
    c.tipo,
    c.neto,
    c.iva,
    c.total,
    c.estado_pago,
    c.anexo_id
   FROM compras c
     LEFT JOIN categorias_costo cat ON cat.empresa_id = c.empresa_id AND cat.id = c.categoria_id
  WHERE c.estado_pago <> 'anulada'::text
    AND NOT (EXISTS ( SELECT 1
           FROM items_compra i
          WHERE i.empresa_id = c.empresa_id AND i.compra_id = c.id)) AND NOT (EXISTS ( SELECT 1
           FROM factura_items fi
          WHERE fi.empresa_id = c.empresa_id AND fi.compra_id = c.id))
UNION ALL
 SELECT s.id,
    s.contrato_id,
    s.categoria_id,
    COALESCE(cat.nombre, 'Servicios'::text) AS categoria,
    COALESCE(cat.familia, 'servicios'::text) AS familia,
    s.fecha,
    date_trunc('month'::text, s.fecha::timestamp with time zone)::date AS periodo,
    s.contratista AS tercero,
    s.detalle,
    s.tipo,
    s.neto,
    s.iva,
    s.total,
    s.estado_pago,
    s.anexo_id
   FROM servicios s
     LEFT JOIN categorias_costo cat ON cat.empresa_id = s.empresa_id AND cat.id = s.categoria_id
  WHERE s.estado_pago <> 'anulada'::text
UNION ALL
 SELECT p.id,
    p.contrato_id,
    p.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    p.periodo AS fecha,
    p.periodo,
    p.faena AS tercero,
    'Remuneraciones y leyes sociales'::text AS detalle,
    'ordinario'::text AS tipo,
    p.costo_total AS neto,
    0::bigint AS iva,
    p.costo_total AS total,
    'pagada'::text AS estado_pago,
    p.anexo_id
   FROM costos_personal p
     LEFT JOIN categorias_costo cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id;

notify pgrst, 'reload schema';
