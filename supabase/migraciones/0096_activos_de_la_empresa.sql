-- ============================================================================
-- 0096 — Los activos de la empresa: de dónde vienen, dónde están y cuánto valen
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0095.
--
-- Pagnol es la fuente de verdad de QUÉ activos existen (código, nombre, estado)
-- y no se duplica. Pero Pagnol no sabe lo que Valar necesita para controlar la
-- gestión: para qué contrato se compró, dónde está HOY, de quién es y cuánto
-- costó. Eso vive acá, una fila por activo de Pagnol (`pagnol_activo_id`).
--
-- El caso que motivó esto: activos comprados para un contrato (p. ej. Salar de
-- Atacama) que hoy están en Oficina Central. Por eso hay DOS contratos:
--
--   contrato_origen_id     para qué contrato se compró (no cambia)
--   ubicacion              'oficina_central' o 'contrato' (dónde está hoy)
--   contrato_ubicacion_id  en cuál contrato está, si ubicacion = 'contrato'
--
-- `propiedad` separa lo que suma al patrimonio de lo que no: un arriendo o un
-- equipo del cliente se rastrea en Pagnol, pero no es un activo de la empresa.
-- ============================================================================

create table if not exists public.activos_valar (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  pagnol_activo_id uuid not null,
  /* Copia de cómo se ve en Pagnol, para mostrarlo sin preguntarle cada vez. */
  codigo text,
  nombre text,
  propiedad text not null default 'propio'
    check (propiedad in ('propio', 'arrendado', 'del_cliente')),
  contrato_origen_id text,
  ubicacion text not null default 'oficina_central'
    check (ubicacion in ('oficina_central', 'contrato')),
  contrato_ubicacion_id text,
  /* Neto en CLP. Nulo = todavía no se sabe. */
  valor numeric(15, 0) check (valor is null or valor >= 0),
  fecha_compra date,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  unique (empresa_id, pagnol_activo_id),
  /* Está en un contrato si y solo si dice en cuál. */
  check ((ubicacion = 'contrato') = (contrato_ubicacion_id is not null)),
  foreign key (empresa_id, contrato_origen_id)
    references public.contratos (empresa_id, id) on delete set null (contrato_origen_id),
  foreign key (empresa_id, contrato_ubicacion_id)
    references public.contratos (empresa_id, id) on delete set null (contrato_ubicacion_id)
);

comment on table public.activos_valar is
  'Lo que Valar sabe de cada activo de Pagnol: contrato de origen, ubicación actual, propiedad y valor. Pagnol dice qué activos existen; esto dice cuánto valen y dónde están para la gestión.';

create index if not exists activos_valar_origen_idx on public.activos_valar (empresa_id, contrato_origen_id);
create index if not exists activos_valar_ubicacion_idx on public.activos_valar (empresa_id, ubicacion, contrato_ubicacion_id);

drop trigger if exists activos_valar_actualizado on public.activos_valar;
create trigger activos_valar_actualizado before update on public.activos_valar
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists activos_valar_autoria on public.activos_valar;
create trigger activos_valar_autoria before insert or update on public.activos_valar
  for each row execute function public.marcar_autoria();
drop trigger if exists activos_valar_auditoria on public.activos_valar;
create trigger activos_valar_auditoria after insert or update or delete on public.activos_valar
  for each row execute function public.registrar_auditoria();

alter table public.activos_valar enable row level security;

-- Se ve igual que Oficina Central: quien entra a ese apartado de Control de Gestión.
drop policy if exists "activos: lee" on public.activos_valar;
create policy "activos: lee" on public.activos_valar for select to authenticated
  using (public.ve_empresa(empresa_id) and public.tiene_permiso('oficina_central.ver'));

drop policy if exists "activos: gestion inserta" on public.activos_valar;
create policy "activos: gestion inserta" on public.activos_valar for insert to authenticated
  with check (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'));

drop policy if exists "activos: gestion modifica" on public.activos_valar;
create policy "activos: gestion modifica" on public.activos_valar for update to authenticated
  using (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'))
  with check (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'));

drop policy if exists "activos: gestion elimina" on public.activos_valar;
create policy "activos: gestion elimina" on public.activos_valar for delete to authenticated
  using (empresa_id = public.empresa_actual() and public.tiene_permiso('gestion.editar'));

grant select, insert, update, delete on public.activos_valar to authenticated;

notify pgrst, 'reload schema';
