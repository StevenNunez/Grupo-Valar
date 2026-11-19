-- 0124 · El número de la solicitud de cotización (SC-0001) es correlativo de
-- toda la empresa, no de cada SOLPED.
--
-- Hasta ahora lo calculaba la pantalla mirando solo las cotizaciones de la
-- SOLPED abierta: cada SOLPED partía en SC-0001, y un proveedor al que se le
-- pedía en dos solicitudes distintas recibía dos "SC-0001". Ese número existe
-- justamente para que el proveedor lo mencione al responder, así que no puede
-- repetirse.
--
-- Ahora lo decide la base, dentro de la misma transacción que crea la
-- cotización y con un candado por empresa: dos personas pidiendo a la vez no
-- sacan el mismo número. Cada empresa (Valar, demo) lleva su propio correlativo.
--
-- Los números ya enviados no se tocan (el proveedor los tiene en su correo); el
-- siguiente parte del mayor SC que exista hoy en la empresa. Por esas
-- repeticiones antiguas no se agrega un índice único sobre `numero`.

create or replace function public.pedir_cotizacion(p_cotizacion jsonb, p_items jsonb)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_solped text := p_cotizacion->>'solped_id';
  v_empresa text := public.empresa_actual();
  prefijo text;
  siguiente integer;
  v_id text;
  v_numero text;
  item jsonb;
  n integer := 0;
begin
  if v_solped is null or coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Elige al menos un ítem para pedirle a este proveedor.';
  end if;

  perform pg_advisory_xact_lock(hashtext('cot:' || coalesce(v_empresa, '') || ':' || v_solped));

  if exists (
    select 1 from public.cotizaciones c
     where c.solped_id = v_solped and c.proveedor_id = p_cotizacion->>'proveedor_id'
  ) then
    raise exception 'Ya se le pidió cotización a este proveedor para esta solicitud.';
  end if;

  -- El código interno sigue siendo por SOLPED: COT-<solped>-NN.
  prefijo := 'COT-' || v_solped || '-';
  select coalesce(max(substring(c.id from length(prefijo) + 1)::integer), 0) + 1
    into siguiente
    from public.cotizaciones c
   where c.solped_id = v_solped
     and c.id like prefijo || '%'
     and substring(c.id from length(prefijo) + 1) ~ '^\d+$';
  v_id := prefijo || lpad(siguiente::text, 2, '0');

  -- El número que ve el proveedor: el siguiente SC de toda la empresa.
  perform pg_advisory_xact_lock(hashtext('sc:' || coalesce(v_empresa, '')));
  select 'SC-' || lpad((coalesce(max(substring(c.numero from 4)::integer), 0) + 1)::text, 4, '0')
    into v_numero
    from public.cotizaciones c
   where c.empresa_id = v_empresa
     and c.numero ~ '^SC-\d+$';

  perform interno.insertar_fila('cotizaciones',
    p_cotizacion || jsonb_build_object('id', v_id, 'numero', v_numero));

  for item in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    perform interno.insertar_fila('cotizacion_items',
      item || jsonb_build_object('id', v_id || '-' || lpad(n::text, 3, '0'), 'cotizacion_id', v_id));
  end loop;

  return v_id;
end;
$$;

comment on column public.cotizaciones.numero is
  'Correlativo de la solicitud de cotización de toda la empresa: SC-0001. Lo asigna pedir_cotizacion (0124). Es lo que se imprime y lo que el proveedor menciona al responder.';

revoke all on function public.pedir_cotizacion(jsonb, jsonb) from public, anon;
grant execute on function public.pedir_cotizacion(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
