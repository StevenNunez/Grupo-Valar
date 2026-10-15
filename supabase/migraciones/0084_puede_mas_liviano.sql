-- ════════════════════════════════════════════════════════════════════════════
-- 0084 — `puede()` y `ve_contrato()` en una sola consulta
-- ════════════════════════════════════════════════════════════════════════════
--
-- El Dashboard (resumen_mensual, costos_por_categoria, costos_unificados)
-- llegaba al tope de tiempo de Postgres ("canceling statement due to statement
-- timeout"): `resumen_mensual` tardaba 2,3 s a solas y el Dashboard lanza
-- varias consultas pesadas a la vez.
--
-- La causa no son los datos (unos cientos de filas) sino las políticas: cada
-- fila de cada tabla llama a `puede(...)` hasta cuatro veces, y cada llamada
-- ejecutaba ~5 subconsultas anidadas (tiene_permiso → es_admin_general,
-- permisos, accesos, nivel_permisos, acceso_permisos; luego ve_contrato →
-- es_admin_general otra vez, etc.). Al ser SECURITY DEFINER, Postgres no las
-- puede aplanar.
--
-- Acá se hace lo mismo con UNA consulta por llamada, y con el camino corto para
-- el Administrador general / Soporte (que no necesita mirar nada más).
-- La regla de acceso NO cambia:
--
--     Administrador general / Soporte      sí, a todo
--     permiso sin módulo                   no
--     sin acceso al módulo del permiso     no
--     administrador del módulo             sí, a todo lo del módulo
--     usuario / visualizador               lo de su nivel + sus switches
--     personalizado                        sus switches
--     y además, ve ese contrato en el módulo (todos o el contrato asignado)

create or replace function public.puede(clave text, contrato text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.perfiles pf
            where pf.id = auth.uid() and pf.acceso_general is not null)
      or exists (
           select 1
             from public.permisos p
             join public.accesos a
               on a.modulo_id = p.modulo_id
              and a.usuario_id = auth.uid()
            where p.id = clave
              and (
                a.todos_los_contratos
                or (contrato is not null and exists (
                      select 1 from public.acceso_contratos ac
                       where ac.usuario_id = a.usuario_id
                         and ac.modulo_id = a.modulo_id
                         and ac.contrato_id = contrato))
              )
              and (
                a.nivel = 'administrador'
                or exists (
                     select 1 from public.nivel_permisos np
                      where np.nivel = a.nivel and np.permiso_id = clave)
                or exists (
                     select 1 from public.acceso_permisos ap
                      where ap.usuario_id = a.usuario_id and ap.permiso_id = clave)
              )
         );
$$;

comment on function public.puede(text, text) is
  'tiene_permiso(clave) y además ve ese contrato en el módulo del permiso. Una sola consulta (0084).';

create or replace function public.ve_contrato(modulo text, contrato text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.perfiles pf
            where pf.id = auth.uid() and pf.acceso_general is not null)
      or exists (
           select 1
             from public.accesos a
            where a.usuario_id = auth.uid()
              and a.modulo_id = modulo
              and (
                a.todos_los_contratos
                or (contrato is not null and exists (
                      select 1 from public.acceso_contratos ac
                       where ac.usuario_id = a.usuario_id
                         and ac.modulo_id = a.modulo_id
                         and ac.contrato_id = contrato))
              )
         );
$$;

notify pgrst, 'reload schema';
