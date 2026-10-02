-- ============================================================================
-- Plataforma Valar — Quién emite cada orden de compra
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0008.
--
-- En el formato de Valar, el contacto del lado del emisor no es un dato de la
-- empresa: es la persona que emitió ESA orden, y el proveedor le responde a
-- ella. Por eso se guarda en cada OC y no como configuración.
--
-- Se guarda copiado, no por referencia al usuario: si mañana esa persona deja
-- la empresa, la OC impresa tiene que seguir diciendo quién la emitió.
-- ============================================================================

alter table public.ordenes_compra_proveedor
  add column if not exists emisor_nombre text;
alter table public.ordenes_compra_proveedor
  add column if not exists emisor_correo text;
alter table public.ordenes_compra_proveedor
  add column if not exists emisor_telefono text;

comment on column public.ordenes_compra_proveedor.emisor_nombre is
  'Quien emite la OC. Se propone el usuario con la sesión abierta, y se puede cambiar.';
