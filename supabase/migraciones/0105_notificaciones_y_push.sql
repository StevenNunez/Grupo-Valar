-- ============================================================================
-- Plataforma Valar — Notificaciones y avisos push (PWA)
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0104.
--
-- POR QUÉ: una solicitud de compra quedó tres días sin que nadie la viera,
-- porque la plataforma solo avisa si alguien entra a mirar. Esto hace que la
-- plataforma le hable a la persona: una campana dentro de la app (bandeja que
-- no se pierde aunque el teléfono esté apagado) y un aviso push al teléfono o
-- al escritorio, aunque la app esté cerrada.
--
-- QUÉ AVISA:
--   · solicitud pasa a «en aprobación»     → a quien puede aprobar solicitudes
--   · solicitud llega desde Pagnol (borrador) → a quien puede crear solicitudes
--   · solicitud aprobada                   → a quien cotiza, y al solicitante
--   · solicitud rechazada                  → al solicitante
--   · RECORDATORIO mientras siga pendiente: cada 2 h si es urgente o vence hoy
--     (o ya venció), cada 4 h el resto. Solo de 8:00 a 20:00 hora de Chile, para
--     no despertar a nadie. Un recordatorio reemplaza al anterior en el teléfono.
--
-- DESPUÉS DE CORRERLA, UNA SOLA VEZ (la dirección y el secreto no van en el repo):
--   insert into public.push_config (id, url, secreto)
--   values (1, 'https://plataforma.grupovalar.cl/api/push/enviar/', '<el mismo valor de PUSH_SECRETO en Vercel>')
--   on conflict (id) do update set url = excluded.url, secreto = excluded.secreto;
-- Sin esa fila las notificaciones igual quedan en la campana; solo no suena el
-- teléfono.
-- ============================================================================

-- ─── La bandeja de cada persona ─────────────────────────────────────────────
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  empresa_id text references public.empresas (id) on delete cascade,
  /* 'solped.por_aprobar', 'solped.recordatorio', … Sirve para agrupar y para
     saber si ya se recordó. */
  tipo text not null,
  titulo text not null,
  cuerpo text not null default '',
  /* Adónde lleva al tocarla. Ruta interna, siempre. */
  url text not null default '/modulos/',
  /* Qué registro la originó ('SP-MISC-0001'), para no avisar dos veces. */
  referencia text,
  urgente boolean not null default false,
  leida_en timestamptz,
  push_enviado_en timestamptz,
  creado_en timestamptz not null default now()
);

comment on table public.notificaciones is
  'Bandeja de avisos de cada persona. La campana de la plataforma lee esta tabla; el push del teléfono sale de la misma fila.';

create index if not exists notificaciones_usuario_idx
  on public.notificaciones (usuario_id, creado_en desc);
create index if not exists notificaciones_referencia_idx
  on public.notificaciones (referencia, usuario_id, creado_en desc);

alter table public.notificaciones enable row level security;

drop policy if exists "notificaciones: las propias" on public.notificaciones;
create policy "notificaciones: las propias"
  on public.notificaciones for select to authenticated
  using (usuario_id = auth.uid());

/* Solo puede marcar como leída; nadie edita el texto de un aviso. */
drop policy if exists "notificaciones: marcar leída" on public.notificaciones;
create policy "notificaciones: marcar leída"
  on public.notificaciones for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

revoke update on public.notificaciones from authenticated;
grant update (leida_en) on public.notificaciones to authenticated;

-- ─── Los dispositivos que quieren recibir push ──────────────────────────────
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  creado_en timestamptz not null default now(),
  ultimo_envio_en timestamptz
);

comment on table public.push_suscripciones is
  'Un dispositivo (teléfono, escritorio) de una persona, para mandarle avisos push. El endpoint identifica el dispositivo.';

create index if not exists push_suscripciones_usuario_idx on public.push_suscripciones (usuario_id);

alter table public.push_suscripciones enable row level security;

drop policy if exists "push: las propias" on public.push_suscripciones;
create policy "push: las propias"
  on public.push_suscripciones for select to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "push: borrar las propias" on public.push_suscripciones;
create policy "push: borrar las propias"
  on public.push_suscripciones for delete to authenticated
  using (usuario_id = auth.uid());

/* Registrar va por función y no por INSERT: si en el mismo computador entra
   otra persona, el endpoint ya existe a nombre de la anterior y hay que
   pasárselo, cosa que una política RLS no deja hacer. */
