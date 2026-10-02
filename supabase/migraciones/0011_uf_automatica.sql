-- ============================================================================
-- Plataforma Valar — La UF se trae sola, todos los días
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0001 a 0010.
--
-- POR QUÉ: `uf_diaria` existe desde la 0005 y dice en su comentario "la llena
-- una función programada; nadie la teclea". Esta migración es esa función.
--
-- Importa más de lo que parece: C-TORRES factura en UF (19 torres × 39,40
-- UF/mes), así que el ingreso del mes depende del valor que se use. En las
-- planillas de Valar la UF de junio aparece con DOS valores distintos según el
-- archivo, y esa sola diferencia mueve el ingreso en $20.089. Con la serie
-- traída de la fuente todos los días, eso deja de poder pasar.
--
-- Fuente: mindicador.cl, que publica la serie diaria de la UF del año en curso.
-- La UF se conoce con anticipación (se publica el día 9 para el período
-- siguiente), así que la serie ya trae el día 1 del mes que viene, que es el
-- valor con el que se valoriza el estado de pago.
--
-- CÓMO FUNCIONA (en dos tiempos, porque pg_net es asíncrono):
--   1. `pedir_uf()`   dispara la petición HTTP y anota su número de ticket.
--   2. `guardar_uf()` cinco minutos después lee la respuesta y la guarda.
-- Las dos las llama pg_cron. También se pueden llamar a mano si hace falta.
-- ============================================================================

-- ─── Corrección: la UF del mes es la del ÚLTIMO día, no la del primero ──────
--
-- La 0005 definió `uf_del_mes()` como "el valor del día 1". Al traer la serie
-- real de la fuente quedó a la vista que Valar no usa esa: usa la del último
-- día del mes. Comprobado contra los tres estados de pago de C-TORRES, al peso:
--
--   Período   UF cargada   día 1 real   último día real
--   2026-06   40.820,31    40.627,62    40.820,31   ← la cargada
--   2026-07   40.844,79    40.823,03    40.844,79   ← la cargada
--   2026-08   40.873,77    40.844,79    40.873,77   ← la cargada
--
--   820,63 UF × 40.820,31 = $33.498.371 = exactamente el neto de junio.
--   Con la UF del día 1 daría $33.340.244: $158.127 menos, solo en junio.
--
-- Los valores estaban bien; lo que estaba mal era la fecha con la que se
-- guardaban (el día 1) y la regla que los iba a buscar. Al cargar la serie
-- completa, cada día queda con SU valor y esta función busca el que
-- corresponde.
--
-- Para el mes en curso, que todavía no tiene último día, devuelve el valor más
-- reciente que haya dentro del mes. Así el Dashboard del mes abierto muestra
-- algo razonable en vez de nada.

create or replace function public.uf_del_mes(periodo date)
returns numeric
language sql
stable
as $$
  select valor
  from public.uf_diaria
  where fecha >= date_trunc('month', periodo)::date
    and fecha < (date_trunc('month', periodo) + interval '1 month')::date
  order by fecha desc
  limit 1;
$$;

comment on function public.uf_del_mes(date) is
  'UF con la que se valoriza el período: la del último día del mes (o la última conocida, si el mes sigue abierto).';

-- ─── Extensiones ────────────────────────────────────────────────────────────
-- pg_cron programa; pg_net hace la llamada HTTP. Las dos vienen con Supabase,
-- pero hay que habilitarlas una vez.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── Los tickets de las peticiones ──────────────────────────────────────────
-- pg_net no devuelve la respuesta: devuelve un id y deja el resultado en
-- `net._http_response`, que además se autolimpia a las pocas horas. Por eso hay
-- que anotar qué se pidió y cuándo, para poder ir a buscarlo.

create table if not exists public.uf_solicitudes (
  id bigint primary key,                                 -- el id de pg_net
  pedida_en timestamptz not null default now(),
  procesada_en timestamptz,
  resultado text                                         -- 'ok: 45 días' o el error
);

comment on table public.uf_solicitudes is
  'Bitácora de las llamadas a la fuente de la UF. La llena la tarea programada.';

create index if not exists uf_solicitudes_pendientes_idx
  on public.uf_solicitudes (pedida_en) where procesada_en is null;

alter table public.uf_solicitudes enable row level security;

-- Se lee para poder mostrar en pantalla si la UF está al día. Nadie la escribe
-- desde la aplicación: las funciones de abajo son `security definer`.
drop policy if exists "uf_solicitudes: lectura autenticada" on public.uf_solicitudes;
create policy "uf_solicitudes: lectura autenticada"
  on public.uf_solicitudes for select to authenticated using (true);

-- ─── 1. Pedir ───────────────────────────────────────────────────────────────
-- El esquema de pg_net se resuelve en tiempo de ejecución en vez de escribir
-- `net.http_get` a secas: según cómo se haya habilitado la extensión, las
-- funciones quedan en `net` o en `extensions`, y con el nombre fijo la
-- migración falla en un proyecto y funciona en otro.

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
    'select %I.http_get(url := $1, timeout_milliseconds := 15000)', esquema
  )
  into ticket
  using 'https://mindicador.cl/api/uf';

  insert into public.uf_solicitudes (id) values (ticket);
  return ticket;
