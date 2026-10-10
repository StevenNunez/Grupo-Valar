-- ════════════════════════════════════════════════════════════════════════════
-- 0070 · El RUT del proveedor es único DENTRO de cada empresa
-- ════════════════════════════════════════════════════════════════════════════
--
-- `proveedores.rut` nació con `unique (rut)`, de antes de la multiempresa
-- (0030). Con varias empresas eso es un error: si un proveedor ya existe en
-- la empresa demo —o en cualquier otra—, Valar no puede registrarlo, y el
-- choque es contra una fila que ni siquiera ve. La identidad de un proveedor
-- es su RUT dentro de la empresa que le compra.

alter table public.proveedores drop constraint if exists proveedores_rut_key;

alter table public.proveedores
  add constraint proveedores_empresa_rut_key unique (empresa_id, rut);

notify pgrst, 'reload schema';
