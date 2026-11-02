-- ════════════════════════════════════════════════════════════════════════════
-- 0108 · El nombre con que se le PIDE cada ítem a un proveedor
-- ════════════════════════════════════════════════════════════════════════════
--
-- Faena pidió «arena», pero al proveedor hay que pedirle «Arena lavada para
-- hormigón, 1 m³». Hasta hoy el nombre del pedido salía del catálogo
-- (`nombre_tecnico`) o, si el ítem no estaba en el catálogo, tal cual lo
-- escribió faena, y no había dónde corregirlo al momento de cotizar sin tocar
-- la solicitud.
--
-- Ahora, al pedir cotización, cada línea puede llevar su propio nombre:
--
--   · la SOLICITUD de faena NO cambia (sigue diciendo «arena»);
--   · el pedido a ESE proveedor (PDF, correo, enlace) sale con el nombre nuevo;
--   · cada proveedor puede recibir un nombre distinto para el mismo ítem.
--
-- Nulo = no se corrigió: se pide con el nombre del catálogo o el de faena, como
-- siempre. Es distinto de `nombre_cotizado` (0088), que es lo que el proveedor
-- contestó; este es lo que se le preguntó.
--
-- Se aplica pegándola entera en el SQL Editor. Es idempotente.

alter table public.cotizacion_items
  add column if not exists nombre_pedido text;

comment on column public.cotizacion_items.nombre_pedido is
  'Nombre con que se le pidió el ítem a este proveedor, cuando se corrigió al pedir. Nulo = el del catálogo o el de la solicitud. La solicitud de faena no cambia.';

notify pgrst, 'reload schema';
