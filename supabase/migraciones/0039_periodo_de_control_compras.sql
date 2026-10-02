-- Una factura puede tener fecha de agosto e imputarse al control de septiembre.
-- Se conserva la fecha documental y se separa el mes que alimenta el Dashboard.
alter table public.compras
  add column if not exists periodo_control date;

alter table public.compras
  drop constraint if exists compras_periodo_control_mes_check;
alter table public.compras
  add constraint compras_periodo_control_mes_check
  check (periodo_control is null or extract(day from periodo_control) = 1);

create index if not exists compras_periodo_control_idx
  on public.compras (empresa_id, periodo_control);

create or replace view public.costos_unificados
with (security_invoker = true) as
  select
    d.id, d.contrato_id, d.categoria_id, d.categoria, d.familia,
    d.fecha, d.periodo,
    coalesce(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor') as tercero,
    d.descripcion as detalle,
    d.tipo, d.neto, d.iva, d.total,
    coalesce(d.estado_pago, 'pendiente') as estado_pago
  from public.items_detalle d

  union all

  select
    c.id, c.contrato_id, c.categoria_id,
    coalesce(cat.nombre, 'Sin categoría'), coalesce(cat.familia, 'compras'),
    c.fecha, coalesce(c.periodo_control, date_trunc('month', c.fecha)::date),
    c.proveedor, c.detalle,
    c.tipo, c.neto, c.iva, c.total, c.estado_pago
  from public.compras c
  left join public.categorias_costo cat
    on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id
  where not exists (
    select 1 from public.items_compra i
    where i.empresa_id = c.empresa_id and i.compra_id = c.id
  )

  union all

  select
    s.id, s.contrato_id, s.categoria_id,
    coalesce(cat.nombre, 'Servicios'), coalesce(cat.familia, 'servicios'),
    s.fecha, date_trunc('month', s.fecha)::date,
    s.contratista, s.detalle,
    s.tipo, s.neto, s.iva, s.total,
    s.estado_pago
  from public.servicios s
  left join public.categorias_costo cat
    on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id

  union all

  select
    p.id, p.contrato_id, p.categoria_id,
    coalesce(cat.nombre, 'Personal'), coalesce(cat.familia, 'personal'),
    p.periodo, p.periodo,
    p.faena,
    'Remuneraciones y leyes sociales',
    'ordinario',
    p.costo_total, 0::bigint, p.costo_total,
    'pagada'
  from public.costos_personal p
  left join public.categorias_costo cat
    on cat.empresa_id = p.empresa_id and cat.id = p.categoria_id;

create or replace view public.egresos_terceros
with (security_invoker = true) as
  select
    c.id, 'compra'::text as origen, c.contrato_id, c.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    c.proveedor as tercero, c.documento, c.detalle, c.tipo,
    null::text as clase, false as recurrente, null::text as periodicidad,
    c.fecha, null::date as desde, null::date as hasta,
    c.neto, c.iva, c.total, c.estado_pago, c.creado_en,
    coalesce(c.periodo_control, date_trunc('month', c.fecha)::date) as periodo
  from public.compras c
  left join public.categorias_costo cat
    on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id

  union all

  select
    s.id, 'servicio'::text as origen, s.contrato_id, s.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    s.contratista as tercero, s.documento, s.detalle, s.tipo,
    s.tipo_servicio as clase, s.recurrente, s.periodicidad,
    s.fecha, s.desde, s.hasta,
    s.neto, s.iva, s.total, s.estado_pago, s.creado_en,
    date_trunc('month', s.fecha)::date as periodo
  from public.servicios s
  left join public.categorias_costo cat
    on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id;

notify pgrst, 'reload schema';
