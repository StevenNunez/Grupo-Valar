-- ════════════════════════════════════════════════════════════════════════════
-- 0087 · Soporte puede eliminar una OC con TODO lo que cuelga de ella
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy la pantalla se negaba a borrar una OC con ítems recibidos o
-- facturados ("anúlala"). Eso protege a quien opera, pero deja a Soporte sin
-- salida cuando hay que sacar del sistema algo que no corresponde: por ejemplo
-- las OC de un periodo que se empezó a contabilizar después (Misceláneos antes
-- de junio).
--
-- Esta función borra, en una sola transacción:
--   · los ítems de la orden (y con ellos sus líneas de recepción, de factura y de
--     nota de crédito);
--   · las recepciones (guías de despacho) de la orden;
--   · las facturas de proveedor DE ESA ORDEN —con sus notas de crédito—, salvo
--     las que también cubren ítems de OTRA orden: esas se quedan, sin las líneas
--     de esta;
--   · los envíos al proveedor (enlaces) y, por último, la orden.
--
-- Solo Soporte (`cruza_empresas()`), y solo dentro de la empresa en que está
-- trabajando. El Dashboard se recalcula solo: el costo sale de las líneas.
-- Es IRREVERSIBLE; la pantalla lo avisa antes de confirmar.
--
-- Se aplica pegándola entera en el SQL Editor. Es idempotente.

create or replace function public.eliminar_orden_completa(p_orden text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp       text := public.empresa_actual();
  v_numero    text;
  v_compras   text[];
  n_items     int;
  n_recep     int;
  n_facturas  int := 0;
begin
  if not public.cruza_empresas() then
    raise exception 'Solo Soporte puede eliminar una orden que ya tiene recepciones o facturas.';
  end if;

  select numero into v_numero
    from public.ordenes_compra_proveedor
   where empresa_id = v_emp and id = p_orden;
  if not found then
    raise exception 'No se encontró la orden % en esta empresa.', p_orden;
  end if;

  -- Facturas que son SOLO de esta orden.
  select coalesce(array_agg(x.id), '{}') into v_compras
    from (
      select c.id
        from public.compras c
       where c.empresa_id = v_emp and c.orden_id = p_orden
      union
      select fi.compra_id
        from public.factura_items fi
        join public.items_compra i
          on i.empresa_id = fi.empresa_id and i.id = fi.item_id
       where fi.empresa_id = v_emp and i.orden_id = p_orden
    ) x
   where not exists (
           select 1
             from public.factura_items fi
             join public.items_compra i
               on i.empresa_id = fi.empresa_id and i.id = fi.item_id
            where fi.empresa_id = v_emp and fi.compra_id = x.id
              and i.orden_id is distinct from p_orden)
     and not exists (
           select 1 from public.items_compra i
            where i.empresa_id = v_emp and i.compra_id = x.id
              and i.orden_id is distinct from p_orden);

  select count(*) into n_items
    from public.items_compra where empresa_id = v_emp and orden_id = p_orden;
  select count(*) into n_recep
    from public.recepciones where empresa_id = v_emp and orden_id = p_orden;

  delete from public.items_compra where empresa_id = v_emp and orden_id = p_orden;

  if array_length(v_compras, 1) > 0 then
    delete from public.compras where empresa_id = v_emp and id = any (v_compras);
    get diagnostics n_facturas = row_count;
  end if;

  delete from public.recepciones where empresa_id = v_emp and orden_id = p_orden;
  delete from public.ordenes_compra_proveedor where empresa_id = v_emp and id = p_orden;

  return jsonb_build_object(
    'orden', v_numero, 'items', n_items, 'recepciones', n_recep, 'facturas', n_facturas);
end;
$$;

comment on function public.eliminar_orden_completa(text) is
  'Solo Soporte: borra una OC con sus ítems, recepciones y facturas propias. Irreversible (0087).';

revoke all on function public.eliminar_orden_completa(text) from public;
grant execute on function public.eliminar_orden_completa(text) to authenticated;

notify pgrst, 'reload schema';
