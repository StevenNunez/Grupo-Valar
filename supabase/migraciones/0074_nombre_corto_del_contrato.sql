-- ============================================================================
-- 0074 — Nombre corto / interno del contrato
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0073.
--
-- Pedido del 13-10-2026: un alias para elegir el contrato en los desplegables
-- y filtros (Torres, Misceláneo, Carpa) en vez del nombre largo o el número.
-- Es opcional: sin alias, los selectores siguen mostrando "código · nombre".
-- Los anexos ya tenían el suyo (anexos.nombre, 0059).
-- ============================================================================

alter table public.contratos
  add column if not exists nombre_corto text;

alter table public.contratos
  drop constraint if exists contratos_nombre_corto_check;
alter table public.contratos
  add constraint contratos_nombre_corto_check
  check (nombre_corto is null or length(btrim(nombre_corto)) between 1 and 40);

comment on column public.contratos.nombre_corto is
  'Alias interno para desplegables y filtros (Torres, Misceláneo, Carpa). Opcional.';

notify pgrst, 'reload schema';
