-- ============================================================================
-- Plataforma Valar — Autoría y bitácora de cambios
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0001 y 0002.
--
-- IDEA CENTRAL: quién hizo qué no lo declara la app, lo estampa la base.
--
-- Si la app mandara el "creado_por", bastaría con un cliente modificado para
-- firmar a nombre de otro. Acá lo pone un trigger desde `auth.uid()`, que sale
-- del token firmado por Supabase. Y como la bitácora también es un trigger,
-- queda registro aunque alguien edite desde el editor de tablas de Supabase o
-- desde un script: no hay puerta lateral.
-- ============================================================================

-- Las tablas que se auditan. Si mañana se agrega una, se suma acá y listo.
create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'costos_personal', 'seguridad'
  ];
$$;

-- ─── Autoría en cada fila ───────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array public.tablas_auditadas() loop
    execute format(
      'alter table public.%I
         add column if not exists creado_por uuid references auth.users (id) on delete set null', t);
    execute format(
      'alter table public.%I
         add column if not exists actualizado_por uuid references auth.users (id) on delete set null', t);
  end loop;
end;
$$;

/*
  Estampa quién crea y quién modifica.

  `creado_por` se copia de la fila anterior en cada UPDATE: el autor original
  no se puede reescribir, ni por error ni a propósito.
*/
create or replace function public.marcar_autoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.actualizado_por := auth.uid();
  else
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
    new.actualizado_por := auth.uid();
  end if;
  return new;
end;
$$;

-- ─── Bitácora ───────────────────────────────────────────────────────────────

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('creado', 'modificado', 'eliminado')),
  usuario_id uuid,
  -- Copia del nombre y el correo: si mañana se borra la cuenta, la bitácora
  -- tiene que seguir diciendo quién fue.
  usuario_nombre text,
  usuario_correo text,
  /* Solo los campos que cambiaron: {"neto": {"antes": 100, "despues": 120}}.
     Guardar la fila entera en cada edición engordaría la tabla sin aportar. */
  cambios jsonb,
  /* La fila completa al crear y al eliminar: es lo que permite reconstruir un
     registro borrado por error. */
  datos jsonb,
  ocurrido_en timestamptz not null default now()
);

comment on table public.auditoria is
  'Bitácora de cambios. La escriben triggers, nunca la aplicación.';

create index if not exists auditoria_registro_idx
  on public.auditoria (tabla, registro_id, ocurrido_en desc);
create index if not exists auditoria_fecha_idx
  on public.auditoria (ocurrido_en desc);
create index if not exists auditoria_usuario_idx
  on public.auditoria (usuario_id, ocurrido_en desc);

/*
  Escribe una entrada por cada cambio.

  `security definer` es lo que le permite insertar en `auditoria` aunque quien
  dispara el trigger no tenga —a propósito— ningún permiso de escritura ahí.
*/
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fila jsonb;
  anterior jsonb;
  diferencias jsonb;
  accion text;
  quien uuid := auth.uid();
  nombre text;
  correo text;
  clave text;
  -- Columnas de servicio: cambian en cada edición y ensuciarían el diff.
  ignoradas text[] := array['actualizado_en', 'actualizado_por', 'creado_en', 'creado_por'];
begin
  select p.nombre into nombre from public.perfiles p where p.id = quien;
  select u.email into correo from auth.users u where u.id = quien;

  if tg_op = 'DELETE' then
    accion := 'eliminado';
    fila := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    accion := 'creado';
    fila := to_jsonb(new);
  else
    accion := 'modificado';
    fila := to_jsonb(new);
    anterior := to_jsonb(old);

    diferencias := '{}'::jsonb;
    for clave in select jsonb_object_keys(fila) loop
      if not (clave = any(ignoradas))
         and (fila -> clave) is distinct from (anterior -> clave) then
        diferencias := diferencias || jsonb_build_object(
          clave,
          jsonb_build_object('antes', anterior -> clave, 'despues', fila -> clave)
        );
      end if;
    end loop;

    -- Un UPDATE que no cambió nada real no merece una línea en la bitácora.
    if diferencias = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.auditoria (
    tabla, registro_id, accion, usuario_id, usuario_nombre, usuario_correo, cambios, datos
  )
  values (
    tg_table_name,
    coalesce(fila ->> 'id', '(sin id)'),
    accion,
    quien,
    nombre,
    correo,
    diferencias,
    case when accion = 'modificado' then null else fila end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ─── Enganche de los triggers ───────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array public.tablas_auditadas() loop
    -- El de autoría corre ANTES, para que el de bitácora ya vea los valores.
    execute format('drop trigger if exists %I_autoria on public.%I', t, t);
    execute format(
      'create trigger %I_autoria before insert or update on public.%I
         for each row execute function public.marcar_autoria()', t, t);

    execute format('drop trigger if exists %I_auditoria on public.%I', t, t);
    execute format(
      'create trigger %I_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end;
$$;

-- ─── RLS de la bitácora ─────────────────────────────────────────────────────
-- Se lee con sesión; NADIE la escribe desde la aplicación. Al no existir
-- políticas de insert, update ni delete, el único camino de entrada es el
-- trigger `security definer`. Una bitácora que se puede editar no sirve.

alter table public.auditoria enable row level security;

drop policy if exists "auditoria: lectura autenticada" on public.auditoria;
create policy "auditoria: lectura autenticada"
  on public.auditoria for select
  to authenticated
  using (true);

-- ─── Borrar un contrato ya no arrasa con su historia ────────────────────────
-- En 0002 las claves foráneas iban con `on delete cascade`: borrar un contrato
-- se llevaba en silencio sus estados de pago, sus facturas y sus compras.
-- Con `restrict`, la base lo impide y la aplicación puede explicar por qué.

do $$
declare
  r record;
begin
  for r in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'contratos'
      and tc.table_name in (
        'estados_pago', 'ordenes_compra', 'facturas', 'compras', 'costos_personal'
      )
  loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
    execute format(
      'alter table public.%I
         add constraint %I foreign key (contrato_id)
         references public.contratos (id) on delete restrict',
      r.table_name, r.constraint_name);
  end loop;
end;
$$;

-- ─── Vista de la bitácora con lo justo para mostrarla ───────────────────────

drop view if exists public.auditoria_reciente;
create view public.auditoria_reciente
with (security_invoker = true) as
  select
    id, tabla, registro_id, accion,
    coalesce(usuario_nombre, usuario_correo, 'Sistema') as usuario,
    usuario_correo,
    cambios,
    ocurrido_en
  from public.auditoria
  order by ocurrido_en desc;
