-- ============================================================================
-- 0092 — Fase 5 · B: las OC se anuncian a Pagnol y el pañolero las recibe allá
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0091.
--
-- QUÉ CAMBIA. Hasta hoy la recepción se registraba en Valar y se informaba a
-- Pagnol (Fase 2). Con `pagnol_recepcion = 'pagnol'` la empresa hace lo
-- contrario: Valar ANUNCIA la OC a Pagnol cuando se envía al proveedor
-- (POST /compras-esperadas) y el pañolero la recibe en Pagnol; Pagnol avisa con
-- los webhooks `compra.recibida` y `compra.recepcion_corregida`, y Valar
-- registra esa recepción sin escribir stock de nuevo.
--
-- NADA CAMBIA mientras la empresa siga en 'externa' (el valor por defecto).
-- Para activarlo, cuando Pagnol esté desplegado y probado en el demo:
--
--   update public.empresas set pagnol_recepcion = 'pagnol' where id = 'valar';
--
-- Pagnol lleva el mismo modo por su lado y no acepta anuncios si no coincide.
-- ============================================================================

-- ─── 1. El modo de recepción de la empresa ──────────────────────────────────

alter table public.empresas
  add column if not exists pagnol_recepcion text not null default 'externa'
    check (pagnol_recepcion in ('externa', 'pagnol'));

comment on column public.empresas.pagnol_recepcion is
  'Dónde se recibe lo comprado: ''externa'' (en Valar, y se informa a Pagnol) o ''pagnol'' (Valar anuncia la OC y el pañolero recibe en Pagnol). Nunca las dos.';

-- ─── 2. Las recepciones que vienen de Pagnol ────────────────────────────────

alter table public.recepciones
  add column if not exists origen text not null default 'valar'
    check (origen in ('valar', 'pagnol')),
  add column if not exists pagnol_recepcion_id uuid;

comment on column public.recepciones.origen is
  '''pagnol'': la registró el pañolero en Pagnol (webhook compra.recibida). No se informa de vuelta: el stock ya está allá.';
comment on column public.recepciones.pagnol_recepcion_id is
  'Id de la recepción en Pagnol. Una recepción de Pagnol trae una línea por evento; todas caen en la misma fila.';

create unique index if not exists recepciones_pagnol_unica
  on public.recepciones (empresa_id, pagnol_recepcion_id)
  where pagnol_recepcion_id is not null;

-- ─── 3. Qué OC se anunciaron a Pagnol, y cómo ───────────────────────────────

create table if not exists public.ordenes_pagnol (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  orden_id text not null,
  contrato_id text not null,
  /* La compra esperada en Pagnol. Nulo hasta que Pagnol la acepta. */
  pagnol_compra_id uuid,
  /* Pañol de destino en Pagnol (GET /panoles). Solo la referencia. */
  panol_id uuid,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'anunciada', 'cancelada', 'error')),
  /* La misma llave en cada reintento del anuncio: Pagnol no lo duplica. */
  idempotency_key uuid not null default gen_random_uuid(),
  /* Lo que Pagnol sabe de la OC: [{ item_id, external_ref, cantidad }]. Sirve
     para mandar solo lo que cambió cuando se corrige. */
  lineas jsonb not null default '[]'::jsonb,
  fecha_estimada date,
  error text,
  anunciada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, orden_id),
  foreign key (empresa_id, orden_id)
    references public.ordenes_compra_proveedor (empresa_id, id) on delete cascade
);

comment on table public.ordenes_pagnol is
  'Las OC anunciadas a Pagnol como compras esperadas (Fase 5). Se registra antes de mandarla; el reintento usa la misma Idempotency-Key.';

create unique index if not exists ordenes_pagnol_compra_unica
  on public.ordenes_pagnol (empresa_id, pagnol_compra_id)
  where pagnol_compra_id is not null;

drop trigger if exists ordenes_pagnol_actualizado on public.ordenes_pagnol;
create trigger ordenes_pagnol_actualizado before update on public.ordenes_pagnol
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists ordenes_pagnol_autoria on public.ordenes_pagnol;
create trigger ordenes_pagnol_autoria before insert or update on public.ordenes_pagnol
  for each row execute function public.marcar_autoria();

alter table public.ordenes_pagnol enable row level security;

-- Las mismas reglas que el resto del ciclo de la OC (0051, 0055).
drop policy if exists "ordenes pagnol: lee" on public.ordenes_pagnol;
create policy "ordenes pagnol: lee" on public.ordenes_pagnol for select to authenticated
  using (public.ve_empresa(empresa_id) and (public.puede('ordenes.ver', contrato_id) or public.puede('egresos.ver', contrato_id)));

drop policy if exists "ordenes pagnol: crea" on public.ordenes_pagnol;
create policy "ordenes pagnol: crea" on public.ordenes_pagnol for insert to authenticated
  with check (empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)));

drop policy if exists "ordenes pagnol: cambia" on public.ordenes_pagnol;
create policy "ordenes pagnol: cambia" on public.ordenes_pagnol for update to authenticated
  using (empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)))
  with check (empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)));

-- Sin política de borrado: es la historia de lo que se le anunció a Pagnol.
grant select, insert, update on public.ordenes_pagnol to authenticated;

-- ─── 4. Correcciones de recepción (compra.recepcion_corregida) ──────────────
-- Una corrección ya aplicada no se aplica dos veces, aunque el aviso llegue
-- repetido. La escribe solo el servidor (webhook).

create table if not exists public.recepciones_pagnol_correcciones (
  empresa_id text not null references public.empresas (id),
  correccion_id uuid not null,
  recepcion_id uuid,
  item_id text,
  cantidad_quitada numeric(12, 2) not null,
  motivo text,
  corregido_por text,
  creado_en timestamptz not null default now(),
  primary key (empresa_id, correccion_id)
);

comment on table public.recepciones_pagnol_correcciones is
  'Correcciones que el pañolero hizo en Pagnol a una recepción ya informada. Solo el servidor las escribe.';

alter table public.recepciones_pagnol_correcciones enable row level security;
revoke all on public.recepciones_pagnol_correcciones from anon, authenticated;

notify pgrst, 'reload schema';
