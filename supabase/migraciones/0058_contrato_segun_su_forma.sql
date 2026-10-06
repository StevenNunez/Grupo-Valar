-- ============================================================================
-- 0058 — El contrato según su forma, y la plantilla de EDP configurable
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente.
--
-- Pedido del 06-10-2026:
--
-- 1. PLANTILLA "CONFIGURABLE" (quinta, se mantiene "General"). Reúne todos los
--    campos de las otras plantillas —descripción, HH, monto GR, avance real y
--    programado, retenciones, equipos y conceptos en UF— y en cada contrato
--    se marcan los que van. `edp_campos` guarda las claves marcadas. Cada EDP
--    copia esa lista al emitirse (en sus `datos`), así un EDP ya presentado no
--    cambia si después se edita el contrato.
--
-- 2. CONDICIONES SEGÚN LA FORMA DE CONTRATACIÓN. Un arriendo se describe con
--    equipos y tarifas; unos precios unitarios con un itemizado; una suma
--    alzada con hitos; una administración delegada con su honorario. Son
--    OPCIONALES: ninguna impide crear el contrato. Van en `condiciones` (jsonb)
--    porque cada forma tiene su propia forma; la app define y valida su
--    estructura. Todos los montos son NETOS: el IVA se calcula, no se guarda.
-- ============================================================================

alter table public.contratos drop constraint if exists contratos_plantilla_edp_check;
alter table public.contratos add constraint contratos_plantilla_edp_check
  check (plantilla_edp in ('general', 'miscelaneos', 'torres', 'carpas', 'configurable'));

alter table public.contratos
  add column if not exists edp_campos text[] not null default '{}',
  add column if not exists condiciones jsonb not null default '{}'::jsonb;

comment on column public.contratos.edp_campos is
  'Plantilla "configurable": las claves de los campos que lleva el EDP de este contrato.';
comment on column public.contratos.condiciones is
  'Lo propio de su forma de contratación (equipos y tarifas, itemizado, hitos, honorario). Opcional. Montos netos.';

notify pgrst, 'reload schema';
