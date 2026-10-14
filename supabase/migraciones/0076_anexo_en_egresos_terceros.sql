-- ════════════════════════════════════════════════════════════════════════════
-- 0076 — Compras y Servicios sabe a qué anexo pertenece cada gasto
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un anexo es un contrato aparte (Carpas, por ejemplo). La vista que alimenta
-- Compras y Servicios no traía `anexo_id`, así que esa pantalla no podía
-- filtrar por anexo: todo lo de Carpas aparecía bajo el contrato base.
--
-- Solo se agrega la columna al final; el resto de la vista queda igual a 0072.

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
       c.anexo_id
  from public.compras c
  left join public.categorias_costo cat on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id
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
       s.anexo_id
  from public.servicios s
  left join public.categorias_costo cat on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id;

notify pgrst, 'reload schema';
