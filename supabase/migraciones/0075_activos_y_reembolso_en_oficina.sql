-- ============================================================================
-- 0075 — Activos que no restan del margen, y reembolsos en Oficina Central
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0074.
--
-- Pedido del 13-10-2026.
--
-- 1. ACTIVO. Un gasto es "activo" cuando es inversión y no consumo: equipos,
--    herramientas, mobiliario. Se modela como un tercer valor de `tipo`
--    (ordinario · reembolsable · activo). El Dashboard y el resultado por
--    anexo ya suman el costo solo con `tipo = 'ordinario'` y apartan lo
--    reembolsable; un activo no es ninguno de los dos, así que no resta de la
--    rentabilidad del contrato sin tocar ninguna vista.
--    Las categorías de costo llevan `es_activo`: al elegirla, la línea se
--    marca como activo sola. Se puede cambiar a mano (un mueble comprado en
--    otra categoría) y se puede desmarcar.
--
-- 2. OFICINA CENTRAL gana la categoría «Reembolsos» (alguien pagó de su
--    bolsillo y se le devuelve), como en los contratos.
-- ============================================================================

-- ─── 1. `tipo` admite 'activo' ──────────────────────────────────────────────

do $$
declare
  t text;
  r record;
begin
  foreach t in array array['compras', 'servicios', 'items_compra'] loop
    -- Se busca la restricción por lo que dice, no por su nombre.
    for r in
      select c.conname
        from pg_constraint c
       where c.conrelid = format('public.%I', t)::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ilike '%reembolsable%'
         and pg_get_constraintdef(c.oid) ilike '%tipo%'
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_tipo_check');
    execute format(
      'alter table public.%I add constraint %I check (tipo in (''ordinario'', ''reembolsable'', ''activo''))',
      t, t || '_tipo_check');
  end loop;
end;
$$;

-- ─── 2. Categorías que son activos ──────────────────────────────────────────

alter table public.categorias_costo
  add column if not exists es_activo boolean not null default false;

comment on column public.categorias_costo.es_activo is
  'Lo que se compra con esta categoría es inversión (equipos, herramientas, mobiliario): las líneas se marcan como activo y no restan del margen del contrato.';

-- Las que ya existen con esos nombres. Es una ayuda: se corrige desde la categoría.
update public.categorias_costo
   set es_activo = true
 where not es_activo
   and familia = 'compras'
   and nombre ~* '(equipo|herramienta|mobiliario|mueble|activo)';

-- ─── 3. Oficina Central: reembolsos ─────────────────────────────────────────

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
  add constraint egresos_oficina_central_categoria_check
  check (categoria in ('compras', 'arriendos', 'insumos', 'activos', 'reembolsos'));

notify pgrst, 'reload schema';
