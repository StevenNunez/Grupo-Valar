-- ============================================================================
-- 0049 — El costo de una OC cuenta en el mes de la OC
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- LO QUE HABÍA (0007): la fecha de un ítem era la de su factura; mientras no
-- llegara, la de recepción; y si tampoco, la de emisión de la orden. O sea que
-- una OC de septiembre facturada en octubre sacaba el costo de septiembre y lo
-- ponía en octubre al registrar la factura: el resultado de un mes ya cerrado
-- cambiaba solo.
--
-- LA REGLA DE VALAR (05-10-2026): el costo es del mes en que se emite la OC.
-- La factura dice cuándo se paga, no a qué mes pertenece el gasto. Los ítems
-- sin OC (una compra directa con varias líneas) siguen al mes de control de su
-- factura, igual que una compra suelta desde la 0039.
--
-- Mismas columnas y en el mismo orden: `create or replace` no deja cambiar la
-- forma de una vista de la que cuelgan otras (costos_unificados y las que
-- dependen de ella). Solo cambian `fecha` y `periodo`, y las uniones ahora
-- también exigen la misma empresa.
-- ============================================================================

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
    c.proveedor as factura_proveedor,
    c.documento as factura_numero,
    c.estado_pago,
    c.fecha_pago,
    -- Con OC, manda la OC. Sin OC, la factura; y si aún no hay, la recepción.
    case
      when o.id is not null then o.fecha_emision
      else coalesce(c.fecha, i.fecha_recepcion)
    end as fecha,
    case
      when o.id is not null then date_trunc('month', o.fecha_emision)::date
      else coalesce(c.periodo_control, date_trunc('month', coalesce(c.fecha, i.fecha_recepcion))::date)
    end as periodo,
    i.descripcion,
    i.cantidad,
    i.unidad,
    i.precio_unitario,
    i.neto,
    i.iva,
    (i.neto + i.iva) as total,
    i.tipo,
    i.estado_recepcion,
    i.cantidad_recibida,
    i.fecha_recepcion,
    case
      when i.compra_id is not null and c.estado_pago = 'pagada' then 'pagado'
      when i.compra_id is not null then 'facturado'
      when i.estado_recepcion = 'recibido' then 'recibido'
      when i.estado_recepcion = 'parcial' then 'parcial'
      else 'pendiente'
    end as etapa
  from public.items_compra i
  left join public.categorias_costo cat
    on cat.empresa_id = i.empresa_id and cat.id = i.categoria_id
  left join public.ordenes_compra_proveedor o
    on o.empresa_id = i.empresa_id and o.id = i.orden_id
  left join public.compras c
    on c.empresa_id = i.empresa_id and c.id = i.compra_id;

notify pgrst, 'reload schema';
