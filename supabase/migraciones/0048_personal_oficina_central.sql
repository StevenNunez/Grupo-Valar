-- ============================================================================
-- 0048 — Personal de Oficina Central: la nómina del mes y quién la compone
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0043 (usa `tiene_permiso()` y redefine `ve_registro()`).
--
-- POR QUÉ DOS TABLAS: la nómina de la casa matriz se mira de dos formas. El
-- resumen del mes —dotación, sueldo base + gratificación, HH extra, no
-- imponible, total haberes— es el mismo que el "Resumen de Haberes" de cada
-- contrato; el detalle es persona por persona. El resumen NO se escribe: sale
-- de sumar a los trabajadores, para que nunca haya dos cifras que no cuadran.
-- La nómina en PDF/Excel se adjunta al mes, con el clip.
--
-- QUIÉN LA VE: son sueldos de la oficina, incluidos los de gerencia. Pide
-- "Ver egresos de oficina central" Y "Ver costos de personal"; para cargar,
-- "Cargar costos de personal". Como Oficina Central no es de ningún contrato,
-- se mira el permiso y no los contratos de la persona (igual que la 0043).
-- ============================================================================

-- ─── 1. La nómina del mes ───────────────────────────────────────────────────

create table if not exists public.nominas_oficina_central (
  empresa_id text not null default public.empresa_actual()
    references public.empresas(id),
  id uuid not null default gen_random_uuid(),
  periodo date not null check (extract(day from periodo) = 1),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id),
  -- Una nómina por mes: dos del mismo mes se sumarían dos veces en el Dashboard.
  unique (empresa_id, periodo)
);

comment on table public.nominas_oficina_central is
  'La nómina mensual del personal de Oficina Central. Sus totales salen de nomina_oficina_trabajadores.';

-- ─── 2. Cada trabajador de esa nómina ───────────────────────────────────────

create table if not exists public.nomina_oficina_trabajadores (
  empresa_id text not null default public.empresa_actual()
    references public.empresas(id),
  id uuid not null default gen_random_uuid(),
  nomina_id uuid not null,
  nombre text not null check (btrim(nombre) <> ''),
  rut text,
  cargo text,
  /* Las columnas del Resumen de Haberes, en el mismo orden. */
  sueldo_base numeric(15, 0) not null default 0 check (sueldo_base >= 0),
  horas_extra_monto numeric(15, 0) not null default 0 check (horas_extra_monto >= 0),
  horas_extra_cantidad numeric(8, 1) not null default 0 check (horas_extra_cantidad >= 0),
  no_imponible numeric(15, 0) not null default 0 check (no_imponible >= 0),
  total_haberes numeric(15, 0)
    generated always as (sueldo_base + horas_extra_monto + no_imponible) stored,
  /* Aportes del empleador: SIS, seguro de cesantía, mutual. Es costo de la
     empresa aunque no esté en los haberes. */
  leyes_sociales numeric(15, 0) not null default 0 check (leyes_sociales >= 0),
  costo_total numeric(15, 0)
    generated always as (sueldo_base + horas_extra_monto + no_imponible + leyes_sociales) stored,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id),
  foreign key (empresa_id, nomina_id)
    references public.nominas_oficina_central (empresa_id, id) on delete cascade
);

comment on column public.nomina_oficina_trabajadores.sueldo_base is
  'Sueldo base + gratificación, como en el Resumen de Haberes.';
comment on column public.nomina_oficina_trabajadores.leyes_sociales is
  'Aportes del empleador (SIS, cesantía, mutual). Suma al costo, no a los haberes.';

create index if not exists nomina_oficina_trabajadores_nomina_idx
  on public.nomina_oficina_trabajadores (empresa_id, nomina_id);

-- ─── 3. Fecha de cambio, autoría y bitácora ─────────────────────────────────
-- La función de fecha es la de la 0038: sirve para cualquier tabla.

do $$
declare
  t text;
begin
  foreach t in array array['nominas_oficina_central', 'nomina_oficina_trabajadores'] loop
    execute format('drop trigger if exists %I_fecha on public.%I', t, t);
    execute format(
      'create trigger %I_fecha before update on public.%I
         for each row execute function public.actualizar_fecha_oficina_central()', t, t);

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

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  lee text := $q$public.ve_empresa(empresa_id) and public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.ver')$q$;
  escribe text := $q$empresa_id = public.empresa_actual() and public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.editar')$q$;
begin
  foreach t in array array['nominas_oficina_central', 'nomina_oficina_trabajadores'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "personal oficina: lee" on public.%I', t);
    execute format(
      'create policy "personal oficina: lee" on public.%I for select to authenticated using (%s)', t, lee);

    execute format('drop policy if exists "personal oficina: crea" on public.%I', t);
    execute format(
      'create policy "personal oficina: crea" on public.%I for insert to authenticated with check (%s)', t, escribe);

    execute format('drop policy if exists "personal oficina: cambia" on public.%I', t);
    execute format(
      'create policy "personal oficina: cambia" on public.%I for update to authenticated using (%s) with check (%s)', t, escribe, escribe);

    execute format('drop policy if exists "personal oficina: borra" on public.%I', t);
    execute format(
      'create policy "personal oficina: borra" on public.%I for delete to authenticated using (%s)', t, escribe);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ─── 5. Historial y nómina adjunta ──────────────────────────────────────────
-- El "Historial" y los respaldos se ven si se ve el registro: `ve_registro`
-- solo acepta las tablas que conoce, así que se suman las dos nuevas. El resto
-- de la función queda igual que en la 0042.

create or replace function public.ve_registro(tabla text, registro text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  visto boolean;
begin
  if not (tabla = any (public.tablas_auditadas() || array[
    'egresos_oficina_central', 'ordenes_compra_proveedor', 'items_compra',
    'nominas_oficina_central', 'nomina_oficina_trabajadores'
  ])) then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id::text = $1)', tabla)
     into visto
    using registro;
  return visto;
end;
$$;

/* La nómina en PDF/Excel cuelga del mes. Sin sumarla acá, adjuntarla falla
   por la restricción. */
alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'facturas', 'ordenes_compra', 'compras',
    'servicios', 'costos_personal', 'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos', 'articulos',
    'nominas_oficina_central'
  )
);

notify pgrst, 'reload schema';
