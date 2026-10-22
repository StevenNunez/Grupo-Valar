-- ============================================================================
-- 0100 — Cada línea de compra marcada «activo» tiene su ficha editable
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0099.
--
-- Hasta hoy `activos_valar` (0096) solo podía describir un activo que Pagnol ya
-- conocía (`pagnol_activo_id`). Pero lo comprado como «activo» (p. ej. las 18
-- líneas de la OC de Salar de Atacama) no siempre pasa por Pagnol, y entonces no
-- aparecía en la pantalla de Activos. Ahora la ficha puede colgar de una línea
-- de compra: `linea_id` es el `id` de la línea en `costos_unificados`.
--
-- Una ficha cuelga de un activo de Pagnol O de una línea de compra (al menos
-- una de las dos). Las fichas ya cargadas no cambian.
-- ============================================================================

alter table public.activos_valar
  alter column pagnol_activo_id drop not null;

alter table public.activos_valar
  add column if not exists linea_id text;

comment on column public.activos_valar.linea_id is
  'Id de la línea de compra marcada «activo» (costos_unificados.id) de la que sale esta ficha, cuando el activo no pasó por Pagnol.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activos_valar_linea_unica') then
    alter table public.activos_valar
      add constraint activos_valar_linea_unica unique (empresa_id, linea_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activos_valar_tiene_origen') then
    alter table public.activos_valar
      add constraint activos_valar_tiene_origen check (pagnol_activo_id is not null or linea_id is not null);
  end if;
end $$;

notify pgrst, 'reload schema';
