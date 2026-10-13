-- ============================================================================
-- 0072 — Vencimiento y pago de los servicios
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0071.
--
-- POR QUÉ: un servicio (el arriendo de torres, por ejemplo) se registra como
-- gasto del mes cuando llega el estado de pago, pero la factura llega después
-- y se paga a 30 días. Sin fechas de factura y vencimiento no había forma de
-- saber qué está por pagar ni qué ya venció.
--
-- QUÉ: el gasto sigue contando en el mes de `servicios.fecha` (nada del
-- Dashboard cambia). Se agregan la fecha de la factura, el plazo, el
-- vencimiento y la fecha de pago, y la vista de egresos las expone.
-- ============================================================================

alter table public.servicios add column if not exists fecha_factura date;
alter table public.servicios add column if not exists plazo_dias smallint not null default 30
  check (plazo_dias >= 0);
alter table public.servicios add column if not exists fecha_vencimiento date;
alter table public.servicios add column if not exists fecha_pago date;

comment on column public.servicios.fecha_factura is
  'La fecha impresa en la factura del contratista. De acá corre el plazo; `fecha` es el mes del gasto.';
comment on column public.servicios.fecha_vencimiento is
  'Cuándo vence el pago: fecha de la factura + plazo, o la que se escriba.';

create index if not exists servicios_vencimiento_idx
  on public.servicios (fecha_vencimiento) where estado_pago <> 'pagada';

-- Columnas nuevas al final: create or replace no admite otras.
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
       c.fecha_factura
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
       s.fecha_factura
  from public.servicios s
  left join public.categorias_costo cat on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id;

notify pgrst, 'reload schema';
