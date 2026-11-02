-- ============================================================================
-- Plataforma Valar — Los avisos también le llegan a Soporte (Teo Labs)
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0105.
--
-- POR QUÉ: la 0105 avisaba solo a los administradores generales y a quienes
-- tienen el permiso por su acceso al módulo. Soporte (Teo Labs) tiene todo,
-- pero quedó afuera, y justamente es quien necesita enterarse cuando una
-- solicitud se queda parada. Soporte ve UNA empresa a la vez (su
-- `perfiles.empresa_id` es la que tiene seleccionada), así que recibe los
-- avisos de esa empresa.
-- ============================================================================

create or replace function public.personas_con_permiso(
  clave text, p_empresa text, p_contrato text
) returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.perfiles p
   where p.empresa_id = p_empresa
     and (
       p.acceso_general in ('administrador', 'soporte')
       or exists (
         select 1
           from public.permisos pe
           join public.accesos a on a.modulo_id = pe.modulo_id and a.usuario_id = p.id
          where pe.id = clave
            and (
              a.nivel = 'administrador'
              or exists (select 1 from public.nivel_permisos np
                          where np.nivel = a.nivel and np.permiso_id = clave)
              or exists (select 1 from public.acceso_permisos ap
                          where ap.usuario_id = a.usuario_id and ap.permiso_id = clave)
            )
            and (
              a.todos_los_contratos
              or exists (select 1 from public.acceso_contratos ac
                          where ac.usuario_id = a.usuario_id
                            and ac.modulo_id = a.modulo_id
                            and ac.contrato_id = p_contrato)
            )
       )
     );
$$;

revoke all on function public.personas_con_permiso(text, text, text) from public, anon, authenticated;
