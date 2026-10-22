-- ============================================================================
-- 0101 — Corregir qué líneas de la orden cubre una factura ya registrada
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0100.
--
-- Una OC tiene muchas facturas, cada una con SUS líneas. Las OC pasadas desde
-- Drive se cargaron con una sola factura que cubría la orden entera (p. ej.
-- OC22-001022 de Morosmin: 20 líneas, factura 14504). Para separarla en las
-- facturas reales hay que poder cambiar las líneas, el N° y el monto de una
-- factura sin borrarla (se perdería su PDF adjunto).
--
-- Se corrige en el mismo lugar —misma fila de `compras`, mismos adjuntos— y solo
-- mientras no haya nada que se desordene: sin pagos (ni en cuotas) y sin notas
-- de crédito contra ella. Todo o nada.
-- ============================================================================

create or replace function public.corregir_factura_oc(
  p_compra_id text,
  p_documento text,
  p_fecha_factura date,
  p_vencimiento date,
  p_neto bigint,
  p_iva bigint,
  p_lineas jsonb
)
returns text
language plpgsql
set search_path = public
as $$
declare
  c record;
  o record;
  primera record;
begin
  select * into c from public.compras
   where empresa_id = public.empresa_actual() and id = p_compra_id and orden_id is not null;
  if not found then
    raise exception 'No se encontró la factura % de una orden de compra.', p_compra_id;
  end if;
  select * into o from public.ordenes_compra_proveedor
   where empresa_id = c.empresa_id and id = c.orden_id;

  if btrim(coalesce(p_documento, '')) = '' then
    raise exception 'Falta el número de la factura.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric) where x.cantidad > 0) then
    raise exception 'Marca qué líneas de la orden cubre la factura.' using errcode = 'check_violation';
  end if;
  if c.estado_pago = 'pagada' or coalesce(c.pagado, 0) > 0
     or exists (select 1 from public.pagos_factura p where p.empresa_id = c.empresa_id and p.compra_id = c.id) then
    raise exception 'Esta factura ya tiene pagos registrados: no se puede cambiar lo que cubre.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.notas_credito n where n.empresa_id = c.empresa_id and n.compra_id = c.id) then
    raise exception 'Esta factura tiene una nota de crédito: no se puede cambiar lo que cubre.' using errcode = 'check_violation';
  end if;
  -- Solo líneas de ESTA orden.
  if exists (
    select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
     where x.cantidad > 0
       and not exists (select 1 from public.items_compra i
                        where i.empresa_id = c.empresa_id and i.id = x.item_id and i.orden_id = c.orden_id)
  ) then
    raise exception 'Hay líneas que no son de esta orden.' using errcode = 'check_violation';
  end if;

  select i.categoria_id, i.tipo into primera
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
    join public.items_compra i on i.empresa_id = c.empresa_id and i.id = x.item_id
   where x.cantidad > 0
   limit 1;

  -- Primero se sueltan las líneas viejas; así lo que se vuelve a marcar cuenta una sola vez.
  delete from public.factura_items where empresa_id = c.empresa_id and compra_id = c.id;

  update public.compras
     set documento = btrim(p_documento),
         detalle = format('Factura %s · %s', btrim(p_documento), o.numero),
         categoria_id = coalesce(primera.categoria_id, c.categoria_id),
         tipo = coalesce(primera.tipo, c.tipo),
         neto = p_neto,
         iva = coalesce(p_iva, 0),
         fecha = date_trunc('month', p_fecha_factura)::date,
         periodo_control = date_trunc('month', p_fecha_factura)::date,
         fecha_factura = p_fecha_factura,
         fecha_vencimiento = p_vencimiento
   where empresa_id = c.empresa_id and id = c.id;

  insert into public.factura_items (compra_id, item_id, contrato_id, cantidad)
  select c.id, x.item_id, '', x.cantidad
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0;

  return c.id;
end;
$$;

grant execute on function public.corregir_factura_oc(text, text, date, date, bigint, bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
