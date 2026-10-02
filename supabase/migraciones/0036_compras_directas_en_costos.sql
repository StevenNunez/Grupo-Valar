-- Incluye las compras ingresadas directamente en Control de Gestión.
-- La vista anterior solo contaba ítems de OC/factura: una compra sin ítems
-- existía en Compras, pero faltaba en el Dashboard y en costos por categoría.
-- No se cuenta dos veces una compra que ya está representada por sus ítems.
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
    c.fecha, date_trunc('month', c.fecha)::date,
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

notify pgrst, 'reload schema';
