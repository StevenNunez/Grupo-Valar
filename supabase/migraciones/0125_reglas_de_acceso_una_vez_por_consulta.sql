-- ════════════════════════════════════════════════════════════════════════════
-- 0125 — Las reglas de acceso se preguntan UNA vez por consulta, no por fila
-- ════════════════════════════════════════════════════════════════════════════
--
-- Entrar a la plataforma se sentía lento. Medido el 19-11-2026 con la cuenta
-- real (60 filas, nada más):
--
--     costos_por_categoria   con las reglas ~2.000 ms   sin ellas ~200 ms
--     resumen_mensual        con las reglas   ~600 ms   sin ellas ~200 ms
--
-- El Dashboard espera a la más lenta, así que abría en 2,5 s o más. La causa
-- no son los datos: cada política llama a `puede(...)`, `ve_contrato(...)` o
-- `ve_empresa(...)` POR CADA FILA, y las vistas de costo recorren varias
-- tablas (y sus `not exists`), así que se terminan ejecutando miles de veces
-- las mismas preguntas: "¿esta persona es administrador general?", "¿de qué
-- empresa es?", "¿qué contratos tiene asignados?". La respuesta es la misma
-- para toda la consulta.
--
-- Ahora esas preguntas se hacen una sola vez por consulta: dentro de un
-- `(select ...)` Postgres las calcula una vez y reutiliza el resultado
-- (InitPlan). Es la forma que recomienda Supabase para RLS.
--
-- LA REGLA NO CAMBIA. Cada llamada se reemplaza por su equivalente exacto:
--
--   puede(clave, c)        →  puede_en_todos(clave)  o  c ∈ contratos_con_permiso(clave)
--   ve_contrato(modulo, c) →  ve_todo_el_modulo(modulo)  o  c ∈ contratos_del_modulo(modulo)
--   ve_empresa(e)          →  e = empresa_actual()   (Soporte ve una empresa a la vez: 0046)
--   tiene_permiso(clave), entra_a(modulo)  →  las mismas, preguntadas una vez
--
-- `puede` y `ve_contrato` siguen existiendo (las usan otras funciones). Las
-- políticas no se reescriben a mano: se toman de `pg_policies` tal como están
-- hoy en la base y se cambian solo esas llamadas. Si algo no calza, la
-- migración entera se deshace (va en una transacción).
--
-- Se puede volver a correr: lo ya reescrito no vuelve a calzar.

begin;

set local search_path = public, extensions;

-- ─── 1. Las respuestas que valen para toda la consulta ──────────────────────

/* La parte de `puede` que no depende del contrato: tiene el permiso y lo
   tiene en TODOS los contratos del módulo. */
create or replace function public.puede_en_todos(clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_general()
      or exists (
           select 1
             from public.permisos p
             join public.accesos a
               on a.modulo_id = p.modulo_id
              and a.usuario_id = auth.uid()
            where p.id = clave
              and a.todos_los_contratos
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

/* Los contratos asignados uno a uno donde tiene ese permiso. */
create or replace function public.contratos_con_permiso(clave text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct ac.contrato_id), '{}')
    from public.permisos p
    join public.accesos a
      on a.modulo_id = p.modulo_id
     and a.usuario_id = auth.uid()
    join public.acceso_contratos ac
      on ac.usuario_id = a.usuario_id
     and ac.modulo_id = a.modulo_id
   where p.id = clave
     and (
       a.nivel = 'administrador'
       or exists (
            select 1 from public.nivel_permisos np
             where np.nivel = a.nivel and np.permiso_id = clave)
       or exists (
            select 1 from public.acceso_permisos ap
             where ap.usuario_id = a.usuario_id and ap.permiso_id = clave)
     );
$$;

/* La parte de `ve_contrato` que no depende del contrato. */
create or replace function public.ve_todo_el_modulo(modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_general()
      or exists (
           select 1 from public.accesos a
            where a.usuario_id = auth.uid()
              and a.modulo_id = modulo
              and a.todos_los_contratos);
$$;

/* Los contratos asignados uno a uno en ese módulo. */
create or replace function public.contratos_del_modulo(modulo text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct ac.contrato_id), '{}')
    from public.accesos a
    join public.acceso_contratos ac
      on ac.usuario_id = a.usuario_id
     and ac.modulo_id = a.modulo_id
   where a.usuario_id = auth.uid()
     and a.modulo_id = modulo;
$$;

revoke all on function public.puede_en_todos(text) from public;
revoke all on function public.contratos_con_permiso(text) from public;
revoke all on function public.ve_todo_el_modulo(text) from public;
revoke all on function public.contratos_del_modulo(text) from public;
grant execute on function public.puede_en_todos(text) to authenticated;
grant execute on function public.contratos_con_permiso(text) to authenticated;
grant execute on function public.ve_todo_el_modulo(text) to authenticated;
grant execute on function public.contratos_del_modulo(text) to authenticated;

-- ─── 2. Las políticas: mismas reglas, preguntadas una vez ───────────────────

create or replace function pg_temp.una_vez(expr text)
returns text
language plpgsql
as $$
declare
  -- Una columna, con o sin tabla delante: contrato_id, s.contrato_id, id.
  col constant text := '([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)';
  -- Una clave literal tal como la escribe Postgres: 'egresos.ver'::text.
  lit constant text := '(''[^'']*''::text)';
  fn  constant text := '(?:public\.)?';
begin
  if expr is null then return null; end if;

  expr := regexp_replace(expr,
    '\m' || fn || 'puede\(' || lit || ', ' || col || '\)',
    '((SELECT public.puede_en_todos(\1)) OR \2 = ANY ((SELECT public.contratos_con_permiso(\1))::text[]))', 'g');

  expr := regexp_replace(expr,
    '\m' || fn || 've_contrato\(' || lit || ', ' || col || '\)',
    '((SELECT public.ve_todo_el_modulo(\1)) OR \2 = ANY ((SELECT public.contratos_del_modulo(\1))::text[]))', 'g');

  expr := regexp_replace(expr,
    '\m' || fn || 've_empresa\(' || col || '\)',
    -- Sin `OR cruza_empresas()`: desde la 0046 Soporte ve una empresa a la vez (lo corrigió la 0126).
    '(\1 = (SELECT public.empresa_actual()))', 'g');

  -- Sin argumento de fila: basta envolverlas (si no lo están ya).
  expr := regexp_replace(expr,
    '(?<!SELECT )\m' || fn || '(tiene_permiso|entra_a)\(' || lit || '\)',
    '(SELECT public.\1(\2))', 'g');

  return expr;
end;
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
  loop
    nuevo_using := pg_temp.una_vez(p.qual);
    nuevo_check := pg_temp.una_vez(p.with_check);

    if nuevo_using is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, nuevo_using);
    end if;
    if nuevo_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, nuevo_check);
    end if;
    if nuevo_using is distinct from p.qual or nuevo_check is distinct from p.with_check then
      cambiadas := cambiadas + 1;
    end if;
  end loop;

  raise notice '0125: % políticas ahora preguntan una vez por consulta.', cambiadas;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- Para comprobar después (debe dar 0 filas: ninguna política llama ya por fila
-- a puede / ve_contrato / ve_empresa):
--
--   select tablename, policyname from pg_policies
--    where schemaname = 'public'
--      and (coalesce(qual, '') ~ '\m(puede|ve_contrato|ve_empresa)\('
--        or coalesce(with_check, '') ~ '\m(puede|ve_contrato|ve_empresa)\(');
