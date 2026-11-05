-- ============================================================================
-- 0117 — Facturas del SII que pasan a una rendición
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0116.
--
-- POR QUÉ. Las facturas que llegan del SII sin una OC casi siempre son gastos
-- de una rendición (combustible, correos, ferretería…). No se ignoran: se
-- arman como reembolso con las líneas ya llenas, y el gasto queda en el costo
-- del contrato con el detalle exacto de lo comprado.
--
-- QUÉ GUARDA. `compra_id` apunta a la rendición (compras.id, p. ej.
-- «RE-9500013862-2026-10») a la que se llevó el documento. Es solo una
-- referencia de texto: si la rendición se borra, el documento vuelve solo a
-- «por registrar» (la pantalla comprueba que la compra siga existiendo).
-- ============================================================================

alter table public.facturas_sii
  add column if not exists compra_id text;

comment on column public.facturas_sii.compra_id is
  'Rendición (compras.id) a la que se llevó este documento. Si esa compra ya no existe, el documento vuelve a estar pendiente.';

create index if not exists facturas_sii_compra_idx
  on public.facturas_sii (empresa_id, compra_id) where compra_id is not null;

notify pgrst, 'reload schema';
