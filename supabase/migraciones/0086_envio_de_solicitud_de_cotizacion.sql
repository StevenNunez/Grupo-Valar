-- ════════════════════════════════════════════════════════════════════════════
-- 0086 · La solicitud de cotización se envía desde la plataforma, y el
--        proveedor marca que la RECIBIÓ
-- ════════════════════════════════════════════════════════════════════════════
--
-- Igual que la OC (0069): cada envío queda anotado —a quién, con copia a quién,
-- quién lo mandó y cuándo—, el correo lleva el PDF adjunto y un enlace privado.
-- Por ese enlace el proveedor ve la solicitud, la descarga y aprieta «Recibí la
-- solicitud». Así Valar sabe si llegó y si la abrió, sin llamar a preguntar.
--
-- `contenido` es una FOTO de lo que se mandó (número, contrato, ítems,
-- observaciones). El enlace y el PDF muestran siempre eso, aunque después se
-- edite la solicitud: lo que vio el proveedor es lo que quedó escrito.
--
-- EL ENLACE NO SE GUARDA, solo su huella (sha-256). Vence a los 90 días.
--
-- Quién escribe: SOLO el servidor, con la clave de servicio y después de
-- comprobar con la sesión de la persona que tiene `cotizacion.gestionar`. Por
-- eso no hay políticas de escritura: la tabla se lee desde la pantalla, y nada
-- más.
--
-- Se aplica pegándola entera en el SQL Editor. Es idempotente.

create table if not exists public.cotizaciones_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas (id),
  cotizacion_id text not null,
  -- Copiado de la solicitud para que el RLS pregunte por contrato sin un join.
  contrato_id text not null,
  enviada_en timestamptz not null default now(),
  enviada_por uuid references auth.users (id) on delete set null,
  enviada_por_nombre text,
  para text not null,
  cc text[] not null default '{}',
  asunto text not null,
  contenido jsonb not null,
  token_hash text not null unique,
  expira_en timestamptz not null,
  -- Lo que hace el proveedor con el enlace.
  vista_en timestamptz,
  vistas int not null default 0,
  recibida_en timestamptz,
  recibida_por text,
  comentario text,
  foreign key (empresa_id, cotizacion_id)
    references public.cotizaciones (empresa_id, id)
    on update cascade on delete cascade
);

create index if not exists cotizaciones_envios_cotizacion
  on public.cotizaciones_envios (empresa_id, cotizacion_id, enviada_en desc);

comment on table public.cotizaciones_envios is
  'Cada envío de una solicitud de cotización al proveedor: destinatarios, foto del contenido, enlace privado (solo su huella) y el «recibida» del proveedor.';

alter table public.cotizaciones_envios enable row level security;

drop policy if exists "envios de cotizacion: lee" on public.cotizaciones_envios;
create policy "envios de cotizacion: lee" on public.cotizaciones_envios
  for select to authenticated
  using (
    public.ve_empresa(empresa_id)
    and public.puede('solped.ver', contrato_id)
  );

grant select on public.cotizaciones_envios to authenticated;

notify pgrst, 'reload schema';
