-- ============================================================================
-- 0071 — Servicio con detalle por equipo (estado de pago de torres)
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0070.
--
-- POR QUÉ: el arriendo de torres llega como un estado de pago mensual con una
-- línea por torre. Hasta ahora se cargaba un solo servicio con el total, y no
-- quedaba cuántas torres cubría, cuántos días ni a qué tarifa.
--
-- CÓMO: el servicio sigue siendo UN registro en `servicios` (de ahí sale el
-- costo, como siempre: nada del Dashboard cambia). Sus líneas viven en esta
-- tabla y son solo detalle. Cuando un servicio tiene líneas, la aplicación
-- guarda su neto como la suma de ellas.
-- ============================================================================

create table if not exists public.servicio_lineas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  servicio_id text not null,
  -- Copiado del servicio para que el RLS pregunte por contrato sin un join.
  contrato_id text not null,
  orden int not null default 0,
  /* Qué se cobra: la torre (o el equipo), con el nombre o código que traiga el
     estado de pago del proveedor. */
  equipo text not null,
  concepto text not null default 'arriendo'
    check (concepto in ('arriendo', 'traslado', 'mantencion', 'otro')),
  faena text,
  desde date,
  hasta date,
  dias int check (dias is null or dias >= 0),
  cantidad numeric(12, 2) not null default 1 check (cantidad >= 0),
  precio_unitario bigint not null default 0 check (precio_unitario >= 0),
  -- Neto de la línea. Normalmente cantidad × precio, pero se guarda tal como
  -- viene en el estado de pago (una prorrata por días no es un producto exacto).
  neto bigint not null default 0 check (neto >= 0),
  observaciones text,
  creado_en timestamptz not null default now(),
  foreign key (empresa_id, servicio_id)
    references public.servicios (empresa_id, id)
    on update cascade on delete cascade
);

create index if not exists servicio_lineas_servicio
  on public.servicio_lineas (empresa_id, servicio_id, orden);
create index if not exists servicio_lineas_contrato
  on public.servicio_lineas (empresa_id, contrato_id);

comment on table public.servicio_lineas is
  'Detalle por equipo de un servicio (una línea por torre en el estado de pago del proveedor). El costo sigue saliendo de servicios.neto.';

-- ─── RLS: los mismos permisos que el servicio al que pertenecen ─────────────

alter table public.servicio_lineas enable row level security;

drop policy if exists "servicio_lineas: base" on public.servicio_lineas;
create policy "servicio_lineas: base" on public.servicio_lineas
  for all to authenticated using (true) with check (true);

drop policy if exists "servicio_lineas: solo su empresa" on public.servicio_lineas;
create policy "servicio_lineas: solo su empresa" on public.servicio_lineas
  as restrictive for all to authenticated
  using (public.ve_empresa(empresa_id))
  with check (public.ve_empresa(empresa_id));

drop policy if exists "acceso: lee" on public.servicio_lineas;
create policy "acceso: lee" on public.servicio_lineas
  as restrictive for select to authenticated
  using (public.puede('egresos.ver', contrato_id));

drop policy if exists "acceso: crea" on public.servicio_lineas;
create policy "acceso: crea" on public.servicio_lineas
  as restrictive for insert to authenticated
  with check (public.puede('gestion.editar', contrato_id));

drop policy if exists "acceso: cambia" on public.servicio_lineas;
create policy "acceso: cambia" on public.servicio_lineas
  as restrictive for update to authenticated
  using (public.puede('gestion.editar', contrato_id))
  with check (public.puede('gestion.editar', contrato_id));

drop policy if exists "acceso: borra" on public.servicio_lineas;
create policy "acceso: borra" on public.servicio_lineas
  as restrictive for delete to authenticated
  using (public.puede('gestion.editar', contrato_id));

grant select, insert, update, delete on public.servicio_lineas to authenticated;

notify pgrst, 'reload schema';
