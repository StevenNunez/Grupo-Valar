-- ============================================================================
-- Plataforma Valar — esquema inicial: perfiles + módulo Control de Gestión
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar este archivo entero → Run.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- IMPORTANTE: la seguridad de esta aplicación vive AQUÍ, en las políticas RLS,
-- no en el navegador. La clave publishable es pública por diseño; lo que
-- impide leer datos es que ninguna política se lo permita a un anónimo.
-- ============================================================================

-- ─── Perfiles ───────────────────────────────────────────────────────────────
-- Extiende auth.users con lo que la plataforma necesita mostrar y con el rol.

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  cargo text not null default '',
  rol text not null default 'lectura'
    check (rol in ('lectura', 'gestion', 'admin')),
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is
  'Datos visibles del usuario y su rol. Una fila por cuenta de auth.users.';

-- Rol del usuario que hace la consulta.
-- `security definer` a propósito: la función se salta RLS, si no consultar
-- `perfiles` desde una política de `perfiles` se llamaría a sí misma sin fin.
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- Atajo para las políticas de escritura.
create or replace function public.puede_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('gestion', 'admin'), false);
$$;

-- Cada cuenta nueva de auth.users nace con su perfil. El nombre y el cargo
-- salen de los metadatos que manda quien crea el usuario; si no vienen, se
-- usa la parte del correo antes de la arroba.
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, cargo, rol)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'cargo', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'lectura')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ─── Contratos ──────────────────────────────────────────────────────────────

create table if not exists public.contratos (
  id text primary key,                                   -- "C-2601"
  nombre text not null,
  cliente text not null,
  faena text not null,
  avance smallint not null default 0
    check (avance between 0 and 100),                    -- % de avance físico
  presupuesto bigint not null check (presupuesto >= 0),  -- pesos chilenos
  costo_real bigint not null default 0 check (costo_real >= 0),
  estado text not null
    check (estado in ('en-plazo', 'en-riesgo', 'atrasado', 'cerrado')),
  termino date not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.contratos is
  'Cartera de contratos. Los montos van en pesos chilenos, sin decimales.';

create index if not exists contratos_estado_idx on public.contratos (estado);
create index if not exists contratos_termino_idx on public.contratos (termino);

-- ─── Facturación mensual ────────────────────────────────────────────────────

create table if not exists public.facturacion (
  periodo date primary key,                              -- primer día del mes
  monto bigint not null check (monto >= 0),
  actualizado_en timestamptz not null default now()
);

comment on column public.facturacion.periodo is
  'Siempre el día 1 del mes que representa (2026-09-01 = septiembre de 2026).';

-- ─── Indicadores de seguridad (una sola fila) ───────────────────────────────

create table if not exists public.seguridad (
  id boolean primary key default true check (id),        -- fuerza fila única
  dias_sin_accidentes integer not null default 0 check (dias_sin_accidentes >= 0),
  hh_acumuladas bigint not null default 0 check (hh_acumuladas >= 0),
  ultima_auditoria date,
  actualizado_en timestamptz not null default now()
);

-- ─── Marca de tiempo al editar ──────────────────────────────────────────────

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists contratos_actualizado on public.contratos;
create trigger contratos_actualizado
  before update on public.contratos
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists facturacion_actualizado on public.facturacion;
create trigger facturacion_actualizado
  before update on public.facturacion
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists seguridad_actualizado on public.seguridad;
create trigger seguridad_actualizado
  before update on public.seguridad
  for each row execute function public.tocar_actualizado_en();

-- ============================================================================
-- Row Level Security
--
-- Sin una política que lo permita, NADIE lee ni escribe: ese es el muro real.
-- Regla de la casa: quien tiene sesión iniciada lee todo; escribir requiere
-- rol 'gestion' o 'admin'. Los anónimos no tienen ninguna política, así que
-- no ven absolutamente nada.
-- ============================================================================

alter table public.perfiles    enable row level security;
alter table public.contratos   enable row level security;
alter table public.facturacion enable row level security;
alter table public.seguridad   enable row level security;

-- Perfiles: cada quien ve el directorio interno y edita solo el suyo.
drop policy if exists "perfiles: lectura autenticada" on public.perfiles;
create policy "perfiles: lectura autenticada"
  on public.perfiles for select
  to authenticated
  using (true);

drop policy if exists "perfiles: edita el propio" on public.perfiles;
create policy "perfiles: edita el propio"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rol = public.rol_actual());  -- nadie se auto-asciende

-- Contratos, facturación y seguridad: mismas reglas para las tres.
do $$
declare
  t text;
begin
  foreach t in array array['contratos', 'facturacion', 'seguridad'] loop
    execute format('drop policy if exists "%s: lectura autenticada" on public.%I', t, t);
    execute format(
      'create policy "%s: lectura autenticada" on public.%I for select to authenticated using (true)',
      t, t);

    execute format('drop policy if exists "%s: escribe gestion" on public.%I', t, t);
    execute format(
      'create policy "%s: escribe gestion" on public.%I for all to authenticated using (public.puede_editar()) with check (public.puede_editar())',
      t, t);
  end loop;
end;
$$;
