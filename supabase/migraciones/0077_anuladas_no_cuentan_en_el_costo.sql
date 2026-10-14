-- ════════════════════════════════════════════════════════════════════════════
-- 0077 — Una compra o un servicio anulado no suma ni resta costo
-- ════════════════════════════════════════════════════════════════════════════
--
-- `estado_pago = 'anulada'` existe desde 0026 y significa "se dejó sin efecto",
-- pero las vistas de costo no lo miraban: una compra anulada seguía sumando al
-- costo del contrato, al Dashboard y a la rentabilidad.
--
-- Acá se agrega ese filtro en los dos lugares donde el costo sale de `compras`
-- y `servicios`: `costos_unificados` (Dashboard, resumen por mes y por
-- categoría) y `contratos_resumen` (costo acumulado por contrato). La compra
-- anulada se sigue viendo en Compras y Servicios, con su estado; solo deja de
-- contar. Mismas columnas y tipos que 0063: `create or replace` alcanza.

create or replace view public.contratos_resumen
with (security_invoker = true) as
SELECT c.id,
    c.nombre,
    c.cliente,
    c.faena,
    c.avance,
        CASE
            WHEN c.moneda = 'UF'::text AND c.monto_uf IS NOT NULL AND uf_hoy() IS NOT NULL THEN round(c.monto_uf * uf_hoy())::bigint
            ELSE c.presupuesto
        END AS presupuesto,
    c.estado,
    c.termino,
    COALESCE(co.ordinario, 0::numeric)::bigint AS costo_compras,
    COALESCE(sv.ordinario, 0::numeric)::bigint AS costo_servicios,
    COALESCE(pe.personal, 0::numeric)::bigint AS costo_personal,
    (COALESCE(co.reembolsable, 0::numeric) + COALESCE(sv.reembolsable, 0::numeric))::bigint AS costo_reembolsable,
    (COALESCE(co.ordinario, 0::numeric) + COALESCE(sv.ordinario, 0::numeric) + COALESCE(pe.personal, 0::numeric))::bigint AS costo_real,
    COALESCE(fa.facturado, 0::numeric)::bigint AS facturado
   FROM contratos c
     LEFT JOIN ( SELECT compras.contrato_id,
            sum(compras.neto) FILTER (WHERE compras.tipo = 'ordinario'::text) AS ordinario,
            sum(compras.neto) FILTER (WHERE compras.tipo = 'reembolsable'::text) AS reembolsable
           FROM compras
          WHERE compras.estado_pago <> 'anulada'::text
          GROUP BY compras.contrato_id) co ON co.contrato_id = c.id
     LEFT JOIN ( SELECT servicios.contrato_id,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'ordinario'::text) AS ordinario,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'reembolsable'::text) AS reembolsable
           FROM servicios
          WHERE servicios.estado_pago <> 'anulada'::text
          GROUP BY servicios.contrato_id) sv ON sv.contrato_id = c.id
     LEFT JOIN ( SELECT x.contrato_id,
            sum(x.monto) AS personal
           FROM ( SELECT costos_personal.contrato_id, costos_personal.costo_total AS monto
                   FROM costos_personal
                UNION ALL
                 SELECT finiquitos.contrato_id, finiquitos.total AS monto
                   FROM finiquitos
                  WHERE finiquitos.contrato_id IS NOT NULL) x
          GROUP BY x.contrato_id) pe ON pe.contrato_id = c.id
     LEFT JOIN ( SELECT facturas.contrato_id,
            sum(facturas.neto) AS facturado
           FROM facturas
          GROUP BY facturas.contrato_id) fa ON fa.contrato_id = c.id;

create or replace view public.costos_unificados
with (security_invoker = true) as
SELECT d.id,
    d.contrato_id,
    d.categoria_id,
    d.categoria,
    d.familia,
    d.fecha,
    d.periodo,
    COALESCE(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor'::text) AS tercero,
    d.descripcion AS detalle,
    d.tipo,
    d.neto,
    d.iva,
    d.total,
    COALESCE(d.estado_pago, 'pendiente'::text) AS estado_pago,
    d.anexo_id
   FROM items_detalle d
UNION ALL
 SELECT c.id,
    c.contrato_id,
    c.categoria_id,
    COALESCE(cat.nombre, 'Sin categoría'::text) AS categoria,
    COALESCE(cat.familia, 'compras'::text) AS familia,
    c.fecha,
    COALESCE(c.periodo_control, date_trunc('month'::text, c.fecha::timestamp with time zone)::date) AS periodo,
    c.proveedor AS tercero,
    c.detalle,
    c.tipo,
    c.neto,
    c.iva,
    c.total,
    c.estado_pago,
    c.anexo_id
   FROM compras c
     LEFT JOIN categorias_costo cat ON cat.empresa_id = c.empresa_id AND cat.id = c.categoria_id
  WHERE c.estado_pago <> 'anulada'::text
    AND NOT (EXISTS ( SELECT 1
           FROM items_compra i
          WHERE i.empresa_id = c.empresa_id AND i.compra_id = c.id)) AND NOT (EXISTS ( SELECT 1
           FROM factura_items fi
          WHERE fi.empresa_id = c.empresa_id AND fi.compra_id = c.id))
UNION ALL
 SELECT s.id,
    s.contrato_id,
    s.categoria_id,
    COALESCE(cat.nombre, 'Servicios'::text) AS categoria,
    COALESCE(cat.familia, 'servicios'::text) AS familia,
    s.fecha,
    date_trunc('month'::text, s.fecha::timestamp with time zone)::date AS periodo,
    s.contratista AS tercero,
    s.detalle,
    s.tipo,
    s.neto,
    s.iva,
    s.total,
    s.estado_pago,
    s.anexo_id
   FROM servicios s
     LEFT JOIN categorias_costo cat ON cat.empresa_id = s.empresa_id AND cat.id = s.categoria_id
  WHERE s.estado_pago <> 'anulada'::text
UNION ALL
 SELECT p.id,
    p.contrato_id,
    p.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    p.periodo AS fecha,
    p.periodo,
    p.faena AS tercero,
    'Remuneraciones y leyes sociales'::text AS detalle,
    'ordinario'::text AS tipo,
    p.costo_total AS neto,
    0::bigint AS iva,
    p.costo_total AS total,
    'pagada'::text AS estado_pago,
    p.anexo_id
   FROM costos_personal p
     LEFT JOIN categorias_costo cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
UNION ALL
 SELECT f.id,
    f.contrato_id,
    f.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    COALESCE(f.fecha_pago, f.periodo) AS fecha,
    f.periodo,
    f.trabajador AS tercero,
    'Finiquito'::text AS detalle,
    'ordinario'::text AS tipo,
    f.total AS neto,
    0::bigint AS iva,
    f.total AS total,
    'pagada'::text AS estado_pago,
    f.anexo_id
   FROM finiquitos f
     LEFT JOIN categorias_costo cat ON cat.empresa_id = f.empresa_id AND cat.id = f.categoria_id
  WHERE f.contrato_id IS NOT NULL;

notify pgrst, 'reload schema';
