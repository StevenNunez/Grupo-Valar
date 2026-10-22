-- ============================================================================
-- 0102 — Descuento en la orden de compra
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0101.
--
-- Algunas OC traen un descuento sobre el subtotal (p. ej. 15 %). El descuento se
-- guarda en la orden (`descuento_porcentaje`) y, línea por línea, el precio de
-- lista (`precio_lista`). El `precio_unitario` de cada línea pasa a ser el precio
-- YA con descuento: así el neto, el IVA, el costo, las facturas, el resumen
-- mensual y el Dashboard cuadran con el total de la OC sin tocar ninguna vista.
--
--   precio_lista     lo que dice la lista del proveedor; nulo = sin descuento
--   precio_unitario  lo que se paga (lista menos descuento, a peso entero)
--
-- Las órdenes existentes quedan igual (descuento 0, sin precio de lista).
-- ============================================================================

alter table public.ordenes_compra_proveedor
  add column if not exists descuento_porcentaje numeric(5, 2) not null default 0
    check (descuento_porcentaje >= 0 and descuento_porcentaje < 100);

comment on column public.ordenes_compra_proveedor.descuento_porcentaje is
  'Descuento sobre el subtotal de la orden, en %. Ya está aplicado en el precio_unitario de cada línea; precio_lista guarda el original.';

alter table public.items_compra
  add column if not exists precio_lista bigint check (precio_lista is null or precio_lista >= 0);

comment on column public.items_compra.precio_lista is
  'Precio unitario antes del descuento de la orden. Nulo si la orden no tiene descuento. precio_unitario es el que se paga.';

notify pgrst, 'reload schema';
