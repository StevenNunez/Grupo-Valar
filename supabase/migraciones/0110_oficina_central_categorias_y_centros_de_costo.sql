-- ============================================================================
-- 0110 — Oficina Central: categorías y centros de costo editables
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0109.
--
-- Pedido del 03-11-2026. Dos preguntas distintas sobre cada egreso:
--
--   · CATEGORÍA       → qué tipo de gasto es (compras, internet, mantención…).
--   · CENTRO DE COSTO → para quién o para qué se gastó (Pagnol, Tokio, general…).
--
-- Antes la lista de categorías estaba fija en un CHECK de la tabla. Ahora son
-- filas que la empresa edita desde la pantalla, y cada egreso apunta a una
-- categoría y a UN centro de costo (nunca se reparte). Los egresos ya cargados
-- quedan en el centro «General»; se reasignan a mano.
--
-- Los ids son textos legibles (`compras`, `servicios`, `general`): los valores
-- que ya guardan los egresos siguen siendo válidos sin tocarlos.
-- ============================================================================

-- ─── 1. Categorías ──────────────────────────────────────────────────────────

create table if not exists public.categorias_oficina (
  empresa_id text not null default public.empresa_actual()
    references public.empresas(id),
  id text not null check (id ~ '^[a-z0-9_]+$'),
  titulo text not null check (btrim(titulo) <> ''),
  -- Inversión (equipos, herramientas): se informa aparte y no es gasto operativo.
  es_activo boolean not null default false,
  activa boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id)
);

-- ─── 2. Centros de costo ────────────────────────────────────────────────────

create table if not exists public.centros_costo_oficina (
  empresa_id text not null default public.empresa_actual()
    references public.empresas(id),
  id text not null check (id ~ '^[a-z0-9_]+$'),
  nombre text not null check (btrim(nombre) <> ''),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id)
);

-- ─── 3. Valores de partida (también para empresas que se creen después) ─────

create or replace function public.sembrar_oficina_central(empresa text)
returns void language sql security definer set search_path = '' as $$
  insert into public.categorias_oficina (empresa_id, id, titulo, es_activo, orden) values
    (empresa, 'compras',      'Compras',                   false, 1),
    (empresa, 'arriendos',    'Arriendos',                 false, 2),
    (empresa, 'insumos',      'Insumos',                   false, 3),
    (empresa, 'activos',      'Compra de activos',         true,  4),
    (empresa, 'reembolsos',   'Reembolsos',                false, 5),
    (empresa, 'servicios',    'Servicios básicos',         false, 6),
    (empresa, 'mantenciones', 'Mantención y reparaciones', false, 7)
  on conflict (empresa_id, id) do nothing;
  insert into public.centros_costo_oficina (empresa_id, id, nombre, orden) values
    (empresa, 'general', 'General', 0)
  on conflict (empresa_id, id) do nothing;
$$;

revoke all on function public.sembrar_oficina_central(text) from public, anon, authenticated;

select public.sembrar_oficina_central(id) from public.empresas;

create or replace function public.sembrar_oficina_central_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sembrar_oficina_central(new.id);
  return new;
end;
$$;

drop trigger if exists empresas_siembra_oficina_central on public.empresas;
create trigger empresas_siembra_oficina_central
  after insert on public.empresas
  for each row execute function public.sembrar_oficina_central_trigger();

-- ─── 4. El egreso apunta a una categoría y a un centro ──────────────────────

-- Se suelta el CHECK fijo (se busca por lo que dice, no por su nombre).
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.egresos_oficina_central'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%categoria%'
       and pg_get_constraintdef(c.oid) ilike '%insumos%'
  loop
    execute format('alter table public.egresos_oficina_central drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.egresos_oficina_central
  drop constraint if exists egresos_oficina_central_categoria_check;

alter table public.egresos_oficina_central
  add column if not exists centro_costo text not null default 'general';

alter table public.egresos_oficina_central
  drop constraint if exists egresos_oficina_categoria_fk;
alter table public.egresos_oficina_central
  add constraint egresos_oficina_categoria_fk
  foreign key (empresa_id, categoria) references public.categorias_oficina (empresa_id, id);

alter table public.egresos_oficina_central
  drop constraint if exists egresos_oficina_centro_fk;
alter table public.egresos_oficina_central
  add constraint egresos_oficina_centro_fk
  foreign key (empresa_id, centro_costo) references public.centros_costo_oficina (empresa_id, id);

create index if not exists egresos_oficina_central_centro_idx
  on public.egresos_oficina_central (empresa_id, centro_costo);

-- ─── 5. Triggers y permisos (mismas reglas que el egreso, 0043) ─────────────

do $$
declare
  t text;
begin
  foreach t in array array['categorias_oficina', 'centros_costo_oficina'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_fecha', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.actualizar_fecha_oficina_central()', t || '_fecha', t);
    execute format('drop trigger if exists %I on public.%I', t || '_autoria', t);
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.marcar_autoria()', t || '_autoria', t);
    execute format('drop trigger if exists %I on public.%I', t || '_auditoria', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t || '_auditoria', t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s: lectura empresa" on public.%I', t, t);
    execute format('create policy "%s: lectura empresa" on public.%I for select to authenticated
                    using (public.ve_empresa(empresa_id))', t, t);

    execute format('drop policy if exists "%s: gestion inserta" on public.%I', t, t);
    execute format('create policy "%s: gestion inserta" on public.%I for insert to authenticated
                    with check (empresa_id = public.empresa_actual() and public.tiene_permiso(''gestion.editar''))', t, t);

    execute format('drop policy if exists "%s: gestion modifica" on public.%I', t, t);
    execute format('create policy "%s: gestion modifica" on public.%I for update to authenticated
                    using (empresa_id = public.empresa_actual() and public.tiene_permiso(''gestion.editar''))
                    with check (empresa_id = public.empresa_actual() and public.tiene_permiso(''gestion.editar''))', t, t);

    -- Borrar una categoría o un centro en uso lo impide la clave foránea; igual
    -- la pantalla solo ofrece apagarlos.
    execute format('drop policy if exists "%s: gestion elimina" on public.%I', t, t);
    execute format('create policy "%s: gestion elimina" on public.%I for delete to authenticated
                    using (empresa_id = public.empresa_actual() and public.tiene_permiso(''gestion.editar''))', t, t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
