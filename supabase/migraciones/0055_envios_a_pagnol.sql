-- ============================================================================
-- 0055 — Lo que se le informa a Pagnol al recibir
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0051 (recepciones) y la 0054 (referencias a Pagnol).
--
-- Fase 2 del contrato con Pagnol (docs/integracion-pagnol-valar.md, fuera de
-- git). Pagnol controla el activo desde que llega; Valar es dueño de la compra.
-- Al recepcionar una línea que salió del catálogo de Pagnol:
--
--   rastreable (herramientas, equipos) → POST /activos, UNA llamada por unidad
--   consumible (guantes, cemento)       → POST /movimientos {tipo: "ingreso"}
--   anular la recepción                 → reverso del ingreso / baja del activo
--
-- Cada cosa que se manda es una fila acá, ANTES de mandarla: con su
-- `external_ref` (única: Pagnol la usa para no duplicar) y su `Idempotency-Key`.
-- Si Pagnol no responde, la fila queda en error y el reintento usa la MISMA
-- llave: imposible que una recepción cree dos veces el mismo taladro.
-- ============================================================================

alter table public.recepciones add column if not exists pagnol_panol_id uuid;
comment on column public.recepciones.pagnol_panol_id is 'Pañol de Pagnol donde entra lo recibido (GET /panoles). Solo la referencia.';

create table if not exists public.pagnol_envios (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  contrato_id text not null,
  /* De qué recepción y línea salió. Si la recepción se anula, la fila queda
     (es la historia de lo que se le dijo a Pagnol) y el enlace se suelta. */
  recepcion_id uuid,
  item_id text,
  tipo text not null check (tipo in ('activo', 'ingreso', 'reverso', 'baja')),
  /** En los activos: cuál de las unidades de la línea (1, 2, 3…). */
  unidad integer,
  material_id uuid,
  cantidad numeric(12, 2),
  external_ref text not null,
  idempotency_key uuid not null default gen_random_uuid(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  /** Lo que devolvió Pagnol: el id del activo (pagnol_activo_id) o del movimiento. */
  pagnol_id uuid,
  /** En una baja o un reverso: el envío que deshace. */
  deshace_id uuid,
  error text,
  intentos integer not null default 0,
  enviado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  unique (empresa_id, external_ref),
  foreign key (empresa_id, recepcion_id) references public.recepciones (empresa_id, id) on delete set null (recepcion_id),
  foreign key (empresa_id, item_id) references public.items_compra (empresa_id, id) on delete set null (item_id)
);

comment on table public.pagnol_envios is
  'Cada escritura a Pagnol por una recepción: activo por unidad, ingreso de stock, reverso o baja. Se registra antes de enviarla; los reintentos usan la misma Idempotency-Key.';

create index if not exists pagnol_envios_recepcion_idx on public.pagnol_envios (empresa_id, recepcion_id);

drop trigger if exists pagnol_envios_actualizado on public.pagnol_envios;
create trigger pagnol_envios_actualizado before update on public.pagnol_envios
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists pagnol_envios_autoria on public.pagnol_envios;
create trigger pagnol_envios_autoria before insert or update on public.pagnol_envios
  for each row execute function public.marcar_autoria();

-- Las mismas reglas que el resto del ciclo de la OC (0051).
alter table public.pagnol_envios enable row level security;

drop policy if exists "ciclo oc: lee" on public.pagnol_envios;
create policy "ciclo oc: lee" on public.pagnol_envios for select to authenticated
  using (public.ve_empresa(empresa_id) and (public.puede('egresos.ver', contrato_id) or public.puede('ordenes.ver', contrato_id) or public.puede('pagos.ver', contrato_id)));

drop policy if exists "ciclo oc: crea" on public.pagnol_envios;
create policy "ciclo oc: crea" on public.pagnol_envios for insert to authenticated
  with check (empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)));

drop policy if exists "ciclo oc: cambia" on public.pagnol_envios;
create policy "ciclo oc: cambia" on public.pagnol_envios for update to authenticated
  using (empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)))
  with check (empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)));

-- Sin política de borrado: lo que se le dijo a Pagnol no se borra.

grant select, insert, update on public.pagnol_envios to authenticated;

notify pgrst, 'reload schema';
