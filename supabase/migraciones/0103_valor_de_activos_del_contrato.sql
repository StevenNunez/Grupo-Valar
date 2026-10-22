-- ============================================================================
-- 0103 — Valor de referencia de los activos de un contrato
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0102.
--
-- El Dashboard y la ficha de cierre muestran, solo como dato informativo, cuánto
-- valen los activos de un contrato. Mientras cada activo no tenga su valor en
-- «Activos», ese total se anota acá a mano. Cuando los activos del contrato
-- tienen valor cargado, el total sale de ellos y este número deja de usarse.
-- No cuenta como gasto ni cambia ningún resultado.
-- ============================================================================

alter table public.contratos
  add column if not exists valor_activos_referencia bigint
  check (valor_activos_referencia is null or valor_activos_referencia >= 0);

comment on column public.contratos.valor_activos_referencia is
  'Valor neto total de los activos del contrato, anotado a mano. Solo informativo (no es gasto): se usa mientras los activos no tengan su valor cargado en activos_valar.';

-- Salar de Atacama: $29.006.049 neto, según el usuario (22-10-2026).
update public.contratos
   set valor_activos_referencia = 29006049
 where id = 'SA95000016393'
   and valor_activos_referencia is null;

notify pgrst, 'reload schema';
