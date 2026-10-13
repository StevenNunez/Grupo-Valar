-- ============================================================================
-- 0073 — Cómo se cobra cada línea del detalle por equipo
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0072.
--
-- POR QUÉ: en el detalle de un arriendo de torres, los días no cambiaban el
-- neto: solo se multiplicaba cantidad × precio. Ahora cada línea dice si su
-- tarifa es por día, por mes (prorrateada por días sobre 30) o por unidad.
-- ============================================================================

alter table public.servicio_lineas
  add column if not exists cobro text not null default 'mes'
  check (cobro in ('dia', 'mes', 'unidad'));

comment on column public.servicio_lineas.cobro is
  'dia: neto = días × cantidad × tarifa. mes: cantidad × tarifa × días/30 (sin días, el mes completo). unidad: cantidad × tarifa.';

notify pgrst, 'reload schema';
