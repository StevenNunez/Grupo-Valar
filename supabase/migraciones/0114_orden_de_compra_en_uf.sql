-- ============================================================================
-- 0114 — Orden de compra cotizada en UF
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0113.
--
-- POR QUÉ. Hay proveedores que cotizan en UF. La orden se arma con los precios
-- en UF y se convierte a pesos con la UF de un día.
--
-- QUÉ CAMBIA. Solo se agregan columnas; nada existente se toca:
--   · ordenes_compra_proveedor.moneda     'CLP' (por defecto) o 'UF'.
--   · ordenes_compra_proveedor.valor_uf   la UF con que se convirtió (pesos por UF).
--   · items_compra.precio_uf              el precio unitario cotizado, en UF
--                                         (de lista, antes del descuento).
-- `precio_unitario`, `neto`, IVA, facturas, costo y PDF siguen en pesos: la
-- orden en UF queda fijada al valor de la UF con que se emitió, como cualquier
-- otra, y todo lo que cuelga de ella cuadra sin saber que hubo UF.
-- ============================================================================

alter table public.ordenes_compra_proveedor
  add column if not exists moneda text not null default 'CLP',
  add column if not exists valor_uf numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ordenes_compra_proveedor_moneda_check'
  ) then
    alter table public.ordenes_compra_proveedor
      add constraint ordenes_compra_proveedor_moneda_check check (moneda in ('CLP', 'UF'));
  end if;
end $$;

alter table public.items_compra
  add column if not exists precio_uf numeric(14,4);

comment on column public.ordenes_compra_proveedor.moneda is
  'Moneda en que se cotizó la orden: CLP o UF. Los montos guardados son siempre pesos.';
comment on column public.ordenes_compra_proveedor.valor_uf is
  'Pesos por UF con que se convirtió la orden (solo moneda UF). Queda fijo: la orden no se reajusta.';
comment on column public.items_compra.precio_uf is
  'Precio unitario cotizado en UF, de lista (antes del descuento). Solo órdenes en UF.';

notify pgrst, 'reload schema';
