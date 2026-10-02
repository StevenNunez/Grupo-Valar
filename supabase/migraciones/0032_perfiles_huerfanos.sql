-- ============================================================================
-- 0032 — Quien no tiene empresa tiene que poder ser visto
--
-- Dos defectos de la 0031, encontrados al probarla.
--
-- 1. `perfiles_sin_empresa` hacía `join auth.users` para mostrar el correo, y
--    la vista es `security_invoker`: corre con los permisos de quien consulta
--    y NADIE tiene permiso de leer `auth.users`. Devolvía «permission denied
--    for table users» siempre. Una vista que nunca puede leerse no sirve de
--    nada, así que se va el join: `perfiles` ya trae nombre y cargo, que
--    alcanzan de sobra para reconocer a alguien.
--
-- 2. El más serio. La política restrictiva de la 0030 dice
--    `id = auth.uid() or ve_empresa(empresa_id)`. Con `empresa_id` nulo,
--    `ve_empresa(null)` da nulo —no verdadero—, así que **un perfil sin
--    empresa no lo ve NADIE** salvo el soporte, que cruza. El gerente general
--    invita a alguien, algo sale mal, esa persona queda sin empresa, y quien
--    tendría que arreglarlo no puede ni verla en la lista. El callejón sin
--    salida perfecto.
--
--    Se abre exactamente esa rendija: quien tiene `usuarios.administrar` ve y
--    corrige los perfiles que no son de ninguna empresa todavía. No es un
--    agujero en el aislamiento —una fila sin empresa no es de nadie— y es lo
--    que permite adoptarla.
-- ============================================================================

drop view if exists public.perfiles_sin_empresa;

create view public.perfiles_sin_empresa
with (security_invoker = true) as
  select p.id, p.nombre, p.cargo, p.rol, p.creado_en
    from public.perfiles p
   where p.empresa_id is null;

comment on view public.perfiles_sin_empresa is
  'Cuentas que no ven nada porque nacieron sin empresa. Se arreglan poniéndoles '
  '`perfiles.empresa_id`. Sin el correo a propósito: vive en `auth.users` y '
  'esta vista corre con los permisos de quien la consulta.';

grant select on public.perfiles_sin_empresa to authenticated;

-- La rendija para adoptar a los huérfanos.
drop policy if exists "perfiles: solo su empresa" on public.perfiles;
create policy "perfiles: solo su empresa" on public.perfiles
  as restrictive
  for all to authenticated
  using (
    id = auth.uid()
    or public.ve_empresa(empresa_id)
    or (empresa_id is null and public.tiene_permiso('usuarios.administrar'))
  )
  with check (
    id = auth.uid()
    or public.ve_empresa(empresa_id)
    or (empresa_id is null and public.tiene_permiso('usuarios.administrar'))
  );

notify pgrst, 'reload schema';
