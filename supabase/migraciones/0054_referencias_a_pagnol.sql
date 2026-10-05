-- ============================================================================
-- 0054 — Referencias al catálogo de Pagnol
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- Pagnol (www.pagnol.cl) es la fuente de verdad de materiales y proveedores
-- (contrato: docs/integracion-pagnol-valar.md, fuera de git). La regla es NO
-- duplicar su catálogo: acá se guarda solo el id de Pagnol, como referencia.
-- El nombre y la unidad que quedan en la línea son lo que se pidió ese día
-- (el documento no cambia si Pagnol renombra el material después).
--
--   solped_items.pagnol_material_id   lo que se pidió, si salió de Pagnol
--   items_compra.pagnol_material_id   lo que se compró (la OC lo hereda de la solicitud)
--   proveedores.pagnol_proveedor_id   el mismo proveedor en Pagnol. El maestro de
--                                     Valar se queda: guarda lo que Pagnol no tiene
--                                     (banco, cuenta, plazo de pago).
-- ============================================================================

alter table public.solped_items add column if not exists pagnol_material_id uuid;
alter table public.items_compra add column if not exists pagnol_material_id uuid;
alter table public.proveedores add column if not exists pagnol_proveedor_id uuid;

comment on column public.solped_items.pagnol_material_id is 'Id del material en Pagnol. Solo referencia: el catálogo vive allá.';
comment on column public.items_compra.pagnol_material_id is 'Id del material en Pagnol. Solo referencia: el catálogo vive allá.';
comment on column public.proveedores.pagnol_proveedor_id is 'Id del proveedor en Pagnol. Un proveedor de Pagnol se enlaza a uno solo de Valar.';

-- Un proveedor de Pagnol no puede quedar enlazado a dos fichas de la misma empresa.
create unique index if not exists proveedores_pagnol_unico
  on public.proveedores (empresa_id, pagnol_proveedor_id)
  where pagnol_proveedor_id is not null;

notify pgrst, 'reload schema';
