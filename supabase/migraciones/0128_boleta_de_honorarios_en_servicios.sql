-- ============================================================================
-- 0128 — Boleta de honorarios en Servicios
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0127.
--
-- POR QUÉ. Un servicio pagado con boleta de honorarios (o con boleta de
-- prestación de servicios de terceros, BPST) no lleva IVA: lleva RETENCIÓN.
-- Valar retiene el 15,25% del bruto (tasa 2026; sube cada año hasta 17% en
-- 2028), lo entera al SII en el F29 y le paga al prestador el líquido. Hasta
-- hoy solo se podía marcar «exento», sin saber cuánto se retenía ni cuánto
-- había que pagarle al prestador.
--
-- QUÉ CAMBIA.
--   · `boleta_honorarios`: el servicio se respalda con una boleta así.
--   · `retencion`: los pesos retenidos, que calcula la pantalla con la tasa
--     del año de la boleta.
--   · El NETO sigue siendo el BRUTO de la boleta y es lo que va al costo del
--     contrato (lo pagado al prestador más lo enterado al SII). El IVA es 0.
--     Por eso ni `costos_unificados` ni `egresos_terceros` cambian.
--   · Líquido a pagar al prestador = neto − retencion.
-- ============================================================================

alter table public.servicios
  add column if not exists boleta_honorarios boolean not null default false;

alter table public.servicios
  add column if not exists retencion bigint not null default 0;

comment on column public.servicios.boleta_honorarios is
  'Se respalda con boleta de honorarios o de prestación de servicios de terceros: sin IVA, con retención.';
comment on column public.servicios.retencion is
  'Pesos retenidos del bruto (neto) y enterados al SII. Líquido al prestador = neto − retencion.';

alter table public.servicios drop constraint if exists servicios_retencion_valida;
alter table public.servicios
  add constraint servicios_retencion_valida check (
    retencion >= 0
    and retencion <= neto
    and (boleta_honorarios or retencion = 0)
    and (not boleta_honorarios or iva = 0)
  );
