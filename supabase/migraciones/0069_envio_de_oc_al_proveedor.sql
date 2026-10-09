-- ════════════════════════════════════════════════════════════════════════════
-- 0069 · La OC se le envía al proveedor desde la plataforma, y él la confirma
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cada envío queda anotado: a quién, con copia a quién, quién lo mandó y
-- cuándo. El correo lleva el PDF adjunto y un enlace privado a la orden; por
-- ese enlace el proveedor la ve, la descarga y la CONFIRMA con la fecha de
-- entrega que se compromete. Esa fecha va a la orden (`fecha_comprometida`,
-- que ya usa el indicador de entregas a tiempo de la 0016).
--
-- EL ENLACE NO SE GUARDA. Se guarda su huella (sha-256): quien lea esta tabla
-- no puede armar el enlace de nadie. Vence a los 90 días.
--
-- Quién escribe: SOLO el servidor de la plataforma, con la clave de servicio y
-- después de comprobar con la sesión de la persona que tiene `ordenes.emitir`
-- y que la orden no es un borrador. Por eso no hay políticas de escritura: la
-- tabla se lee desde la pantalla, y nada más.

create table if not exists public.ordenes_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas (id),
  orden_id text not null,
  -- Copiado de la orden para que el RLS pregunte por contrato sin un join.
  contrato_id text not null,
  enviada_en timestamptz not null default now(),
  enviada_por uuid references auth.users (id) on delete set null,
  enviada_por_nombre text,
  para text not null,
  cc text[] not null default '{}',
  asunto text not null,
  token_hash text not null unique,
  expira_en timestamptz not null,
  -- Lo que hace el proveedor con el enlace.
  vista_en timestamptz,
  vistas int not null default 0,
  confirmada_en timestamptz,
  confirmada_por text,
  fecha_entrega date,
  comentario text,
  foreign key (empresa_id, orden_id)
    references public.ordenes_compra_proveedor (empresa_id, id)
    on update cascade on delete cascade
);

create index if not exists ordenes_envios_orden
  on public.ordenes_envios (empresa_id, orden_id, enviada_en desc);

comment on table public.ordenes_envios is
  'Cada envío de una OC al proveedor: destinatarios, enlace privado (solo su huella) y la confirmación del proveedor.';

alter table public.ordenes_envios enable row level security;

drop policy if exists "envios de oc: lee" on public.ordenes_envios;
create policy "envios de oc: lee" on public.ordenes_envios
  for select to authenticated
  using (
    public.ve_empresa(empresa_id)
    and (public.puede('ordenes.ver', contrato_id) or public.puede('egresos.ver', contrato_id))
  );

grant select on public.ordenes_envios to authenticated;

notify pgrst, 'reload schema';
