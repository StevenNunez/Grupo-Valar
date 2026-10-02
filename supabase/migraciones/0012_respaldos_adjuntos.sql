-- ============================================================================
-- Plataforma Valar — Respaldos adjuntos a cada registro
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0001 a 0011.
--
-- POR QUÉ: Valar está a mitad de camino entre la planilla y la plataforma. El
-- número vive acá, pero el documento que lo respalda —la factura en PDF, la
-- planilla de sueldos, el estado de pago que mandó el mandante, el contrato en
-- Word— sigue viviendo en un correo o en una carpeta del computador de alguien.
--
-- Con esto el documento se sube y queda colgado del registro que respalda. La
-- planilla deja de ser la fuente y pasa a ser lo que corresponde: el respaldo.
--
-- CÓMO ESTÁ ARMADO: el archivo va a Supabase Storage (bucket privado
-- `respaldos`) y acá queda la ficha que dice a qué registro pertenece, quién lo
-- subió y cuándo. Storage guarda archivos, no relaciones; la relación es esto.
-- ============================================================================

-- ─── El bucket ──────────────────────────────────────────────────────────────
-- Privado: los archivos solo se alcanzan con una URL firmada que la plataforma
-- pide con la sesión del usuario. Nada queda accesible en internet abierto.
--
-- El límite de 25 MB por archivo es holgado para una factura o una planilla, y
-- deja margen dentro del 1 GB del plan gratuito. Si algún día aprieta, la
-- mudanza a R2 está anotada en la memoria del proyecto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'respaldos',
  'respaldos',
  false,
  26214400,                                              -- 25 MB
  array[
    'application/pdf',
    -- Excel: el .xlsx moderno y el .xls viejo, que todavía circula
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    -- Word
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv',
    'text/plain',
    -- Fotos: una boleta o una guía de despacho llegan así desde la faena
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── La ficha de cada archivo ───────────────────────────────────────────────

create table if not exists public.adjuntos (
  id uuid primary key default gen_random_uuid(),
  -- A qué registro respalda. `tabla` + `registro_id` es la misma dirección que
  -- usa la bitácora de auditoría, así que un registro muestra su historial y
  -- sus respaldos con la misma clave.
  tabla text not null,
  registro_id text not null,
  nombre text not null,                                  -- como se llamaba el archivo
  ruta text not null unique,                             -- dónde quedó dentro del bucket
  tipo text,                                             -- el mime que declaró el navegador
  tamano bigint not null check (tamano > 0),
  descripcion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.adjuntos is
  'Documentos de respaldo colgados de un registro. El archivo vive en el bucket `respaldos`.';
comment on column public.adjuntos.ruta is
  'Ruta dentro del bucket: <tabla>/<registro_id>/<archivo>. Única, para que dos subidas no se pisen.';

create index if not exists adjuntos_registro_idx
  on public.adjuntos (tabla, registro_id, creado_en desc);

-- Solo se adjunta a registros que existen en el módulo. La lista se comprueba
-- con una restricción y no con una clave foránea porque apunta a nueve tablas
-- distintas, cada una con su propia clave.
alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal',
    'ordenes_compra_proveedor', 'items_compra'
  )
);

-- ─── Autoría y bitácora ─────────────────────────────────────────────────────
-- Mismo mecanismo que el resto del módulo: quién subió qué lo estampa la base,
-- no la aplicación.

alter table public.adjuntos
  add column if not exists creado_por uuid references auth.users (id) on delete set null;
alter table public.adjuntos
  add column if not exists actualizado_por uuid references auth.users (id) on delete set null;

drop trigger if exists adjuntos_actualizado on public.adjuntos;
create trigger adjuntos_actualizado
  before update on public.adjuntos
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists adjuntos_autoria on public.adjuntos;
create trigger adjuntos_autoria
  before insert or update on public.adjuntos
  for each row execute function public.marcar_autoria();

drop trigger if exists adjuntos_auditoria on public.adjuntos;
create trigger adjuntos_auditoria
  after insert or update or delete on public.adjuntos
  for each row execute function public.registrar_auditoria();

-- Se suma a la lista para que 0003 la tome si se vuelve a correr.
create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos'
  ];
$$;

-- ─── Quién sube y quién mira ────────────────────────────────────────────────
-- Leer, cualquiera con sesión: el respaldo existe justamente para poder
-- mostrarlo. Subir y borrar, solo rol de gestión, igual que el dato que
-- respalda.

alter table public.adjuntos enable row level security;

drop policy if exists "adjuntos: lectura autenticada" on public.adjuntos;
create policy "adjuntos: lectura autenticada"
  on public.adjuntos for select to authenticated using (true);

drop policy if exists "adjuntos: escribe gestion" on public.adjuntos;
create policy "adjuntos: escribe gestion"
  on public.adjuntos for all to authenticated
  using (public.puede_editar()) with check (public.puede_editar());

-- ─── Las mismas reglas sobre el archivo ─────────────────────────────────────
-- Sin esto, la ficha estaría protegida y el archivo no. Las políticas van sobre
-- `storage.objects`, acotadas al bucket.

drop policy if exists "respaldos: lectura autenticada" on storage.objects;
create policy "respaldos: lectura autenticada"
  on storage.objects for select to authenticated
  using (bucket_id = 'respaldos');

drop policy if exists "respaldos: sube gestion" on storage.objects;
create policy "respaldos: sube gestion"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'respaldos' and public.puede_editar());

drop policy if exists "respaldos: borra gestion" on storage.objects;
create policy "respaldos: borra gestion"
  on storage.objects for delete to authenticated
  using (bucket_id = 'respaldos' and public.puede_editar());

-- ─── Cuántos respaldos tiene cada registro ──────────────────────────────────
-- Para poder pintar el clip con un número en la tabla sin traerse la lista
-- completa de archivos de todas las filas.

create or replace view public.adjuntos_por_registro as
select tabla, registro_id, count(*) as cuantos, max(creado_en) as ultimo
from public.adjuntos
group by tabla, registro_id;

alter view public.adjuntos_por_registro set (security_invoker = true);
grant select on public.adjuntos_por_registro to authenticated;

notify pgrst, 'reload schema';
