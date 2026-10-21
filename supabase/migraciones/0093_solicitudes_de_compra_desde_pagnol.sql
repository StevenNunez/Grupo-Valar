-- ============================================================================
-- 0093 — Fase 5 · C: las solicitudes de compra aprobadas en Pagnol llegan a Valar
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0092.
--
-- Cuando una solicitud de compra completa su revisión y autorización en Pagnol
-- (`solicitud_compra.aprobada`), la plataforma arma un BORRADOR de solicitud
-- (SOLPED) con las líneas autorizadas. Nada se envía solo: Abastecimiento lo
-- revisa y lo manda a aprobación. `solicitud_compra.rechazada` cierra la
-- solicitud en Valar con el motivo; `creada` es solo informativa.
--
-- EL CONTRATO. El aviso trae el contrato de Pagnol (su UUID, que no cambia
-- aunque cambie el nombre). Cada contrato de Pagnol se asocia una vez a un
-- contrato de Valar; la primera vez que llega uno sin asociar, el aviso queda
-- en la bandeja de Abastecimiento y una persona elige el contrato. Desde
-- entonces las siguientes solicitudes de ese contrato salen ya asignadas.
-- ============================================================================

-- ─── 1. Cada contrato de Pagnol, a un contrato de Valar ─────────────────────

create table if not exists public.pagnol_contratos (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  pagnol_contrato_id uuid not null,
  /* Copia del nombre, para mostrarlo sin preguntarle a Pagnol. */
  pagnol_contrato_nombre text not null,
  contrato_id text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  unique (empresa_id, pagnol_contrato_id),
  foreign key (empresa_id, contrato_id) references public.contratos (empresa_id, id) on delete cascade
);

comment on table public.pagnol_contratos is
  'A qué contrato de Valar corresponde cada contrato de Pagnol. Se arma solo, la primera vez que una persona resuelve una solicitud sin contrato.';

drop trigger if exists pagnol_contratos_actualizado on public.pagnol_contratos;
create trigger pagnol_contratos_actualizado before update on public.pagnol_contratos
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists pagnol_contratos_autoria on public.pagnol_contratos;
create trigger pagnol_contratos_autoria before insert or update on public.pagnol_contratos
  for each row execute function public.marcar_autoria();
drop trigger if exists pagnol_contratos_auditoria on public.pagnol_contratos;
create trigger pagnol_contratos_auditoria after insert or update or delete on public.pagnol_contratos
  for each row execute function public.registrar_auditoria();

alter table public.pagnol_contratos enable row level security;

drop policy if exists "contratos pagnol: lee" on public.pagnol_contratos;
create policy "contratos pagnol: lee" on public.pagnol_contratos for select to authenticated
  using (public.ve_empresa(empresa_id) and public.entra_a('abastecimiento'));

-- Quien resuelve una solicitud sin contrato (puede crear solicitudes) deja
-- guardada la asociación, para que la próxima ya salga asignada.
drop policy if exists "contratos pagnol: escribe" on public.pagnol_contratos;
create policy "contratos pagnol: escribe" on public.pagnol_contratos for all to authenticated
  using (empresa_id = public.empresa_actual() and public.entra_a('abastecimiento') and public.tiene_permiso('solped.crear'))
  with check (empresa_id = public.empresa_actual() and public.entra_a('abastecimiento') and public.tiene_permiso('solped.crear'));

grant select, insert, update, delete on public.pagnol_contratos to authenticated;

-- ─── 2. La solicitud dice de qué solicitud de Pagnol salió ──────────────────

alter table public.solped drop constraint if exists solped_origen_check;
alter table public.solped add constraint solped_origen_check check (origen in ('manual', 'pagnol', 'pagnol-solicitud'));

alter table public.solped
  add column if not exists pagnol_solicitud_id uuid,
  add column if not exists pagnol_solicitud_codigo text;

comment on column public.solped.origen is
  'manual = la escribió una persona. pagnol = borrador de reposición por stock bajo. pagnol-solicitud = solicitud de compra aprobada en Pagnol.';
comment on column public.solped.pagnol_solicitud_id is
  'La solicitud de compra de Pagnol de la que nació (solicitud_compra.aprobada). Una sola SOLPED por solicitud.';

-- Un reenvío del aviso no duplica la solicitud.
create unique index if not exists solped_pagnol_solicitud_unica
  on public.solped (empresa_id, pagnol_solicitud_id)
  where pagnol_solicitud_id is not null;

-- ─── 3. La bandeja: avisos de solicitud que todavía no tienen contrato ──────
-- Igual que los de stock bajo (0057): se dejan LEER a quien entra a
-- Abastecimiento. Escribir en la tabla sigue sin poder nadie desde la app.

drop policy if exists "solicitudes: lee avisos de Pagnol" on public.pagnol_webhooks_recibidos;
create policy "solicitudes: lee avisos de Pagnol" on public.pagnol_webhooks_recibidos for select to authenticated
  using (tipo like 'solicitud\_compra.%' and empresa_id is not null
         and public.ve_empresa(empresa_id) and public.entra_a('abastecimiento'));

notify pgrst, 'reload schema';
