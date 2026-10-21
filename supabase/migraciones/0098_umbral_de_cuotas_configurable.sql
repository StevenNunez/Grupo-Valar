-- ============================================================================
-- 0098 — El monto desde el que se sugiere pagar en cuotas es un parámetro
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0097.
--
-- Las facturas grandes se acuerdan con el proveedor en cuotas. «Grande» lo
-- define cada empresa: hasta hoy el $5.000.000 estaba escrito en el código; ahora
-- vive en `parametros_pago` junto al tope semanal y el plazo, y se cambia desde
-- «Parámetros» en Pagos (quien tiene el permiso «Cambiar parámetros»).
--
-- Es solo una sugerencia: el botón «Pagar en cuotas» aparece en las facturas desde
-- ese neto. Una factura menor también se puede pagar en cuotas si ya tiene plan.
-- ============================================================================

alter table public.parametros_pago
  add column if not exists umbral_cuotas bigint not null default 5000000
    check (umbral_cuotas >= 0);

comment on column public.parametros_pago.umbral_cuotas is
  'Desde este total (con IVA) se ofrece pagar una factura en cuotas. Es una sugerencia, no una restricción.';

notify pgrst, 'reload schema';
