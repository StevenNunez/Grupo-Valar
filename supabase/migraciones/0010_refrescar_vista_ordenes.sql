-- ============================================================================
-- Plataforma Valar — La vista de órdenes se queda con las columnas viejas
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0009.
--
-- EL PROBLEMA: `ordenes_proveedor_resumen` se creó en 0007 con `select o.*`.
-- Eso PARECE dinámico, pero no lo es: Postgres expande el asterisco en el
-- momento de crear la vista y congela esa lista de columnas. Las que agregaron
-- 0008 y 0009 —proyecto, emisor, dirección del proveedor— quedaron fuera.
--
-- El síntoma es traicionero: los datos se guardan bien en la tabla, pero salen
-- vacíos en pantalla. Nada falla; simplemente no llegan.
--
-- La cura es recrear la vista. Y la regla para el futuro: cada vez que se
-- agregue una columna a `ordenes_compra_proveedor`, hay que volver a crearla.
-- ============================================================================

drop view if exists public.ordenes_proveedor_resumen;
create view public.ordenes_proveedor_resumen
with (security_invoker = true) as
  select
    o.*,
    coalesce(count(i.id), 0)::int as items,
    coalesce(count(i.id) filter (where i.estado_recepcion = 'recibido'), 0)::int as items_recibidos,
    coalesce(count(i.id) filter (where i.compra_id is not null), 0)::int as items_facturados,
    coalesce(sum(i.neto), 0)::bigint as neto,
    coalesce(sum(i.neto + i.iva), 0)::bigint as total,
    coalesce(sum(i.neto) filter (where i.tipo = 'reembolsable'), 0)::bigint as reembolsable,
    coalesce(sum(i.neto) filter (where i.compra_id is not null), 0)::bigint as facturado
  from public.ordenes_compra_proveedor o
  left join public.items_compra i on i.orden_id = o.id
  group by o.id;

-- Le avisa a PostgREST que relea el esquema. Sin esto, la API puede seguir
-- sirviendo la forma anterior de la vista durante un rato.
notify pgrst, 'reload schema';