create or replace function public.registrar_push(
  p_endpoint text, p_p256dh text, p_auth text, p_agente text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'Dirección de push inválida.';
  end if;
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth, agente)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_agente, 300))
  on conflict (endpoint) do update
    set usuario_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        agente = excluded.agente;
end $$;

grant execute on function public.registrar_push(text, text, text, text) to authenticated;

-- ─── A dónde mandar el aviso (secreto: no se lee desde el navegador) ────────
create table if not exists public.push_config (
  id smallint primary key check (id = 1),
  url text not null,
  secreto text not null
);

alter table public.push_config enable row level security;  -- sin políticas: nadie la lee con sesión
revoke all on public.push_config from anon, authenticated;

comment on table public.push_config is
  'Dirección del servidor que manda los push y el secreto compartido. Una sola fila, la carga una persona con acceso al SQL Editor.';

-- ─── Quién puede hacer qué, para una persona cualquiera ─────────────────────
-- `tiene_permiso()` responde por quien tiene la sesión abierta. Para avisar hay
-- que preguntar por OTRAS personas, con la misma regla (la de la 0042) y,
-- además, mirando si ve el contrato de la solicitud.
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
       p.acceso_general = 'administrador'
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

-- ─── Mandar el push (asíncrono; si falla, la notificación igual queda) ──────
create or replace function public.enviar_push(ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.push_config;
begin
  if ids is null or cardinality(ids) = 0 then return; end if;
  select * into cfg from public.push_config where id = 1;
  if not found then return; end if;
  perform net.http_post(
    url := cfg.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secreto', cfg.secreto),
    body := jsonb_build_object('ids', to_jsonb(ids)),
    timeout_milliseconds := 5000
  );
exception when others then
  -- Un aviso que no sale nunca debe frenar la solicitud que lo causó.
  raise warning 'enviar_push: %', sqlerrm;
end $$;

revoke all on function public.enviar_push(uuid[]) from public, anon, authenticated;

-- ─── Crear avisos para un grupo de personas ─────────────────────────────────
create or replace function public.avisar_a(
  p_personas uuid[], p_empresa text, p_tipo text, p_titulo text, p_cuerpo text,
  p_url text, p_referencia text, p_urgente boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  creados uuid[];
begin
  if p_personas is null or cardinality(p_personas) = 0 then return; end if;
  with nuevas as (
    insert into public.notificaciones
      (usuario_id, empresa_id, tipo, titulo, cuerpo, url, referencia, urgente)
    select distinct u, p_empresa, p_tipo, p_titulo, p_cuerpo, p_url, p_referencia, p_urgente
      from unnest(p_personas) as u
    returning id
  )
  select array_agg(id) into creados from nuevas;
  perform public.enviar_push(creados);
end $$;

revoke all on function public.avisar_a(uuid[], text, text, text, text, text, text, boolean) from public, anon, authenticated;

/* "vence hoy", "vencida", "para el 4 de nov": lo que se lee de un vistazo. */
create or replace function public.texto_de_vencimiento(p_fecha date)
returns text
language sql
stable
as $$
  select case
    when p_fecha is null then ''
    when p_fecha < (now() at time zone 'America/Santiago')::date then ' · VENCIDA (era para el ' || to_char(p_fecha, 'DD-MM') || ')'
    when p_fecha = (now() at time zone 'America/Santiago')::date then ' · PARA HOY'
    else ' · para el ' || to_char(p_fecha, 'DD-MM')
  end;
$$;

-- ─── Los avisos de la solicitud ─────────────────────────────────────────────
create or replace function public.avisar_cambio_de_solped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contrato_nombre text;
  detalle text;
  urgente boolean := new.prioridad = 'urgente'
    or (new.fecha_requerida is not null
        and new.fecha_requerida <= (now() at time zone 'America/Santiago')::date);
  entrada boolean := tg_op = 'INSERT' or old.estado is distinct from new.estado;
begin
  if not entrada then return new; end if;

  select c.nombre into contrato_nombre from public.contratos c where c.id = new.contrato_id;
  detalle := coalesce(new.solicitante_nombre, 'Alguien') || ' · ' || coalesce(contrato_nombre, 'sin contrato')
             || public.texto_de_vencimiento(new.fecha_requerida);

  if new.estado = 'en-aprobacion' then
    perform public.avisar_a(
      array(select public.personas_con_permiso('solped.aprobar', new.empresa_id, new.contrato_id)),
      new.empresa_id, 'solped.por_aprobar',
      'Solicitud por aprobar · ' || new.numero, detalle,
      '/abastecimiento/solped/', new.id, urgente);

  elsif new.estado = 'borrador' and tg_op = 'INSERT' and new.pagnol_solicitud_id is not null then
    perform public.avisar_a(
      array(select public.personas_con_permiso('solped.crear', new.empresa_id, new.contrato_id)),
      new.empresa_id, 'solped.desde_pagnol',
      'Llegó una solicitud desde Pagnol · ' || new.numero, detalle || ' · revísala y envíala a aprobación',
      '/abastecimiento/solped/', new.id, urgente);

  elsif new.estado = 'aprobada' then
    perform public.avisar_a(
      array(select public.personas_con_permiso('cotizacion.gestionar', new.empresa_id, new.contrato_id)),
      new.empresa_id, 'solped.aprobada',
      'Solicitud aprobada: hay que cotizar · ' || new.numero, detalle,
      '/abastecimiento/solped/', new.id, urgente);
    if new.solicitante_id is not null then
      perform public.avisar_a(array[new.solicitante_id], new.empresa_id, 'solped.aprobada_solicitante',
        'Tu solicitud fue aprobada · ' || new.numero, 'Abastecimiento ya puede cotizarla.',
        '/abastecimiento/solped/', new.id, false);
    end if;

  elsif new.estado = 'rechazada' and new.solicitante_id is not null then
    perform public.avisar_a(array[new.solicitante_id], new.empresa_id, 'solped.rechazada',
      'Tu solicitud fue rechazada · ' || new.numero, coalesce(new.motivo_cierre, 'Revisa el motivo en la solicitud.'),
      '/abastecimiento/solped/', new.id, false);
  end if;

  return new;
exception when others then
  -- Pase lo que pase con el aviso, la solicitud se guarda.
  raise warning 'avisar_cambio_de_solped: %', sqlerrm;
  return new;
end $$;

drop trigger if exists solped_avisa on public.solped;
create trigger solped_avisa
  after insert or update of estado on public.solped
  for each row execute function public.avisar_cambio_de_solped();

-- ─── El recordatorio: mientras siga pendiente, vuelve a sonar ───────────────
create or replace function public.recordar_solpeds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ahora timestamp := now() at time zone 'America/Santiago';
  s record;
  quienes uuid[];
  cuantas integer := 0;
  clave text;
  titulo text;
  espera interval;
  urgente boolean;
begin
  -- Solo de 8:00 a 20:00 de Chile.
  if extract(hour from ahora) < 8 or extract(hour from ahora) >= 20 then
    return 0;
  end if;

  for s in
    select so.id, so.numero, so.empresa_id, so.contrato_id, so.estado, so.prioridad,
           so.fecha_requerida, so.solicitante_nombre, c.nombre as contrato
      from public.solped so
      left join public.contratos c on c.id = so.contrato_id
     where so.estado in ('en-aprobacion', 'aprobada')
  loop
    urgente := s.prioridad = 'urgente'
               or (s.fecha_requerida is not null and s.fecha_requerida <= ahora::date);
    espera := case when urgente then interval '2 hours' else interval '4 hours' end;

    if s.estado = 'en-aprobacion' then
      clave := 'solped.aprobar';
      titulo := 'SIGUE POR APROBAR · ' || s.numero;
    else
      clave := 'cotizacion.gestionar';
      titulo := 'SIGUE SIN COTIZAR · ' || s.numero;
    end if;

    /* A quien le toca y no ha recibido NINGÚN aviso de esta solicitud en el
       tiempo de espera (ni el primero ni un recordatorio). */
    select array_agg(p) into quienes
      from public.personas_con_permiso(clave, s.empresa_id, s.contrato_id) as p
     where not exists (
       select 1 from public.notificaciones n
        where n.usuario_id = p and n.referencia = s.id
          and n.tipo in ('solped.por_aprobar', 'solped.aprobada', 'solped.recordatorio')
          and n.creado_en > now() - espera);

    if quienes is not null then
      perform public.avisar_a(
        quienes, s.empresa_id, 'solped.recordatorio', titulo,
        coalesce(s.solicitante_nombre, 'Alguien') || ' · ' || coalesce(s.contrato, 'sin contrato')
          || public.texto_de_vencimiento(s.fecha_requerida),
        '/abastecimiento/solped/', s.id, urgente);
      cuantas := cuantas + cardinality(quienes);
    end if;
  end loop;

  return cuantas;
end $$;

revoke all on function public.recordar_solpeds() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('recordar-solpeds');
exception when others then null;
end $$;

select cron.schedule('recordar-solpeds', '*/30 * * * *', $$ select public.recordar_solpeds(); $$);
