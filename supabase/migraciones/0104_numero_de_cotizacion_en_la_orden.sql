-- ============================================================================
-- 0104 — Número de cotización en la orden de compra (opcional)
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0103.
--
-- Muchas OC nacen de una cotización que el proveedor numeró. Ese número se
-- anota en la orden (`numero_cotizacion`) para poder cruzar ambos documentos.
-- Es libre y opcional: las órdenes existentes quedan sin número.
-- ============================================================================

alter table public.ordenes_compra_proveedor
  add column if not exists numero_cotizacion text;

comment on column public.ordenes_compra_proveedor.numero_cotizacion is
  'Número de la cotización del proveedor de la que sale la orden. Opcional, texto libre.';

notify pgrst, 'reload schema';
