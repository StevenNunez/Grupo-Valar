-- ============================================================================
-- 0044 — Retirar el modelo de permisos por rol
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0043, con la plataforma nueva ya desplegada.
--
-- Desde la 0042 lo que cada persona puede hacer sale de `accesos`, y el rol
-- quedó como cargo (un título). Estas piezas se dejaron en pie solo para que la
-- pantalla vieja no se cayera durante el cambio; ya no las lee nadie:
--
--   rol_permisos            qué podía cada rol       → nivel_permisos + accesos
--   usuario_permisos        excepciones por persona  → acceso_permisos
--   roles.cruza_empresas    Soporte por cargo        → perfiles.acceso_general
--
-- Se borran para que nadie las vuelva a usar creyendo que mandan: una tabla de
-- permisos que existe pero no decide nada es peor que no tenerla.
--
-- Antes de borrar se comprueba que de verdad no las use nada en la base. Si
-- alguna función las nombra, se detiene diciendo cuál.
-- ============================================================================

do $$
declare
  culpables text;
begin
  select string_agg(p.proname, ', ')
    into culpables
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.prosrc ilike '%rol_permisos%'
          or p.prosrc ilike '%usuario_permisos%'
          or p.prosrc ~* 'r\.cruza_empresas|roles\.cruza_empresas');

  if culpables is not null then
    raise exception 'Todavía las usan estas funciones: %. Corrígelas antes de aplicar la 0044.', culpables;
  end if;
end;
$$;

-- Sus políticas RLS se van con ellas.
drop table if exists public.usuario_permisos;
drop table if exists public.rol_permisos;

alter table public.roles drop column if exists cruza_empresas;

comment on table public.roles is
  'Los CARGOS: un título por persona (Supervisor, Contador…). No dan permisos: '
  'lo que cada uno puede hacer sale de `accesos` (ver la 0042).';

notify pgrst, 'reload schema';
