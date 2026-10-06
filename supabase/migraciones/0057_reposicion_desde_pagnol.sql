-- ============================================================================
-- 0057 — Reposición automática: stock bajo el mínimo en Pagnol → solicitud
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0056.
--
-- Fase 4 del contrato con Pagnol. Cuando Pagnol avisa `stock.bajo_minimo`
-- (webhook, 0056), la plataforma arma un BORRADOR de solicitud de compra:
--
--   · va al contrato del pañol donde bajó el stock (cada pañol se asocia una
--     vez a un contrato de Valar). Pañol sin asociar → queda en la bandeja.
--   · un solo borrador de reposición abierto por contrato: los avisos se suman
--     como líneas, y el mismo material no se repite.
--   · cantidad sugerida: lo que falta para llegar al DOBLE del mínimo.
--
-- Decisiones del 06-10-2026. Nada se envía solo: el borrador lo revisa y lo
-- manda a aprobación una persona.
-- ============================================================================

-- ─── 1. De qué empresa es cada aviso ────────────────────────────────────────
-- Un aviso trae la organización de Pagnol, no la empresa de Valar.

alter table public.empresas add column if not exists pagnol_organization_id uuid;
create unique index if not exists empresas_pagnol_organizacion
  on public.empresas (pagnol_organization_id) where pagnol_organization_id is not null;

comment on column public.empresas.pagnol_organization_id is
  'La organización de esta empresa en Pagnol. Con ella se sabe de quién es cada webhook.';

alter table public.pagnol_webhooks_recibidos
  add column if not exists empresa_id text references public.empresas (id);

-- ─── 2. Cada pañol, a un contrato ───────────────────────────────────────────

create table if not exists public.pagnol_panoles_contratos (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  panol_id uuid not null,
  /** Copia del nombre, para mostrarlo sin preguntarle a Pagnol. */
  panol_nombre text not null,
  contrato_id text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  unique (empresa_id, panol_id),
  foreign key (empresa_id, contrato_id) references public.contratos (empresa_id, id) on delete cascade
);

comment on table public.pagnol_panoles_contratos is
  'A qué contrato de Valar va la reposición de cada pañol de Pagnol.';

drop trigger if exists pagnol_panoles_contratos_actualizado on public.pagnol_panoles_contratos;
create trigger pagnol_panoles_contratos_actualizado before update on public.pagnol_panoles_contratos
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists pagnol_panoles_contratos_autoria on public.pagnol_panoles_contratos;
create trigger pagnol_panoles_contratos_autoria before insert or update on public.pagnol_panoles_contratos
  for each row execute function public.marcar_autoria();
drop trigger if exists pagnol_panoles_contratos_auditoria on public.pagnol_panoles_contratos;
create trigger pagnol_panoles_contratos_auditoria after insert or update or delete on public.pagnol_panoles_contratos
  for each row execute function public.registrar_auditoria();

alter table public.pagnol_panoles_contratos enable row level security;

drop policy if exists "panoles: lee" on public.pagnol_panoles_contratos;
create policy "panoles: lee" on public.pagnol_panoles_contratos for select to authenticated
  using (public.ve_empresa(empresa_id) and public.entra_a('abastecimiento'));

-- Lo decide quien administra Abastecimiento: es configuración, no operación.
drop policy if exists "panoles: escribe" on public.pagnol_panoles_contratos;
create policy "panoles: escribe" on public.pagnol_panoles_contratos for all to authenticated
  using (empresa_id = public.empresa_actual() and public.administra_modulo('abastecimiento'))
  with check (empresa_id = public.empresa_actual() and public.administra_modulo('abastecimiento'));

grant select, insert, update, delete on public.pagnol_panoles_contratos to authenticated;

-- ─── 3. La solicitud dice de dónde salió ────────────────────────────────────

alter table public.solped
  add column if not exists origen text not null default 'manual';
alter table public.solped drop constraint if exists solped_origen_check;
alter table public.solped add constraint solped_origen_check check (origen in ('manual', 'pagnol'));

comment on column public.solped.origen is
  'manual = la escribió una persona. pagnol = borrador de reposición armado por un aviso de stock bajo.';

-- ─── 4. La bandeja: avisos de stock bajo que todavía no tienen contrato ─────
-- La tabla de webhooks es solo del servidor (0056). Los avisos de stock bajo
-- de la propia empresa se dejan LEER a quien entra a Abastecimiento: son la
-- bandeja de reposición. Escribir, sigue sin poder nadie desde la app.

drop policy if exists "reposicion: lee avisos de stock" on public.pagnol_webhooks_recibidos;
create policy "reposicion: lee avisos de stock" on public.pagnol_webhooks_recibidos for select to authenticated
  using (tipo = 'stock.bajo_minimo' and empresa_id is not null
         and public.ve_empresa(empresa_id) and public.entra_a('abastecimiento'));

grant select on public.pagnol_webhooks_recibidos to authenticated;

notify pgrst, 'reload schema';
