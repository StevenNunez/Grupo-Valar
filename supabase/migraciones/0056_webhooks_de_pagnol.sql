-- ============================================================================
-- 0056 — Lo que Pagnol avisa: webhooks recibidos
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- Fase 3 del contrato con Pagnol (docs/integracion-pagnol-valar.md, fuera de
-- git). Pagnol avisa a POST /api/webhooks/pagnol/ cuando cambia un material,
-- un proveedor o un activo, o cuando el stock de algo cae bajo su mínimo. La
-- plataforma verifica la firma, anota el aviso acá y limpia su caché.
--
-- Pagnol reintenta hasta recibir un 2xx, así que el mismo aviso puede llegar
-- dos veces: la llave primaria es su `webhook-id` y el segundo se ignora.
--
-- NADIE la lee ni la escribe desde la app: RLS activado y sin políticas. Solo
-- el servidor de la plataforma, con la clave de servicio, porque un webhook no
-- trae la sesión de ninguna persona.
-- ============================================================================

create table if not exists public.pagnol_webhooks_recibidos (
  webhook_id text primary key,
  tipo text not null,
  /** La organización de Pagnol que avisa. */
  organization_id uuid,
  /** El evento completo, como llegó (ya verificado). */
  payload jsonb not null,
  recibido_en timestamptz not null default now(),
  procesado_en timestamptz,
  error text
);

comment on table public.pagnol_webhooks_recibidos is
  'Avisos de Pagnol (webhooks), uno por webhook-id. Solo el servidor los escribe; sirve para no procesar dos veces el mismo aviso.';

create index if not exists pagnol_webhooks_tipo_idx on public.pagnol_webhooks_recibidos (tipo, recibido_en desc);

alter table public.pagnol_webhooks_recibidos enable row level security;
-- Sin políticas: authenticated y anon no ven ni escriben nada. La clave de
-- servicio se salta RLS por diseño.
revoke all on public.pagnol_webhooks_recibidos from anon, authenticated;

notify pgrst, 'reload schema';
