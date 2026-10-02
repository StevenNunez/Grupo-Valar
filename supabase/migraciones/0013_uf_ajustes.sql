-- ============================================================================
-- Plataforma Valar — Dos ajustes a la tarea de la UF
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0011, que ya quedó funcionando.
--
-- Los dos salieron de probar la 0011 en vivo el 08-09-2026.
-- ============================================================================

-- ─── 1. Pedir el año entero, no los últimos 31 días ─────────────────────────
--
-- `/api/uf` de mindicador devuelve solo los últimos 31 días. Corriendo todos
-- los días alcanza de sobra... mientras corra todos los días. Y hay un caso en
-- que no corre: los proyectos gratuitos de Supabase se pausan tras una semana
-- sin actividad, y con el proyecto pausado no hay pg_cron que valga. Si la
-- pausa se estira más de un mes, la serie queda con un hoyo que ya no se puede
-- rellenar solo.
--
-- `/api/uf/<año>` devuelve el año completo —252 días al 8 de septiembre— y como
-- el guardado es un upsert por fecha, cada corrida repara lo que falte. Cuesta
-- lo mismo y se arregla sola.

create or replace function public.pedir_uf()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  esquema text;
  ticket bigint;
begin
  select n.nspname into esquema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'http_get'
  limit 1;

  if esquema is null then
    raise exception 'pg_net no está habilitado: falta http_get()';
  end if;

  execute format(
    'select %I.http_get(url := $1, timeout_milliseconds := 20000)', esquema
  )
  into ticket
  using format('https://mindicador.cl/api/uf/%s', extract(year from current_date)::int);

  insert into public.uf_solicitudes (id) values (ticket);
  return ticket;
end;
$$;

comment on function public.pedir_uf() is
  'Dispara la consulta de la serie anual de la UF a mindicador.cl. La respuesta la recoge guardar_uf().';

-- ─── 2. `uf_estado` no debe devolver nada sin sesión ────────────────────────
--
-- No había fuga: con `security_invoker` las políticas RLS ya dejaban todos los
-- campos en null para quien no ha entrado. Pero la vista estaba armada con
-- subconsultas y sin `from`, y eso siempre devuelve UNA fila —de puros nulos—.
-- `npm run verificar` la marcaba como "1 fila visible sin sesión", que es
-- exactamente la alarma que uno no quiere aprender a ignorar.
--
-- Con el `where exists` la vista devuelve cero filas sin sesión y una con
-- sesión, que es lo que la pantalla espera.

create or replace view public.uf_estado as
select
  (select valor from public.uf_diaria
    where fecha <= current_date order by fecha desc limit 1)          as valor_hoy,
  (select fecha from public.uf_diaria
    where fecha <= current_date order by fecha desc limit 1)          as fecha_valor,
  (select max(fecha) from public.uf_diaria)                           as ultimo_dia_cargado,
  (select count(*) from public.uf_diaria)                             as dias_cargados,
  (select resultado from public.uf_solicitudes
    where procesada_en is not null order by id desc limit 1)          as ultima_corrida,
  (select procesada_en from public.uf_solicitudes
    where procesada_en is not null order by id desc limit 1)          as ultima_corrida_en
where exists (select 1 from public.uf_diaria);

comment on view public.uf_estado is
  'Resumen de una fila: qué UF rige, hasta qué día está cargada y cómo terminó la última corrida. Sin sesión no devuelve filas.';

alter view public.uf_estado set (security_invoker = true);

grant select on public.uf_estado to authenticated;

notify pgrst, 'reload schema';
