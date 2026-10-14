-- ════════════════════════════════════════════════════════════════════════════
-- 0080 — El gasto nace cuando se emite la OC (y la lista de Egresos lo muestra)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Control de Gestión mira el gasto del mes, no la caja: una OC emitida hoy se
-- paga a 30 o 60 días, pero es gasto de hoy. Después llega la guía (recibida),
-- la factura (facturada) y el pago (pagada); el monto no se mueve, solo avanza.
--
-- Dos arreglos:
--
--   1. `costos_unificados` (Dashboard, resultado por mes y por categoría)
--      contaba también las OC en borrador y las anuladas. Una OC en borrador
--      todavía no se compromete; una anulada se dejó sin efecto: ninguna pesa.
--
--   2. `egresos_terceros` (la lista de Compras y Servicios) solo mostraba una
--      OC cuando llegaba su factura, así que su "Gasto total" no coincidía con
--      el Dashboard. Ahora cada OC emitida es una fila por mes de costo, con su
--      avance, y las facturas de OC dejan de contarse aparte (ya están dentro
--      de la OC). Las compras al contado y los servicios quedan como estaban.
--
-- `egresos_terceros` gana columnas AL FINAL (create or replace no admite otro
-- orden): orden_id, etapa, neto_recibido, neto_facturado, total_facturado y
-- total_pagado. Valen null / 0 en las compras y servicios.

-- ─── 1. Costo: sin borradores ni anuladas ───────────────────────────────────

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
     LEFT JOIN categorias_costo cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
UNION ALL
 SELECT f.id,
    f.contrato_id,
    f.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    COALESCE(f.fecha_pago, f.periodo) AS fecha,
    f.periodo,
    f.trabajador AS tercero,
    'Finiquito'::text AS detalle,
    'ordinario'::text AS tipo,
    f.total AS neto,
    0::bigint AS iva,
    f.total AS total,
    'pagada'::text AS estado_pago,
    f.anexo_id
   FROM finiquitos f
     LEFT JOIN categorias_costo cat ON cat.empresa_id = f.empresa_id AND cat.id = f.categoria_id
  WHERE f.contrato_id IS NOT NULL;

-- ─── 2. La lista de Egresos: una fila por OC emitida y mes de costo ─────────

create or replace view public.egresos_terceros
with (security_invoker = true) as
select c.id,
       'compra'::text as origen,
       c.contrato_id,
       c.categoria_id,
       coalesce(cat.nombre, 'Sin categoría'::text) as categoria,
       c.proveedor as tercero,
       c.documento,
       c.detalle,
       c.tipo,
       null::text as clase,
       false as recurrente,
       null::text as periodicidad,
       c.fecha,
       null::date as desde,
       null::date as hasta,
       c.neto,
       c.iva,
       c.total,
       c.estado_pago,
       c.creado_en,
       coalesce(c.periodo_control, date_trunc('month', c.fecha::timestamptz)::date) as periodo,
       c.rendido_por,
       c.fecha_pago,
       c.fecha_vencimiento as vencimiento,
       c.fecha_factura,
       c.anexo_id,
       null::text as orden_id,
       null::text as etapa,
       0::bigint as neto_recibido,
       0::bigint as neto_facturado,
       0::bigint as total_facturado,
       0::bigint as total_pagado
  from public.compras c
  left join public.categorias_costo cat on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id
 -- La factura de una OC no se cuenta aparte: ya está dentro de su OC.
 where not (c.orden_id is not null and exists (
         select 1 from public.factura_items fi where fi.empresa_id = c.empresa_id and fi.compra_id = c.id))
union all
select s.id,
       'servicio'::text as origen,
       s.contrato_id,
       s.categoria_id,
       coalesce(cat.nombre, 'Sin categoría'::text) as categoria,
       s.contratista as tercero,
       s.documento,
       s.detalle,
       s.tipo,
       s.tipo_servicio as clase,
       s.recurrente,
       s.periodicidad,
       s.fecha,
       s.desde,
       s.hasta,
       s.neto,
       s.iva,
       s.total,
       s.estado_pago,
       s.creado_en,
       date_trunc('month', s.fecha::timestamptz)::date as periodo,
       null::text as rendido_por,
       s.fecha_pago,
       coalesce(s.fecha_vencimiento, s.fecha_factura + s.plazo_dias::integer) as vencimiento,
       s.fecha_factura,
       s.anexo_id,
       null::text as orden_id,
       null::text as etapa,
       0::bigint as neto_recibido,
       0::bigint as neto_facturado,
       0::bigint as total_facturado,
       0::bigint as total_pagado
  from public.servicios s
  left join public.categorias_costo cat on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id
