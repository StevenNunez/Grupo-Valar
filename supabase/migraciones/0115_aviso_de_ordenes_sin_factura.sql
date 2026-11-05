-- ============================================================================
-- 0115 — Aviso de órdenes de compra sin factura (la factura que se olvida)
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0114.
--
-- POR QUÉ. Hay proveedores que entregan y no mandan la factura; la factura se
-- carga a mano en la plataforma, y si nadie se acuerda, el proveedor la cobra
-- vencida (pasó con más de 60 días). Pagos ya lista esas órdenes, pero nunca
-- "vencen" y nadie avisa.
--
-- QUÉ HACE. Cada día hábil, a media mañana (hora de Chile), revisa las órdenes
-- emitidas con saldo sin facturar. Su fecha estimada de cobro es:
--     fecha de emisión + días de crédito del proveedor (o el plazo general de
--     Pagos si el proveedor no tiene)
-- y avisa —campana y push, la misma bandeja de las solicitudes (0105)— a quien
-- tiene el permiso «Emitir órdenes de compra» (Abastecimiento) del contrato:
--   · desde 5 días ANTES de esa fecha («por cumplirse»),
--   · y después, vencidas, hasta que se cargue la factura o se cierre la orden.
-- Es UN aviso por persona (resumen con las más atrasadas), no uno por orden, y
-- se repite cada 2 días mientras quede algo pendiente. Se marca urgente si hay
-- alguna con 30 días o más de atraso.
--
-- La pantalla Pagos hace el mismo cálculo (emisión + crédito) sin tocar la
-- vista `cuentas_por_pagar`, que ya trae `plazo_dias` y la fecha de emisión.
-- ============================================================================

create or replace function public.recordar_facturas_pendientes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ahora timestamp := now() at time zone 'America/Santiago';
  hoy date := (now() at time zone 'America/Santiago')::date;
  plazo_general integer;
  o record;
  p record;
  persona uuid;
  cuantas integer := 0;
  titulo text;
  cuerpo text;
  ejemplos text;
begin
  -- Solo de 8:00 a 20:00 de Chile.
  if extract(hour from ahora) < 8 or extract(hour from ahora) >= 20 then
    return 0;
  end if;

  select plazo_pago_dias into plazo_general from public.parametros_pago where id;
  plazo_general := coalesce(plazo_general, 30);

  create temp table if not exists _facturas_pendientes (
    persona uuid, empresa_id text, orden_id text, orden text, proveedor text,
    cobro date, atraso integer, saldo bigint
  ) on commit drop;
  truncate _facturas_pendientes;

  for o in
    select r.id, r.numero, r.contrato_id, r.proveedor, r.fecha_emision,
           r.neto - r.facturado as saldo,
           oc.empresa_id,
           oc.fecha_emision + coalesce(nullif(pr.dias_credito, 0), plazo_general) as cobro
      from public.ordenes_proveedor_resumen r
      join public.ordenes_compra_proveedor oc on oc.id = r.id
      left join public.proveedores pr on pr.empresa_id = oc.empresa_id and pr.id = oc.proveedor_id
     where r.estado in ('emitida', 'parcial', 'recibida')
       and r.neto > r.facturado
       and oc.fecha_emision + coalesce(nullif(pr.dias_credito, 0), plazo_general) <= hoy + 5
  loop
    insert into _facturas_pendientes
    select quien, o.empresa_id, o.id, o.numero, o.proveedor, o.cobro, hoy - o.cobro, o.saldo
      from public.personas_con_permiso('ordenes.emitir', o.empresa_id, o.contrato_id) as quien;
  end loop;

  for p in
    select persona, empresa_id,
           count(*)::int as ordenes,
           count(*) filter (where atraso > 0)::int as vencidas,
           coalesce(sum(saldo), 0)::bigint as saldo,
           max(atraso) as peor
      from _facturas_pendientes
     group by persona, empresa_id
  loop
    -- Un resumen cada 2 días como máximo por persona.
    continue when exists (
      select 1 from public.notificaciones n
       where n.usuario_id = p.persona and n.tipo = 'facturas.pendientes'
         and n.creado_en > now() - interval '2 days');

    titulo := case
      when p.vencidas > 0 then p.vencidas || ' orden' || case when p.vencidas = 1 then '' else 'es' end
             || ' de compra sin factura ya ' || case when p.vencidas = 1 then 'pasó' else 'pasaron' end || ' su plazo'
      else p.ordenes || ' orden' || case when p.ordenes = 1 then '' else 'es' end
             || ' de compra por cumplir el plazo sin factura'
    end;

    select string_agg(orden || ' ' || left(coalesce(proveedor, ''), 24)
                      || case when atraso > 0 then ' (' || atraso || ' d de atraso)'
                              else ' (cobra el ' || to_char(cobro, 'DD-MM') || ')' end,
                      ' · ' order by atraso desc)
      into ejemplos
      from (select * from _facturas_pendientes f
             where f.persona = p.persona and f.empresa_id = p.empresa_id
             order by atraso desc limit 3) top3;

    cuerpo := ejemplos
      || case when p.ordenes > 3 then ' · y ' || (p.ordenes - 3) || ' más' else '' end
      || ' · saldo sin facturar $' || replace(to_char(p.saldo, 'FM999G999G999G999'), ',', '.')
      || '. Pídele la factura al proveedor y cárgala en Pagos.';

    perform public.avisar_a(
      array[p.persona], p.empresa_id, 'facturas.pendientes', titulo, cuerpo,
      '/abastecimiento/pagos/', 'facturas-pendientes', p.peor >= 30);
    cuantas := cuantas + 1;
  end loop;

  return cuantas;
end $$;

revoke all on function public.recordar_facturas_pendientes() from public, anon, authenticated;

comment on function public.recordar_facturas_pendientes() is
  'Avisa (campana y push) a quien emite órdenes cuáles llevan o están por llevar su plazo de cobro sin factura cargada.';

do $$
begin
  perform cron.unschedule('recordar-facturas-pendientes');
exception when others then null;
end $$;

-- 13:00 UTC = 9:00 o 10:00 en Chile según la hora de verano; lunes a viernes.
select cron.schedule('recordar-facturas-pendientes', '0 13 * * 1-5', $$ select public.recordar_facturas_pendientes(); $$);

notify pgrst, 'reload schema';
