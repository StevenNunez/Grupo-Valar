-- ============================================================================
-- 0123 — La solicitud avanza y se cierra sola con la recepción, y los avisos
--        llevan a la solicitud
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0122.
--
-- LO QUE PASABA (16-11-2026):
--
--   1. UNA SOLICITUD NO TERMINABA NUNCA. Al generar la orden quedaba «En
--      compra» y ahí se quedaba para siempre: nada la pasaba a «Recepción
--      parcial» ni a «Cerrada», aunque todas sus órdenes ya estuvieran
--      recibidas. En la base había solicitudes con todo entregado que seguían
--      abiertas.
--
--   2. LOS AVISOS NO LLEVABAN A NINGUNA PARTE. Todos apuntaban a la lista de
--      solicitudes, sin decir cuál: al tocarlos se abría la lista (o nada, si ya
--      se estaba en ella) y había que buscar la solicitud a mano.
--
-- LO QUE CAMBIA:
--
--   1. El estado de la solicitud sigue a sus órdenes de compra:
--        · algo llegó (una orden con recepción parcial o completa) → «Recepción parcial»
--        · todo lo pedido está comprado y todas sus órdenes están recibidas o
--          cerradas → «Cerrada», y se le avisa a quien la pidió.
--      Si una recepción se deshace, vuelve atrás. Una solicitud cerrada A MANO
--      (con motivo: se compró por fuera, ya no se necesita) no se toca.
--
--   2. Cada aviso de una solicitud lleva su dirección: la plataforma abre el
--      expediente de ESA solicitud. Vale también para los avisos ya enviados.
-- ============================================================================

-- ─── 1. El estado de la solicitud sigue a sus órdenes ───────────────────────

create or replace function public.recalcular_estado_solped(p_empresa text, p_solped text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  ordenes integer;
  sin_terminar integer;
  con_llegadas integer;
  items_sin_comprar integer;
  nuevo text;
begin
  if p_solped is null then return; end if;

  select so.id, so.numero, so.estado, so.motivo_cierre, so.solicitante_id, so.empresa_id
    into s
    from public.solped so
   where so.empresa_id = p_empresa and so.id = p_solped;

  /* Solo desde que hay compra. Antes manda el flujo de aprobación y cotización;
     y una solicitud cerrada a mano (con motivo) ya la terminó una persona. */
  if s.id is null
     or s.estado not in ('en-compra', 'parcial', 'cerrada')
     or (s.estado = 'cerrada' and s.motivo_cierre is not null) then
    return;
  end if;

  select count(*),
         count(*) filter (where o.estado not in ('recibida', 'cerrada')),
         count(*) filter (where o.estado in ('parcial', 'recibida', 'cerrada'))
    into ordenes, sin_terminar, con_llegadas
    from public.ordenes_compra_proveedor o
   where o.empresa_id = p_empresa and o.solped_id = p_solped and o.estado <> 'anulada';

  /* Lo pedido que todavía no está en ninguna orden vigente. */
  select count(*) into items_sin_comprar
    from public.solped_items i
   where i.empresa_id = p_empresa and i.solped_id = p_solped
     and i.cantidad > coalesce((
       select sum(ic.cantidad)
         from public.items_compra ic
         join public.ordenes_compra_proveedor o
           on o.empresa_id = ic.empresa_id and o.id = ic.orden_id
        where ic.empresa_id = i.empresa_id and ic.solped_item_id = i.id
          and o.estado <> 'anulada'), 0);

  nuevo := case
    when ordenes > 0 and sin_terminar = 0 and items_sin_comprar = 0 then 'cerrada'
    when con_llegadas > 0 then 'parcial'
    else 'en-compra'
  end;

  if nuevo = s.estado then return; end if;

  update public.solped set estado = nuevo where empresa_id = p_empresa and id = p_solped;

  if nuevo = 'cerrada' and s.solicitante_id is not null then
    perform public.avisar_a(array[s.solicitante_id], s.empresa_id, 'solped.recibida',
      'Llegó todo lo de tu solicitud · ' || s.numero,
      'Todas sus órdenes de compra están recibidas. La solicitud quedó cerrada.',
      '/abastecimiento/solped/', s.id, false);
  end if;
end $$;

revoke all on function public.recalcular_estado_solped(text, text) from public, anon, authenticated;

comment on function public.recalcular_estado_solped(text, text) is
  'Deja la solicitud en «en compra», «recepción parcial» o «cerrada» según el estado de sus órdenes de compra (0123). No toca una cerrada a mano.';

create or replace function public.orden_mueve_solped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.solped_id is not null then
    perform public.recalcular_estado_solped(old.empresa_id, old.solped_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.solped_id is not null
     and (tg_op = 'INSERT' or new.solped_id is distinct from old.solped_id or new.estado is distinct from old.estado) then
    perform public.recalcular_estado_solped(new.empresa_id, new.solped_id);
  end if;
  return coalesce(new, old);
exception when others then
  -- El estado de la solicitud es un derivado: nunca debe impedir guardar la orden.
  raise warning 'orden_mueve_solped: %', sqlerrm;
  return coalesce(new, old);
end $$;

drop trigger if exists ordenes_mueven_solped on public.ordenes_compra_proveedor;
create trigger ordenes_mueven_solped
  after insert or delete or update of estado, solped_id on public.ordenes_compra_proveedor
  for each row execute function public.orden_mueve_solped();

-- ─── 2. Cada aviso de una solicitud lleva a ESA solicitud ───────────────────
-- En la fila y no en cada función que avisa: así vale para los avisos de hoy,
-- los recordatorios y los que se agreguen después, y también para el push.

create or replace function public.aviso_de_solped_con_direccion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo like 'solped.%' and new.referencia is not null and new.url = '/abastecimiento/solped/' then
    new.url := '/abastecimiento/solped/?solped=' || new.referencia;
  end if;
  return new;
end $$;

drop trigger if exists notificaciones_direccion_de_solped on public.notificaciones;
create trigger notificaciones_direccion_de_solped
  before insert on public.notificaciones
  for each row execute function public.aviso_de_solped_con_direccion();

-- Los avisos que ya están en las bandejas.
update public.notificaciones
   set url = '/abastecimiento/solped/?solped=' || referencia
 where tipo like 'solped.%' and referencia is not null and url = '/abastecimiento/solped/';

-- ─── 3. Las solicitudes que ya tenían todo recibido ─────────────────────────
-- Se ponen al día una vez. Va DESPUÉS del trigger de la dirección, para que el
-- aviso «llegó todo» de las que se cierren acá ya salga con su enlace.

select public.recalcular_estado_solped(so.empresa_id, so.id)
  from public.solped so
 where so.estado in ('en-compra', 'parcial');

notify pgrst, 'reload schema';
