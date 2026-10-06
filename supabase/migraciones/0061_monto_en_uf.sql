-- ============================================================================
-- 0061 — El monto total de un contrato en UF, y su valor en pesos al día
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0060.
--
-- Pedido del 06-10-2026, llenando Torres: el contrato se pacta en UF (19
-- torres × 39,4 UF al mes), pero el Dashboard, el consumo y el monto vigente
-- se comparan contra costos en pesos.
--
--   · contratos.monto_uf: el total pactado en UF. Es el dato del contrato.
--   · contratos_resumen.presupuesto: si el contrato es en UF y tiene monto_uf,
--     se calcula con la UF de HOY (la serie que trae la 0011 cada día). Así el
--     monto en pesos nunca queda congelado al día en que se guardó. Si no hay
--     UF cargada, se usa lo guardado en `presupuesto` (la foto al guardar).
--
-- La vista conserva sus columnas y tipos: `create or replace` alcanza y las
-- que dependen de ella (contratos_detalle) no se tocan.
-- ============================================================================

alter table public.contratos add column if not exists monto_uf numeric(14, 2);

comment on column public.contratos.monto_uf is
  'Monto total neto pactado en UF (contratos con moneda UF). El monto en pesos se calcula con la UF del día en contratos_resumen.';

/* La UF que rige hoy: el último valor cargado hasta hoy. */
create or replace function public.uf_hoy()
returns numeric
language sql
stable
set search_path = public
as $$
  select valor from public.uf_diaria where fecha <= current_date order by fecha desc limit 1
$$;

grant execute on function public.uf_hoy() to authenticated;

create or replace view public.contratos_resumen
with (security_invoker = true) as
 SELECT c.id,
    c.nombre,
    c.cliente,
    c.faena,
    c.avance,
    CASE
      WHEN c.moneda = 'UF' AND c.monto_uf IS NOT NULL AND public.uf_hoy() IS NOT NULL
        THEN round(c.monto_uf * public.uf_hoy())::bigint
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
          GROUP BY compras.contrato_id) co ON co.contrato_id = c.id
     LEFT JOIN ( SELECT servicios.contrato_id,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'ordinario'::text) AS ordinario,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'reembolsable'::text) AS reembolsable
           FROM servicios
          GROUP BY servicios.contrato_id) sv ON sv.contrato_id = c.id
     LEFT JOIN ( SELECT costos_personal.contrato_id,
            sum(costos_personal.costo_total) AS personal
           FROM costos_personal
          GROUP BY costos_personal.contrato_id) pe ON pe.contrato_id = c.id
     LEFT JOIN ( SELECT facturas.contrato_id,
            sum(facturas.neto) AS facturado
           FROM facturas
          GROUP BY facturas.contrato_id) fa ON fa.contrato_id = c.id;

notify pgrst, 'reload schema';
