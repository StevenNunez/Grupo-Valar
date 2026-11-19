-- ============================================================================
-- 0126 · Soporte vuelve a ver una empresa a la vez (corrige la 0125)
-- ============================================================================
--
-- La 0125 reescribió cada `ve_empresa(col)` de las políticas como
--
--     col = (SELECT empresa_actual())  OR  (SELECT cruza_empresas())
--
-- copiando la regla vieja de la 0030. Pero la 0046 ya la había cambiado:
-- `ve_empresa` es solo `col = empresa_actual()`, y Soporte ve UNA empresa, la que
-- eligió con `cambiar_empresa()`. Con el `OR cruza_empresas()` de vuelta, la
-- cuenta de Soporte veía Valar y el demo mezclados (19-11-2026): OC22-001129 y
-- 001130 del demo en la lista de Valar, los contratos C-MISC y C-TORRES en los
-- selectores, y PRV-0002 repetido (lo que dejó la OC22-001203 con el proveedor
-- del demo).
--
-- Ningún dato se movió de empresa: solo se veía de más. Esta migración saca ese
-- `OR` de todas las políticas y deja lo demás de la 0125 (que pregunten una vez
-- por consulta) igual.
--
-- Es idempotente: si no queda ningún `OR cruza_empresas` en las políticas, no
-- hace nada.
-- ============================================================================

begin;

create or replace function pg_temp.sin_cruce(expr text)
returns text
language sql
immutable
as $$
  -- Postgres guarda `(SELECT public.cruza_empresas())` como
  -- `( SELECT cruza_empresas() AS cruza_empresas)`; se aceptan las dos formas.
  select regexp_replace(
    expr,
    '\s*OR\s*\(\s*SELECT\s+(?:public\.)?cruza_empresas\(\)(?:\s+AS\s+cruza_empresas)?\s*\)',
    '', 'gi');
$$;

do $$
declare
  p record;
  nuevo_using text;
  nuevo_check text;
  cambiadas int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~* 'SELECT\s+(public\.)?cruza_empresas\(\)'
         or coalesce(with_check, '') ~* 'SELECT\s+(public\.)?cruza_empresas\(\)')
  loop
    nuevo_using := pg_temp.sin_cruce(p.qual);
    nuevo_check := pg_temp.sin_cruce(p.with_check);

    if nuevo_using is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, nuevo_using);
    end if;
    if nuevo_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, nuevo_check);
    end if;
    cambiadas := cambiadas + 1;
  end loop;

  raise notice '0126: % políticas vuelven a ver solo la empresa actual.', cambiadas;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- Para comprobar después (debe dar 0):
--   select count(*) from pg_policies
--    where schemaname = 'public'
--      and (coalesce(qual, '') ~* 'cruza_empresas' or coalesce(with_check, '') ~* 'cruza_empresas');
