-- ════════════════════════════════════════════════════════════════════════════
-- 0088 · El nombre con que el proveedor cotizó cada ítem
-- ════════════════════════════════════════════════════════════════════════════
--
-- Faena pide "lentes oscuros" y el proveedor cotiza "LENTE MAX FENIX IN OUT".
-- Ese nombre técnico es el único con el que se puede comprar sin errores, y
-- hasta hoy se tecleaba en la cotización y se perdía: la OC salía con el nombre
-- de faena.
--
-- Ahora cada línea de la cotización guarda el nombre tal como lo cotizó el
-- proveedor (editable al cargar los precios). De ahí:
--   · la orden de compra nace con ese nombre técnico;
--   · si el ítem está en el catálogo, se aprende para ese proveedor
--     (`articulo_proveedor`) y, si el artículo aún no tenía nombre técnico,
--     queda también como el nombre con que se pide en las próximas solicitudes.
--
-- Nulo = no se editó: la orden usa el nombre de la solicitud, como siempre.
--
-- Se aplica pegándola entera en el SQL Editor. Es idempotente.

alter table public.cotizacion_items
  add column if not exists nombre_cotizado text;

comment on column public.cotizacion_items.nombre_cotizado is
  'Nombre del ítem tal como lo cotizó el proveedor (nombre técnico). La OC nace con él. Nulo = el de la solicitud.';

notify pgrst, 'reload schema';
