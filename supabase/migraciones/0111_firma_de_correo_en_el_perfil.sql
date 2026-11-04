-- ============================================================================
-- 0111 — La firma de correo de cada persona
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0110.
--
-- Los correos que salen de la plataforma (solicitud de cotización y orden de
-- compra) cierran con la firma de quien los envía: logo de Valar, nombre,
-- área, teléfono, dirección y sitio. El nombre sale del perfil; la empresa,
-- la dirección y el sitio, de «Datos de la empresa». Acá se guardan solo los
-- dos datos que son de cada persona:
--
--   firma_area      "Abastecimiento", "Administración"… (va antes de la razón social)
--   firma_telefono  "+56 9 3093 8222"
--
-- Sin teléfono ni área la firma sale igual, solo con nombre y empresa.
-- `perfiles` ya deja a cada persona editar su propia fila (0029): no hace
-- falta política nueva.
-- ============================================================================

alter table public.perfiles
  add column if not exists firma_area text check (char_length(firma_area) <= 80),
  add column if not exists firma_telefono text check (char_length(firma_telefono) <= 40);

comment on column public.perfiles.firma_area is 'Área que aparece en la firma de los correos (ej. Abastecimiento).';
comment on column public.perfiles.firma_telefono is 'Teléfono que aparece en la firma de los correos.';
