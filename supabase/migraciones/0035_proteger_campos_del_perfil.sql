-- 0035 — Una persona puede corregir su nombre y cargo, pero no su rol,
-- empresa ni otros campos de la cuenta. Aplicar después de 0034.
-- La política RLS de 0029 permite UPDATE a la propia fila; sin este límite
-- una llamada directa a la API también podría ascenderse a administrador.
-- Idempotente: reemplaza una función y recrea un trigger.

create or replace function public.proteger_campos_del_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not coalesce(public.tiene_permiso('usuarios.administrar'), false)
     and (to_jsonb(new) - 'nombre' - 'cargo')
         is distinct from (to_jsonb(old) - 'nombre' - 'cargo') then
    raise exception 'Solo puedes cambiar tu nombre y cargo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_proteger_campos on public.perfiles;
create trigger perfiles_proteger_campos
  before update on public.perfiles
  for each row execute function public.proteger_campos_del_perfil();
