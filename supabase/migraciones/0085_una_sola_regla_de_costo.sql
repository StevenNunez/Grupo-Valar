-- ════════════════════════════════════════════════════════════════════════════
-- 0085 — Una sola regla de costo en todas las pantallas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Auditoría previa a la presentación (15-10-2026). El Dashboard sumaba bien
-- ($769,9 M ordinario), pero otras tres cifras no calzaban con él:
--
--   1. `costos_por_categoria` solo traía costos con una categoría asignada:
--      $435 M quedaban fuera (casi todo Personal y compras sin categoría). La
--      composición Compras / Servicios / Personal sumaba $334 M en vez de
--      $770 M. Ahora lo que no tiene categoría entra en una fila propia por
--      contrato y familia ("Sin categoría" / "Personal"), con presupuesto 0.
--
--   2. `contratos_resumen` (costo real, margen y avance de la lista y ficha de
--      cada contrato) seguía con la regla antigua —las facturas— y no la de
--      0080 —la OC emitida—: SA95000016393 mostraba $124,3 M y el Dashboard
--      $137,5 M; el 9500013862, $282,7 M contra $305,6 M. Ahora el costo sale
--      de `costos_unificados`, la misma fuente que el Dashboard, Egresos y las
--      categorías: una sola definición de qué es costo.
--
--   3. Una línea de OC suelta (sin orden, sin compra y sin factura; queda así
--      cuando se borra una OC) contaba como costo con mes en blanco: salía en
--      el total de contrato pero no en ningún mes. No es un gasto de nadie
--      todavía, así que `costos_unificados` la deja fuera.
--
-- Mismas columnas y tipos en las tres vistas: `create or replace` alcanza.

-- ─── 1. costos_unificados: sin líneas sueltas ───────────────────────────────

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


-- ─── 2. contratos_resumen: el costo sale de costos_unificados ───────────────

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
    COALESCE(k.compras, 0::numeric)::bigint AS costo_compras,
    COALESCE(k.servicios, 0::numeric)::bigint AS costo_servicios,
    COALESCE(k.personal, 0::numeric)::bigint AS costo_personal,
    COALESCE(k.reembolsable, 0::numeric)::bigint AS costo_reembolsable,
    COALESCE(k.ordinario, 0::numeric)::bigint AS costo_real,
    COALESCE(fa.facturado, 0::numeric)::bigint AS facturado
   FROM contratos c
     LEFT JOIN ( SELECT u.contrato_id,
            sum(u.neto) FILTER (WHERE u.tipo = 'ordinario'::text) AS ordinario,
            sum(u.neto) FILTER (WHERE u.tipo = 'ordinario'::text AND u.familia = 'compras'::text) AS compras,
            sum(u.neto) FILTER (WHERE u.tipo = 'ordinario'::text AND u.familia = 'servicios'::text) AS servicios,
            sum(u.neto) FILTER (WHERE u.tipo = 'ordinario'::text AND u.familia = 'personal'::text) AS personal,
            sum(u.neto) FILTER (WHERE u.tipo = 'reembolsable'::text) AS reembolsable
           FROM costos_unificados u
          GROUP BY u.contrato_id) k ON k.contrato_id = c.id
     LEFT JOIN ( SELECT facturas.contrato_id,
            sum(facturas.neto) AS facturado
           FROM facturas
          GROUP BY facturas.contrato_id) fa ON fa.contrato_id = c.id;

-- ─── 3. costos_por_categoria: también lo que no tiene categoría ─────────────

create or replace view public.costos_por_categoria
with (security_invoker = true) as
  select
    cat.id as categoria_id,
    cat.contrato_id,
    cat.nombre as categoria,
    cat.familia,
    cat.afecta_iva,
    cat.presupuesto_mensual,
    cu.periodo,
    coalesce(sum(cu.neto), 0)::bigint as real,
    coalesce(sum(cu.neto) filter (where cu.tipo = 'ordinario'), 0)::bigint
      as real_ordinario,
    coalesce(sum(cu.neto) filter (where cu.tipo = 'reembolsable'), 0)::bigint
      as real_reembolsable,
    (coalesce(sum(cu.neto), 0) - cat.presupuesto_mensual)::bigint as desviacion
  from public.categorias_costo cat
  left join public.costos_unificados cu on cu.categoria_id = cat.id
  group by cat.id, cat.contrato_id, cat.nombre, cat.familia, cat.afecta_iva,
           cat.presupuesto_mensual, cu.periodo
union all
  -- Lo que no calza con ninguna categoría del contrato: una fila por contrato,
  -- familia y mes, para que el total por categoría sea el total del costo.
  select
    'sin-categoria-' || u.familia as categoria_id,
    u.contrato_id,
    case u.familia when 'personal' then 'Personal' else 'Sin categoría' end as categoria,
    u.familia,
    true as afecta_iva,
    0::bigint as presupuesto_mensual,
    u.periodo,
    coalesce(sum(u.neto), 0)::bigint as real,
    coalesce(sum(u.neto) filter (where u.tipo = 'ordinario'), 0)::bigint as real_ordinario,
    coalesce(sum(u.neto) filter (where u.tipo = 'reembolsable'), 0)::bigint as real_reembolsable,
    coalesce(sum(u.neto), 0)::bigint as desviacion
  from public.costos_unificados u
  where not exists (select 1 from public.categorias_costo c2 where c2.id = u.categoria_id)
  group by u.familia, u.contrato_id, u.periodo;

notify pgrst, 'reload schema';