union all
select x.orden_id as id,
       'orden'::text as origen,
       x.contrato_id,
       x.categoria_id,
       x.categoria,
       x.tercero,
       x.documento,
       x.detalle,
       x.tipo,
       null::text as clase,
       false as recurrente,
       null::text as periodicidad,
       x.fecha,
       null::date as desde,
       null::date as hasta,
       x.neto,
       x.iva,
       x.total,
       case when x.etapa = 'pagada' then 'pagada' else 'pendiente' end as estado_pago,
       x.creado_en,
       x.periodo,
       null::text as rendido_por,
       x.fecha_pago,
       -- El primer vencimiento entre las facturas de la OC que siguen sin pagarse.
       (select min(c.fecha_vencimiento) from public.compras c
         where c.empresa_id = x.empresa_id and c.orden_id = x.orden_id
           and c.estado_pago not in ('pagada', 'anulada')) as vencimiento,
       null::date as fecha_factura,
       x.anexo_id,
       x.orden_id,
       x.etapa,
       x.neto_recibido,
       x.neto_facturado,
       x.total_facturado,
       x.total_pagado
  from (
    select o.empresa_id,
           o.id as orden_id,
           min(o.contrato_id) as contrato_id,
           case when count(distinct d.categoria_id) = 1 then min(d.categoria_id) else null end as categoria_id,
           case when count(distinct d.categoria) = 1 then min(d.categoria) else 'Varias categorías' end as categoria,
           min(o.proveedor) as tercero,
           string_agg(distinct d.factura_numero, ', ') as documento,
           format('OC %s · %s', min(o.numero),
                  case when count(*) = 1 then min(d.descripcion) else count(*) || ' líneas' end) as detalle,
           case when bool_and(d.tipo = 'reembolsable') then 'reembolsable' else 'ordinario' end as tipo,
           min(o.fecha_emision) as fecha,
           sum(d.neto)::bigint as neto,
           sum(d.iva)::bigint as iva,
           sum(d.total)::bigint as total,
           min(o.creado_en) as creado_en,
           d.periodo,
           max(d.fecha_pago) as fecha_pago,
           min(o.anexo_id) as anexo_id,
           coalesce(sum(round(least(a.recibida, a.vigente) * d.precio_unitario)), 0)::bigint as neto_recibido,
           coalesce(sum(round(a.facturada_neta * d.precio_unitario)), 0)::bigint as neto_facturado,
           coalesce(sum(case when a.vigente > 0 then round(d.total * least(a.facturada_neta, a.vigente) / a.vigente) else 0 end), 0)::bigint as total_facturado,
           coalesce(sum(case when d.etapa = 'pagado' then d.total else 0 end), 0)::bigint as total_pagado,
           -- pagada → facturada → parcial (algo facturado) → recibida (algo llegó) → emitida
           case
             when count(*) filter (where d.etapa <> 'pagado') = 0 then 'pagada'
             when coalesce(sum(round(a.facturada_neta * d.precio_unitario)), 0) >= sum(d.neto) and sum(d.neto) > 0 then 'facturada'
             when coalesce(sum(round(a.facturada_neta * d.precio_unitario)), 0) > 0 then 'parcial'
             when coalesce(sum(round(least(a.recibida, a.vigente) * d.precio_unitario)), 0) > 0 then 'recibida'
             else 'emitida'
           end as etapa
      from public.items_detalle d
      join public.ordenes_compra_proveedor o on o.id = d.orden_id
      join public.items_avance a on a.empresa_id = o.empresa_id and a.id = d.id
     where o.estado not in ('borrador', 'anulada')
     group by o.empresa_id, o.id, d.periodo
  ) x;

grant select on public.egresos_terceros to authenticated;

notify pgrst, 'reload schema';
