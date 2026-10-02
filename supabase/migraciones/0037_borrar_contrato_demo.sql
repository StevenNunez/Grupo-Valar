-- Borra un contrato de prueba y todos sus movimientos en una sola transacción.
-- La misma función permite revisar primero el alcance con p_eliminar = false.
-- Solo una sesión de la empresa demo con permiso contratos.editar puede usarla.
create or replace function public.borrar_contrato_demo(
  p_contrato_id text,
  p_eliminar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tabla text;
  cantidad bigint;
  total bigint := 1;
  resumen jsonb := '{}'::jsonb;
  adjuntos bigint;
begin
  if auth.uid() is null
     or public.empresa_actual() is distinct from 'demo'
     or not public.tiene_permiso('contratos.editar') then
    raise exception 'Solo una cuenta autorizada de demo puede borrar contratos de prueba.'
      using errcode = '42501';
  end if;

  if p_contrato_id is null or btrim(p_contrato_id) = '' then
    raise exception 'Indica el contrato que quieres borrar.' using errcode = '22023';
  end if;

  if coalesce(p_eliminar, false) then
    perform 1 from public.contratos
     where empresa_id = 'demo' and id = p_contrato_id for update;
  else
    perform 1 from public.contratos
     where empresa_id = 'demo' and id = p_contrato_id;
  end if;
  if not found then
    raise exception 'Ese contrato no existe en demo.' using errcode = 'P0002';
  end if;

  -- Estas tablas tienen contrato_id propio. Se nombran explícitamente para
  -- excluir maestros compartidos, cuentas, UF y cualquier dato de Valar.
  foreach tabla in array array[
    'items_compra', 'facturas', 'ordenes_compra', 'compras', 'servicios',
    'costos_personal', 'ordenes_compra_proveedor', 'estados_pago', 'solped',
    'campos_contrato', 'anexos', 'categorias_costo'
  ] loop
    execute format('select count(*) from public.%I where empresa_id = $1 and contrato_id = $2', tabla)
      into cantidad using 'demo', p_contrato_id;
    resumen := resumen || jsonb_build_object(tabla, cantidad);
    total := total + cantidad;
  end loop;

  select count(*) into cantidad
    from public.solped_items i
    join public.solped s on s.empresa_id = i.empresa_id and s.id = i.solped_id
   where s.empresa_id = 'demo' and s.contrato_id = p_contrato_id;
  resumen := resumen || jsonb_build_object('solped_items', cantidad);
  total := total + cantidad;

  select count(*) into cantidad
    from public.cotizaciones c
    join public.solped s on s.empresa_id = c.empresa_id and s.id = c.solped_id
   where s.empresa_id = 'demo' and s.contrato_id = p_contrato_id;
  resumen := resumen || jsonb_build_object('cotizaciones', cantidad);
  total := total + cantidad;

  select count(*) into cantidad
    from public.cotizacion_items i
    join public.cotizaciones c on c.empresa_id = i.empresa_id and c.id = i.cotizacion_id
    join public.solped s on s.empresa_id = c.empresa_id and s.id = c.solped_id
   where s.empresa_id = 'demo' and s.contrato_id = p_contrato_id;
  resumen := resumen || jsonb_build_object('cotizacion_items', cantidad);
  total := total + cantidad;

  select count(*) into cantidad
    from public.aprobaciones a
   where a.empresa_id = 'demo' and (
     (a.documento = 'solped' and exists (
       select 1 from public.solped s
        where s.empresa_id = a.empresa_id and s.id = a.registro_id
          and s.contrato_id = p_contrato_id
     ))
     or (a.documento = 'compra' and (
       exists (select 1 from public.compras c
                where c.empresa_id = a.empresa_id and c.id = a.registro_id
                  and c.contrato_id = p_contrato_id)
       or exists (select 1 from public.ordenes_compra_proveedor o
                   where o.empresa_id = a.empresa_id and o.id = a.registro_id
                     and o.contrato_id = p_contrato_id)
     ))
   );
  resumen := resumen || jsonb_build_object('aprobaciones', cantidad);
  total := total + cantidad;

  -- Storage no debe borrarse por SQL: si hay archivos, se quitan desde la
  -- pantalla de respaldos antes de borrar el contrato. Así no quedan huérfanos.
  with registros as (
    select 'contratos'::text as tabla, p_contrato_id as id
    union all select 'estados_pago', id from public.estados_pago where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'ordenes_compra', id from public.ordenes_compra where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'facturas', id from public.facturas where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'compras', id from public.compras where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'servicios', id from public.servicios where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'costos_personal', id from public.costos_personal where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'ordenes_compra_proveedor', id from public.ordenes_compra_proveedor where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'items_compra', id from public.items_compra where empresa_id = 'demo' and contrato_id = p_contrato_id
    union all select 'solped', id from public.solped where empresa_id = 'demo' and contrato_id = p_contrato_id
  )
  select count(*) into adjuntos
    from public.adjuntos a
    join registros r on r.tabla = a.tabla and r.id = a.registro_id
   where a.empresa_id = 'demo';
  resumen := resumen || jsonb_build_object('adjuntos', adjuntos, 'total', total);

  if not coalesce(p_eliminar, false) then
    return resumen || jsonb_build_object('eliminado', false);
  end if;
  if adjuntos > 0 then
    raise exception 'El contrato tiene % respaldos. Elimínalos desde sus registros antes de borrar el contrato.', adjuntos
      using errcode = 'P0001';
  end if;

  -- Las firmas y líneas van antes de sus documentos; todo ocurre en la misma
  -- transacción, por lo que un fallo deja el contrato íntegro.
  delete from public.aprobaciones a
   where a.empresa_id = 'demo' and (
     (a.documento = 'solped' and exists
       (select 1 from public.solped s where s.empresa_id = a.empresa_id
         and s.id = a.registro_id and s.contrato_id = p_contrato_id))
     or (a.documento = 'compra' and (
       exists (select 1 from public.compras c where c.empresa_id = a.empresa_id
         and c.id = a.registro_id and c.contrato_id = p_contrato_id)
       or exists (select 1 from public.ordenes_compra_proveedor o
         where o.empresa_id = a.empresa_id and o.id = a.registro_id
           and o.contrato_id = p_contrato_id)
     ))
   );
  delete from public.cotizacion_items i
   using public.cotizaciones c, public.solped s
   where i.empresa_id = 'demo' and i.empresa_id = c.empresa_id
     and i.cotizacion_id = c.id and c.empresa_id = s.empresa_id
     and c.solped_id = s.id and s.contrato_id = p_contrato_id;

  foreach tabla in array array[
    'items_compra', 'facturas', 'ordenes_compra', 'compras', 'servicios',
    'costos_personal', 'ordenes_compra_proveedor'
  ] loop
    execute format('delete from public.%I where empresa_id = $1 and contrato_id = $2', tabla)
      using 'demo', p_contrato_id;
  end loop;

  delete from public.cotizaciones c
   using public.solped s
   where c.empresa_id = 'demo' and c.empresa_id = s.empresa_id
     and c.solped_id = s.id and s.contrato_id = p_contrato_id;
  delete from public.solped_items i
   using public.solped s
   where i.empresa_id = 'demo' and i.empresa_id = s.empresa_id
     and i.solped_id = s.id and s.contrato_id = p_contrato_id;

  foreach tabla in array array[
    'estados_pago', 'solped', 'campos_contrato', 'anexos', 'categorias_costo'
  ] loop
    execute format('delete from public.%I where empresa_id = $1 and contrato_id = $2', tabla)
      using 'demo', p_contrato_id;
  end loop;
  delete from public.contratos where empresa_id = 'demo' and id = p_contrato_id;

  return resumen || jsonb_build_object('eliminado', true);
end;
$$;

revoke all on function public.borrar_contrato_demo(text, boolean) from public, anon;
grant execute on function public.borrar_contrato_demo(text, boolean) to authenticated;
notify pgrst, 'reload schema';
