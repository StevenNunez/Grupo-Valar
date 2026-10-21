-- ============================================================================
-- 0099 — Un activo comprado para un contrato cuenta como gasto de ese contrato
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0098.
--
-- LA REGLA (explicada por el usuario el 22-10-2026): una obra adjudicada por
-- $10 M obliga a comprar una camioneta de $5 M. Esos $5 M SON un gasto del
-- contrato —se gastaron en esa obra— y bajan su margen. Pero la camioneta es un
-- activo que se queda en la empresa: también se registra como compra de activo
-- y queda valorizada. Las dos cosas son ciertas a la vez, y ninguna resta ni
-- suma a la otra: la obra conserva su gasto, y los activos de la empresa se
-- valorizan aparte (Oficina Central lo muestra como dato, no como egreso suyo).
--
-- Hasta hoy (0075) un activo quedaba FUERA del costo y del margen del contrato.
-- Eso cambia aquí, en UN solo lugar: `costos_unificados`, de donde cuelgan el
-- resumen mensual, el resultado por anexo, el costo por categoría y el resumen
-- de contratos. En esa vista un activo ahora sale con `tipo = 'ordinario'` (lo
-- que cuenta como costo en todas las pantallas) y una columna nueva,
-- `es_activo`, dice cuáles son activos, para mostrarlos aparte.
--
-- Nada cambia en las compras, órdenes ni servicios: siguen marcados «activo»
-- (la pantalla de Activos y los egresos los reconocen igual).
-- ============================================================================

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
    CASE WHEN d.tipo = 'activo' THEN 'ordinario'::text ELSE d.tipo END AS tipo,
    d.neto,
    d.iva,
    d.total,
    COALESCE(d.estado_pago, 'pendiente'::text) AS estado_pago,
    d.anexo_id,
    (d.tipo = 'activo') AS es_activo
   FROM items_detalle d
  WHERE (d.orden_id IS NOT NULL OR d.compra_id IS NOT NULL OR d.factura_numero IS NOT NULL)
    AND NOT EXISTS ( SELECT 1
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
    CASE WHEN c.tipo = 'activo' THEN 'ordinario'::text ELSE c.tipo END AS tipo,
    c.neto,
    c.iva,
    c.total,
    c.estado_pago,
    c.anexo_id,
    (c.tipo = 'activo') AS es_activo
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
    CASE WHEN s.tipo = 'activo' THEN 'ordinario'::text ELSE s.tipo END AS tipo,
    s.neto,
    s.iva,
    s.total,
    s.estado_pago,
    s.anexo_id,
    (s.tipo = 'activo') AS es_activo
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
    p.anexo_id,
    false AS es_activo
   FROM costos_personal p
     LEFT JOIN categorias_costo cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id;

comment on view public.costos_unificados is
  'Todo lo gastado, línea por línea, con UNA regla de costo. Un activo comprado para un contrato cuenta como gasto del contrato (tipo ordinario) y se distingue por `es_activo`.';

grant select on public.costos_unificados to authenticated;

notify pgrst, 'reload schema';
