-- ============================================================================
-- 0031 — El perfil nace con empresa
--
-- POR QUÉ. La 0030 dejó a `perfiles` con `empresa_id`, pero el trigger que
-- crea el perfil al registrarse es de la 0001 y solo llena
-- `(id, nombre, cargo, rol)`. Resultado: **todo invitado nacía sin empresa**, y
-- sin empresa `empresa_actual()` devuelve nulo, la política restrictiva
-- `ve_empresa(empresa_id)` no deja pasar nada, y esa persona abre la
-- plataforma y la ve en blanco. No podría ni crear una solped.
--
-- Se encontró revisando el camino de la invitación ANTES de invitar a nadie,
-- que es el único momento barato para encontrarlo.
--
-- DE DÓNDE SALE LA EMPRESA. De los metadatos del usuario, que es lo único que
-- un trigger sobre `auth.users` alcanza a ver: la Edge Function `correo` los
-- llena con la empresa de QUIEN INVITA, resuelta con su sesión y no recibida
-- del navegador. Si viniera en el cuerpo de la llamada, cualquiera con permiso
-- para invitar podría meter gente en otra empresa.
--
-- SI NO VIENE, EL PERFIL QUEDA SIN EMPRESA A PROPÓSITO. Poner una por defecto
-- —'valar', pongamos— significa que un error de configuración mete a un
-- desconocido en la empresa con los datos reales. Que no vea nada es molesto y
-- se arregla en un minuto desde Usuarios; lo otro no se deshace.
-- ============================================================================

create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, cargo, rol, empresa_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'cargo', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'lectura'),
    -- Nulo si no vino: mejor sin acceso que en la empresa equivocada.
    nullif(new.raw_user_meta_data ->> 'empresa', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El trigger sigue siendo el mismo de la 0001; se rehace por si acaso.
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ─── Quién quedó sin empresa ────────────────────────────────────────────────
--
-- Una vista para poder contestar "¿por qué fulano no ve nada?" sin tener que
-- salir a buscar. Es la primera pregunta que va a llegar cuando entren todos.

create or replace view public.perfiles_sin_empresa
with (security_invoker = true) as
  select p.id, p.nombre, p.cargo, p.rol, u.email as correo, p.creado_en
    from public.perfiles p
    join auth.users u on u.id = p.id
   where p.empresa_id is null;

comment on view public.perfiles_sin_empresa is
  'Cuentas que no ven nada porque nacieron sin empresa. Se arreglan poniéndoles '
  '`perfiles.empresa_id`.';

grant select on public.perfiles_sin_empresa to authenticated;

-- PostgREST sirve desde una caché de esquema: sin esto la vista nueva no
-- aparece hasta que el servicio decida recargar solo.
notify pgrst, 'reload schema';
