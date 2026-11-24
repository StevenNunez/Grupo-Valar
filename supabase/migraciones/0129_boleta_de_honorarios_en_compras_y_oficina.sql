-- ============================================================================
-- 0129 — Boleta de honorarios también en Compras y en Oficina Central
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0128.
--
-- Lo mismo que la 0128 hizo en Servicios: una compra directa o un egreso de
-- Oficina Central puede respaldarse con boleta de honorarios o de prestación
-- de servicios de terceros. Sin IVA, con retención (15,25% en 2026).
--
--   · `boleta_honorarios`: el gasto se respalda con una boleta así.
--   · `retencion`: los pesos retenidos y enterados al SII en el F29.
--   · El NETO sigue siendo el BRUTO y es el gasto. Líquido = neto − retencion.
--     Ninguna vista de costo cambia.
-- ============================================================================

-- ─── Compras ────────────────────────────────────────────────────────────────

alter table public.compras
  add column if not exists boleta_honorarios boolean not null default false;
alter table public.compras
  add column if not exists retencion bigint not null default 0;

comment on column public.compras.boleta_honorarios is
  'Se respalda con boleta de honorarios o de prestación de servicios de terceros: sin IVA, con retención.';
comment on column public.compras.retencion is
  'Pesos retenidos del bruto (neto) y enterados al SII. Líquido al prestador = neto − retencion.';

alter table public.compras drop constraint if exists compras_retencion_valida;
alter table public.compras
  add constraint compras_retencion_valida check (
    retencion >= 0
    and retencion <= neto
    and (boleta_honorarios or retencion = 0)
    and (not boleta_honorarios or iva = 0)
  );

-- ─── Oficina Central ────────────────────────────────────────────────────────

alter table public.egresos_oficina_central
  add column if not exists boleta_honorarios boolean not null default false;
alter table public.egresos_oficina_central
  add column if not exists retencion bigint not null default 0;

comment on column public.egresos_oficina_central.boleta_honorarios is
  'Se respalda con boleta de honorarios o de prestación de servicios de terceros: sin IVA, con retención.';
comment on column public.egresos_oficina_central.retencion is
  'Pesos retenidos del bruto (neto) y enterados al SII. Líquido al prestador = neto − retencion.';

alter table public.egresos_oficina_central drop constraint if exists egresos_oficina_retencion_valida;
alter table public.egresos_oficina_central
  add constraint egresos_oficina_retencion_valida check (
    retencion >= 0
    and retencion <= neto
    and (boleta_honorarios or retencion = 0)
    and (not boleta_honorarios or iva = 0)
  );
