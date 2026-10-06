-- ============================================================================
-- 0065 — Finiquito firmado con reserva de derechos
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0064.
--
-- Pedido del 06-10-2026: saber qué finiquitos se firmaron con reserva de
-- derechos. Un finiquito así no cierra el tema: el trabajador puede demandar
-- por lo que se reservó, y eso es un costo que puede venir.
-- ============================================================================

alter table public.finiquitos
  add column if not exists con_reserva boolean not null default false,
  add column if not exists reserva_detalle text;

comment on column public.finiquitos.con_reserva is
  'El trabajador firmó con reserva de derechos: puede reclamar lo reservado.';
comment on column public.finiquitos.reserva_detalle is
  'Qué se reservó, como quedó escrito en el finiquito. Opcional.';

notify pgrst, 'reload schema';