end;
$$;

comment on function public.pedir_uf() is
  'Dispara la consulta de la UF a mindicador.cl. La respuesta la recoge guardar_uf().';

-- ─── 2. Guardar ─────────────────────────────────────────────────────────────
-- Guarda la serie completa que venga, no solo el día de hoy: así una corrida
-- que falló ayer se repara sola mañana, y de paso quedan cargados los días 1
-- de cada mes, que son los que usa `uf_del_mes()`.

create or replace function public.guardar_uf()
returns text
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  esquema text;
  pendiente record;
  respuesta record;
  dias integer;
  informe text := '';
begin
  select n.nspname into esquema
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relname = '_http_response'
  limit 1;

  if esquema is null then
    raise exception 'pg_net no está habilitado: falta _http_response';
  end if;

  for pendiente in
    select id from public.uf_solicitudes
    where procesada_en is null
    order by id
  loop
   -- Cada ticket va en su propio bloque: si la respuesta viene rara, se anota
   -- el error en esa fila y se sigue con la siguiente, en vez de tumbar la
   -- corrida entera.
   begin
    execute format(
      'select status_code, content, error_msg from %I._http_response where id = $1', esquema
    )
    into respuesta
    using pendiente.id;

    if respuesta is null then
      -- Todavía no llega, o pg_net ya limpió la fila. Si pasaron más de seis
      -- horas no va a llegar nunca: se cierra para que no quede colgada.
      update public.uf_solicitudes
      set procesada_en = now(), resultado = 'sin respuesta'
      where id = pendiente.id and pedida_en < now() - interval '6 hours';
      continue;
    end if;

    if respuesta.status_code <> 200 then
      update public.uf_solicitudes
      set procesada_en = now(),
          resultado = format('HTTP %s %s', respuesta.status_code, coalesce(respuesta.error_msg, ''))
      where id = pendiente.id;
      continue;
    end if;

    -- La fecha viene como "2026-09-08T04:00:00.000Z". Se cortan los diez
    -- primeros caracteres en vez de castear a timestamptz: con la zona horaria
    -- de por medio, ese valor se corre un día según dónde corra el servidor.
    with serie as (
      select
        left(elemento->>'fecha', 10)::date as fecha,
        (elemento->>'valor')::numeric      as valor
      from jsonb_array_elements(
        (respuesta.content::jsonb) -> 'serie'
      ) as elemento
      where elemento->>'valor' is not null
    ),
    guardado as (
      insert into public.uf_diaria (fecha, valor, fuente)
      select fecha, valor, 'mindicador.cl' from serie
      on conflict (fecha) do update
        set valor = excluded.valor,
            fuente = excluded.fuente,
            registrado_en = now()
      returning 1
    )
    select count(*) into dias from guardado;

    update public.uf_solicitudes
    set procesada_en = now(), resultado = format('ok: %s días', dias)
    where id = pendiente.id;

    informe := format('%s días guardados', dias);
   exception
    when others then
      update public.uf_solicitudes
      set procesada_en = now(), resultado = format('error: %s', sqlerrm)
      where id = pendiente.id;
      informe := format('error: %s', sqlerrm);
   end;
  end loop;

  return coalesce(nullif(informe, ''), 'nada pendiente');
end;
$$;

comment on function public.guardar_uf() is
  'Recoge la respuesta de pedir_uf() y guarda la serie en uf_diaria.';

-- ─── Cuándo corre ───────────────────────────────────────────────────────────
-- pg_cron usa UTC. Chile está en UTC-4 (UTC-3 en horario de verano), así que
-- 12:20 UTC son las 08:20 de la mañana acá: la fuente ya publicó el valor del
-- día y la plataforma abre con la UF puesta.
--
-- `unschedule` primero para que volver a correr esta migración no deje dos
-- tareas iguales. Va en un bloque porque falla si la tarea no existe.

do $$
begin
  perform cron.unschedule('uf-pedir');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('uf-guardar');
exception when others then null;
end $$;

select cron.schedule('uf-pedir',   '20 12 * * *', $$ select public.pedir_uf();   $$);
select cron.schedule('uf-guardar', '25 12 * * *', $$ select public.guardar_uf(); $$);

-- ─── Para mirar cómo va ─────────────────────────────────────────────────────
-- Una fila con el estado de la UF: qué valor rige hoy, de cuándo es y si la
-- última corrida funcionó. Es lo que la plataforma muestra en pantalla.

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
    where procesada_en is not null order by id desc limit 1)          as ultima_corrida_en;

comment on view public.uf_estado is
  'Resumen de una fila: qué UF rige, hasta qué día está cargada y cómo terminó la última corrida.';

-- Las vistas heredan las políticas de las tablas que leen, y las dos exigen
-- sesión iniciada. `security_invoker` deja eso explícito.
alter view public.uf_estado set (security_invoker = true);

grant select on public.uf_estado to authenticated;

-- PostgREST sirve desde una caché del esquema: sin esto, las funciones y la
-- vista recién creadas "no existen" hasta que el proyecto se reinicie solo.
notify pgrst, 'reload schema';
