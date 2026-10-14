-- ════════════════════════════════════════════════════════════════════════════
-- 0078 — Una línea de OC puede costar en un mes distinto al de la orden
-- ════════════════════════════════════════════════════════════════════════════
--
-- Regla de 0049: el costo de una OC cuenta en el mes de la OC. Sirve para una
-- compra normal, pero no para un servicio recurrente que se factura cada mes
-- bajo el mismo número de OC (arriendo de contenedores, de equipos): todo el
-- costo caía en el primer mes.
--
-- La línea gana un mes de costo propio, opcional. Vacío = manda el mes de la OC,
-- como hasta ahora. La vista `items_detalle` solo cambia en esa condición:
-- mismas columnas y tipos que 0059, así `create or replace` alcanza.

alter table public.items_compra add column if not exists periodo_control date;

comment on column public.items_compra.periodo_control is
  'Mes (primer día) en que cuenta el costo de esta línea. Vacío = el mes de emisión de la OC.';

create or replace view public.items_detalle
with (security_invoker = true) as
  select
    i.id,
    i.contrato_id,
    i.orden_id,
    i.compra_id,
    i.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    coalesce(cat.familia, 'compras') as familia,
    o.numero as orden_numero,
    o.proveedor as orden_proveedor,
    fac.proveedor as factura_proveedor,
    fac.documentos as factura_numero,
    fac.estado_pago,
    fac.fecha_pago,
    case
      when o.id is not null then o.fecha_emision
      else coalesce(fac.fecha, i.fecha_recepcion)
    end as fecha,
    case
      when o.id is not null then coalesce(date_trunc('month', i.periodo_control)::date, date_trunc('month', o.fecha_emision)::date)
      else coalesce(fac.periodo_control, date_trunc('month', coalesce(fac.fecha, i.fecha_recepcion))::date)
    end as periodo,
    i.descripcion,
    a.vigente::numeric(12, 2) as cantidad,
    i.unidad,
    i.precio_unitario,
    round(a.vigente * i.precio_unitario)::bigint as neto,
    case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end as iva,
    round(a.vigente * i.precio_unitario)::bigint
      + case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end as total,
    i.tipo,
    i.estado_recepcion,
    i.cantidad_recibida,
    i.fecha_recepcion,
    case
      when a.vigente > 0 and a.facturada_neta >= a.vigente and fac.estado_pago = 'pagada' then 'pagado'
      when a.vigente > 0 and a.facturada_neta >= a.vigente then 'facturado'
      when a.recibida >= a.vigente and a.recibida > 0 then 'recibido'
      when a.recibida > 0 then 'parcial'
      else 'pendiente'
    end as etapa,
    coalesce(o.anexo_id, fac.anexo_id) as anexo_id
  from public.items_compra i
  join public.items_avance a on a.empresa_id = i.empresa_id and a.id = i.id
  left join public.categorias_costo cat on cat.empresa_id = i.empresa_id and cat.id = i.categoria_id
  left join public.ordenes_compra_proveedor o on o.empresa_id = i.empresa_id and o.id = i.orden_id
  left join lateral (
    select
      string_agg(distinct c.documento, ', ') as documentos,
      max(c.proveedor) as proveedor,
      case when bool_and(c.estado_pago = 'pagada') then 'pagada' else min(c.estado_pago) end as estado_pago,
      max(c.fecha_pago) as fecha_pago,
      min(c.fecha) as fecha,
      min(c.periodo_control) as periodo_control,
      min(c.anexo_id) as anexo_id
    from public.factura_items fi
    join public.compras c on c.empresa_id = fi.empresa_id and c.id = fi.compra_id
    where fi.empresa_id = i.empresa_id and fi.item_id = i.id
    having count(*) > 0
  ) fac on true;

notify pgrst, 'reload schema';
