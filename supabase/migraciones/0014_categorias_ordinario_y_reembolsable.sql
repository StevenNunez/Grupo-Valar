-- ============================================================================
-- Plataforma Valar — El costo por categoría, separado como lo separa el margen
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0013.
--
-- POR QUÉ: `resumen_mensual` deja los reembolsables FUERA del costo —se le
-- cobran al mandante, así que no descuentan margen— pero
-- `costos_por_categoria` los sumaba dentro de `real`. Las dos vistas alimentan
-- la misma pantalla, y no cuadraban entre ellas:
--
--   C-MISC   familias suman $181,5 M   ·   costo del resumen $180,2 M
--   C-TORRES familias suman  $59,7 M   ·   costo del resumen  $59,7 M
--
-- La diferencia son exactamente los $1,3 M de Gastos Reembolsables de
-- Misceláneos. Con dos contratos y tres meses se nota poco; en una reunión, un
-- total que no calza con otro de la misma pantalla se nota siempre.
--
-- QUÉ CAMBIA: `real` se mantiene tal cual —sigue siendo todo lo cargado a la
-- categoría, que es lo que la tabla de la pantalla muestra— y se agregan dos
-- columnas que lo abren con el MISMO criterio que usa `resumen_mensual`:
--
--   real_ordinario     lo que sí descuenta margen
--   real_reembolsable  lo que se le recupera al mandante
--
-- Así el gráfico de composición del costo suma exactamente el costo del
-- contrato, sin restarle nada a mano ni adivinar por el nombre de la categoría.
-- ============================================================================

drop view if exists public.costos_por_categoria;

create view public.costos_por_categoria
with (security_invoker = true) as
  select
    cat.id as categoria_id,
    cat.contrato_id,
    cat.nombre as categoria,
    cat.familia,
    cat.afecta_iva,
    cat.presupuesto_mensual,
    cu.periodo,
    coalesce(sum(cu.neto), 0)::bigint as real,
    -- El mismo `filter` de resumen_mensual: una sola definición de qué es costo.
    coalesce(sum(cu.neto) filter (where cu.tipo = 'ordinario'), 0)::bigint
      as real_ordinario,
    coalesce(sum(cu.neto) filter (where cu.tipo = 'reembolsable'), 0)::bigint
      as real_reembolsable,
    (coalesce(sum(cu.neto), 0) - cat.presupuesto_mensual)::bigint as desviacion
  from public.categorias_costo cat
  left join public.costos_unificados cu on cu.categoria_id = cat.id
  group by cat.id, cat.contrato_id, cat.nombre, cat.familia, cat.afecta_iva,
           cat.presupuesto_mensual, cu.periodo;

comment on view public.costos_por_categoria is
  'Costo por categoría y mes contra lo presupuestado. `real` es todo lo cargado; `real_ordinario` es la parte que descuenta margen, con el mismo criterio que resumen_mensual.';

grant select on public.costos_por_categoria to authenticated;

notify pgrst, 'reload schema';
