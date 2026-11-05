-- ============================================================================
-- 0116 — Facturas del SII (carga masiva del Registro de Compras)
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0115.
--
-- POR QUÉ. Hay proveedores que facturan y no mandan la factura; el SII sí la
-- tiene. Se descarga el detalle del Registro de Compras (CSV) y se sube a
-- Pagos → «Facturas del SII»: cada factura se cruza con las órdenes abiertas
-- por RUT del proveedor y monto, y se registra en la OC con un clic.
--
-- QUÉ GUARDA. Una fila por documento del SII, única por empresa + RUT del
-- emisor + tipo + folio: subir el mismo archivo dos veces no duplica. Si una
-- factura ya está cargada en la plataforma se deduce por N° y proveedor (no se
-- guarda un vínculo que se pueda desactualizar). Lo único que se decide a mano
-- es «ignorar» un documento que no corresponde registrar.
-- ============================================================================

create table if not exists public.facturas_sii (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  /* RUT sin puntos y con guion: 76123456-7. */
  rut_emisor text not null,
  razon_social text,
  /* 33 factura, 34 exenta, 56 nota de débito, 61 nota de crédito… */
  tipo_documento smallint not null,
  folio text not null,
  fecha_emision date,
  fecha_recepcion date,
  exento bigint not null default 0,
  neto bigint not null default 0,
  iva bigint not null default 0,
  total bigint not null default 0,
  /* 'detectada' hasta que alguien la ignore. */
  estado text not null default 'detectada' check (estado in ('detectada', 'ignorada')),
  /* La fila tal como vino en el archivo. */
  datos jsonb,
  origen text not null default 'archivo',
  cargada_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (empresa_id, rut_emisor, tipo_documento, folio)
);

comment on table public.facturas_sii is
  'Documentos recibidos según el Registro de Compras del SII. Se cargan desde el CSV; se cruzan con las OC por RUT y monto.';

create index if not exists facturas_sii_empresa_fecha_idx
  on public.facturas_sii (empresa_id, fecha_emision desc);

alter table public.facturas_sii enable row level security;

drop policy if exists "facturas_sii: lectura" on public.facturas_sii;
create policy "facturas_sii: lectura" on public.facturas_sii for select to authenticated
  using (public.ve_empresa(empresa_id)
         and (public.tiene_permiso('pagos.ver') or public.tiene_permiso('ordenes.emitir') or public.tiene_permiso('gestion.editar')));

drop policy if exists "facturas_sii: inserta" on public.facturas_sii;
create policy "facturas_sii: inserta" on public.facturas_sii for insert to authenticated
  with check (empresa_id = public.empresa_actual()
              and (public.tiene_permiso('ordenes.emitir') or public.tiene_permiso('gestion.editar')));

drop policy if exists "facturas_sii: modifica" on public.facturas_sii;
create policy "facturas_sii: modifica" on public.facturas_sii for update to authenticated
  using (empresa_id = public.empresa_actual()
         and (public.tiene_permiso('ordenes.emitir') or public.tiene_permiso('gestion.editar')))
  with check (empresa_id = public.empresa_actual()
              and (public.tiene_permiso('ordenes.emitir') or public.tiene_permiso('gestion.editar')));

grant select, insert, update on public.facturas_sii to authenticated;

notify pgrst, 'reload schema';
