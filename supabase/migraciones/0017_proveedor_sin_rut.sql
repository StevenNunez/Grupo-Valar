-- ============================================================================
-- Plataforma Valar — Un proveedor puede entrar sin RUT
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0016.
--
-- POR QUÉ: la 0015 dejó el RUT obligatorio, con el argumento de que es la
-- identidad del proveedor. El argumento sigue siendo cierto, pero la
-- consecuencia práctica era otra: el listado real de proveedores de Valar —82
-- empresas con contacto, teléfono, correo y rubro— NO trae RUT. Con la columna
-- obligatoria, ese listado no se puede cargar, y entonces se queda en el Excel,
-- que es exactamente lo que este módulo vino a evitar.
--
-- Un dato a medias dentro del sistema vale más que un dato completo fuera.
--
-- El `unique` se mantiene y sigue haciendo su trabajo: en Postgres los nulos no
-- chocan entre sí, así que pueden convivir muchos proveedores sin RUT, pero
-- nunca dos con el mismo. La identidad sigue siendo el RUT cuando existe.
--
-- Para eso está el estado `por_completar`: un proveedor cargado desde el listado
-- entra así, y la pantalla lo muestra con lo que le falta. No es un error, es
-- trabajo pendiente, y conviene que se vea.
-- ============================================================================

alter table public.proveedores alter column rut drop not null;

comment on column public.proveedores.rut is
  'Normalizado sin puntos, con guion. Es la identidad del proveedor cuando existe; puede faltar mientras la ficha esté por completar.';

-- ─── El correo de facturación ───────────────────────────────────────────────
-- El correo que trae la planilla es el de ventas: a ese se le pide cotización.
-- La orden de compra y la factura casi nunca van por ahí —van a administración
-- o a cobranza—, y hoy ese dato vive en la cabeza de quien despacha las OC.

alter table public.proveedores
  add column if not exists correo_pago text;

comment on column public.proveedores.correo_pago is
  'A dónde se manda la OC y de dónde llega la factura, cuando no es el mismo correo de ventas.';

notify pgrst, 'reload schema';
