-- Egresos generales de la empresa, sin contrato asociado. Los activos se
-- identifican aparte para no confundir inversión con costo operativo.
create table if not exists public.egresos_oficina_central (
  empresa_id text not null default public.empresa_actual()
    references public.empresas(id),
  id uuid not null default gen_random_uuid(),
  categoria text not null check (categoria in ('compras', 'arriendos', 'insumos', 'activos')),
  fecha date not null,
  proveedor text not null check (btrim(proveedor) <> ''),
  descripcion text not null check (btrim(descripcion) <> ''),
  documento text,
  neto numeric(15, 0) not null check (neto > 0),
  iva numeric(15, 0) not null default 0 check (iva >= 0),
  total numeric(15, 0) generated always as (neto + iva) stored,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado')),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id)
);

create index if not exists egresos_oficina_central_fecha_idx
  on public.egresos_oficina_central (empresa_id, fecha desc);

create or replace function public.actualizar_fecha_oficina_central()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists egresos_oficina_central_fecha on public.egresos_oficina_central;
create trigger egresos_oficina_central_fecha
  before update on public.egresos_oficina_central
  for each row execute function public.actualizar_fecha_oficina_central();

drop trigger if exists egresos_oficina_central_autoria on public.egresos_oficina_central;
create trigger egresos_oficina_central_autoria
  before insert or update on public.egresos_oficina_central
  for each row execute function public.marcar_autoria();

drop trigger if exists egresos_oficina_central_auditoria on public.egresos_oficina_central;
create trigger egresos_oficina_central_auditoria
  after insert or update or delete on public.egresos_oficina_central
  for each row execute function public.registrar_auditoria();

alter table public.egresos_oficina_central enable row level security;

drop policy if exists "oficina central: lectura empresa" on public.egresos_oficina_central;
create policy "oficina central: lectura empresa"
  on public.egresos_oficina_central for select to authenticated
  using (public.ve_empresa(empresa_id));

drop policy if exists "oficina central: gestion inserta" on public.egresos_oficina_central;
create policy "oficina central: gestion inserta"
  on public.egresos_oficina_central for insert to authenticated
  with check (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'));

drop policy if exists "oficina central: gestion modifica" on public.egresos_oficina_central;
create policy "oficina central: gestion modifica"
  on public.egresos_oficina_central for update to authenticated
  using (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'))
  with check (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'));

drop policy if exists "oficina central: gestion elimina" on public.egresos_oficina_central;
create policy "oficina central: gestion elimina"
  on public.egresos_oficina_central for delete to authenticated
  using (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'));

grant select, insert, update, delete on public.egresos_oficina_central to authenticated;
notify pgrst, 'reload schema';
