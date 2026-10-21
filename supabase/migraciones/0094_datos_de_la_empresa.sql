-- ============================================================================
-- 0094 — Los datos de la empresa son editables
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0093.
--
-- Hasta hoy el nombre vivía en `empresas.nombre` (solo se veía en el selector
-- de empresa de Soporte) y la razón social, el RUT, la dirección y el
-- representante estaban escritos a mano en el código (OC, PDF, correos,
-- impresos). Ahora son columnas de la empresa y se editan desde
-- «Datos de la empresa»; cada empresa tiene los suyos.
--
--   nombre            cómo se llama en pantalla (el selector, el encabezado)
--   razon_social      la razón social legal (correos, informes, pie de página)
--   nombre_en_ordenes cómo lo conoce el proveedor en la OC y las solicitudes
--                     de cotización («VALAR SPA», como en las OC ya emitidas)
--   rut, direccion, ciudad, region, email_contacto, representante
--
-- Los valores iniciales salen de los que estaban en el código, que el usuario
-- confirmó. El nombre de Valar pasa de «Constructora Valar SpA» a «Valar SpA».
-- La empresa demo parte con los mismos datos de Valar para que sus documentos
-- se vean igual; se cambian desde la pantalla.
--
-- Quien edita es quien tiene el permiso `parametros.editar` (la política
-- «empresas: administra quien puede» de la 0030): sin cambios en RLS.
-- ============================================================================

alter table public.empresas
  add column if not exists razon_social text,
  add column if not exists nombre_en_ordenes text,
  add column if not exists direccion text,
  add column if not exists ciudad text,
  add column if not exists region text,
  add column if not exists email_contacto text,
  add column if not exists representante text;

comment on column public.empresas.nombre is
  'Cómo se llama en pantalla (selector de empresa, encabezados).';
comment on column public.empresas.razon_social is
  'Razón social legal: correos, informes, pie de página y pantalla de acceso.';
comment on column public.empresas.nombre_en_ordenes is
  'Cómo la conoce el proveedor: lo que sale impreso en la OC y en la solicitud de cotización.';

-- Valores iniciales: solo donde todavía no hay dato (re-correr no pisa lo editado).
update public.empresas set
  nombre = 'Valar SpA',
  razon_social = coalesce(razon_social, 'Servicios y Proyectos Valar SpA'),
  nombre_en_ordenes = coalesce(nombre_en_ordenes, 'VALAR SPA'),
  rut = '77.256.185-7',
  direccion = coalesce(direccion, 'Heroes de la Concepción 8848'),
  ciudad = coalesce(ciudad, 'Antofagasta'),
  region = coalesce(region, 'Antofagasta'),
  email_contacto = coalesce(email_contacto, 'contacto@valar.live'),
  representante = coalesce(representante, 'Francisco Valdés Araya')
where id = 'valar' and nombre = 'Constructora Valar SpA';

-- Si ya se corrió y el nombre se editó a mano, solo se completan los vacíos.
update public.empresas set
  razon_social = coalesce(razon_social, 'Servicios y Proyectos Valar SpA'),
  nombre_en_ordenes = coalesce(nombre_en_ordenes, 'VALAR SPA'),
  rut = coalesce(rut, '77.256.185-7'),
  direccion = coalesce(direccion, 'Heroes de la Concepción 8848'),
  ciudad = coalesce(ciudad, 'Antofagasta'),
  region = coalesce(region, 'Antofagasta'),
  email_contacto = coalesce(email_contacto, 'contacto@valar.live'),
  representante = coalesce(representante, 'Francisco Valdés Araya')
where id in ('valar', 'demo');

notify pgrst, 'reload schema';
