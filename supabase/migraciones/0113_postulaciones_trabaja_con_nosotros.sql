-- ============================================================================
-- 0113 — Postulaciones de «Trabaja con nosotros»
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0112.
--
-- El sitio público (www.grupovalar.cl/trabaja-con-nosotros/) recibe currículums.
-- Es una base de datos de postulantes para cuando haga falta personal.
--
-- QUÉ PUEDE HACER UN VISITANTE (rol `anon`, clave pública del sitio):
--   · insertar UNA postulación con los campos del formulario;
--   · subir UN archivo (PDF/DOC/DOCX, hasta 5 MB) a una carpeta con id nuevo.
--   Nada más: no lee, no lista, no modifica, no borra. Ni siquiera la suya.
--
-- QUIÉN LAS VE: quien tiene el permiso «Cargar costos de personal»
-- (`personal.editar`) y el administrador general, de la empresa de la
-- postulación. Descargan el CV con un enlace firmado de corta duración.
--
-- ANTI-ABUSO: tope de 3 postulaciones por correo cada 24 horas (trigger), largos
-- máximos en cada campo, tipos y tamaño de archivo en el bucket, y una trampa para
-- robots en el formulario. No hay captcha: si llega basura, se agrega Turnstile.
--
-- PRIVACIDAD: se guarda la fecha y la versión de la política que aceptó. El
-- aviso del sitio promete conservar los CV hasta 24 meses: la pantalla marca las
-- vencidas; borrarlas es una acción de la persona de RR.HH., no automática.
-- ============================================================================

-- ─── El bucket privado ──────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'postulaciones',
  'postulaciones',
  false,
  5242880,                                               -- 5 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── La tabla ───────────────────────────────────────────────────────────────

create table if not exists public.postulaciones (
  id uuid primary key,                                    -- lo genera el navegador: une la fila con su archivo
  empresa_id text not null default 'valar' references public.empresas (id),
  creado_en timestamptz not null default now(),

  nombre text not null check (btrim(nombre) <> '' and char_length(nombre) <= 120),
  correo text not null check (correo ~* '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' and char_length(correo) <= 160),
  telefono text not null check (btrim(telefono) <> '' and char_length(telefono) <= 30),
  ciudad text not null check (btrim(ciudad) <> '' and char_length(ciudad) <= 80),
  area text not null check (btrim(area) <> '' and char_length(area) <= 80),
  experiencia text not null check (btrim(experiencia) <> '' and char_length(experiencia) <= 40),
  mensaje text check (mensaje is null or char_length(mensaje) <= 1500),

  cv_ruta text not null check (cv_ruta = id::text || '/' || split_part(cv_ruta, '/', 2) and split_part(cv_ruta, '/', 2) <> ''),
  cv_nombre text not null check (char_length(cv_nombre) <= 200),
  cv_tamano integer not null check (cv_tamano > 0 and cv_tamano <= 5242880),

  consentimiento_en timestamptz not null default now(),
  version_privacidad text not null check (char_length(version_privacidad) <= 20),

  -- Lo que hace después el equipo de RR.HH.
  estado text not null default 'nueva' check (estado in ('nueva', 'en_revision', 'contactada', 'descartada', 'contratada')),
  notas text check (notas is null or char_length(notas) <= 2000),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);

comment on table public.postulaciones is
  'Currículums recibidos en «Trabaja con nosotros». El archivo vive en el bucket privado `postulaciones` (cv_ruta).';

create index if not exists postulaciones_empresa_fecha_idx on public.postulaciones (empresa_id, creado_en desc);
create index if not exists postulaciones_correo_idx on public.postulaciones (correo, creado_en desc);

-- ─── Tope por correo (corre con permisos del dueño: `anon` no puede leer la tabla) ──

create or replace function public.limitar_postulaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.postulaciones
       where correo = lower(new.correo) and creado_en > now() - interval '24 hours') >= 3 then
    raise exception 'Demasiadas postulaciones con este correo en las últimas 24 horas.' using errcode = 'check_violation';
  end if;
  new.correo := lower(new.correo);
  return new;
end;
$$;

drop trigger if exists postulaciones_limite on public.postulaciones;
create trigger postulaciones_limite
  before insert on public.postulaciones
  for each row execute function public.limitar_postulaciones();

create or replace function public.actualizar_postulacion()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists postulaciones_actualizada on public.postulaciones;
create trigger postulaciones_actualizada
  before update on public.postulaciones
  for each row execute function public.actualizar_postulacion();

-- ─── Permisos de la tabla ───────────────────────────────────────────────────

alter table public.postulaciones enable row level security;

-- El visitante solo inserta, y solo con estado «nueva» de Valar.
drop policy if exists "postulaciones: el visitante postula" on public.postulaciones;
create policy "postulaciones: el visitante postula" on public.postulaciones
  for insert to anon
  with check (empresa_id = 'valar' and estado = 'nueva' and notas is null);

-- Quien administra personal las ve y las gestiona.
drop policy if exists "postulaciones: lectura de RR.HH." on public.postulaciones;
create policy "postulaciones: lectura de RR.HH." on public.postulaciones
  for select to authenticated
  using (public.ve_empresa(empresa_id) and public.tiene_permiso('personal.editar'));

drop policy if exists "postulaciones: RR.HH. modifica" on public.postulaciones;
create policy "postulaciones: RR.HH. modifica" on public.postulaciones
  for update to authenticated
  using (public.ve_empresa(empresa_id) and public.tiene_permiso('personal.editar'))
  with check (public.ve_empresa(empresa_id) and public.tiene_permiso('personal.editar'));

drop policy if exists "postulaciones: RR.HH. elimina" on public.postulaciones;
create policy "postulaciones: RR.HH. elimina" on public.postulaciones
  for delete to authenticated
  using (public.ve_empresa(empresa_id) and public.tiene_permiso('personal.editar'));

revoke all on public.postulaciones from anon, authenticated;
-- Columnas que el visitante puede escribir (id, empresa y estado van con valores controlados).
grant insert (id, nombre, correo, telefono, ciudad, area, experiencia, mensaje,
              cv_ruta, cv_nombre, cv_tamano, version_privacidad)
  on public.postulaciones to anon;
grant select, update, delete on public.postulaciones to authenticated;

-- ─── Permisos del bucket ────────────────────────────────────────────────────

-- El visitante sube a `<uuid>/<archivo>` y nada más. Sin lectura, sin cambios.
drop policy if exists "postulaciones: el visitante sube su CV" on storage.objects;
create policy "postulaciones: el visitante sube su CV" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'postulaciones'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and array_length(storage.foldername(name), 1) = 1
  );

drop policy if exists "postulaciones: RR.HH. lee los CV" on storage.objects;
create policy "postulaciones: RR.HH. lee los CV" on storage.objects
  for select to authenticated
  using (bucket_id = 'postulaciones' and public.tiene_permiso('personal.editar'));

drop policy if exists "postulaciones: RR.HH. borra los CV" on storage.objects;
create policy "postulaciones: RR.HH. borra los CV" on storage.objects
  for delete to authenticated
  using (bucket_id = 'postulaciones' and public.tiene_permiso('personal.editar'));

notify pgrst, 'reload schema';
