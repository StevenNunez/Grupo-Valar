-- ============================================================================
-- Plataforma Valar — Cada contrato tiene su propia planilla
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0021.
--
-- EL PROBLEMA: los formularios de Personal, Servicios y Compras son iguales
-- para todos los contratos, y los contratos no lo son. El estado de pago de
-- Misceláneos se arma con cargos, horas y turnos; el de Torres, con número de
-- torres y días de arriendo. Hoy esa información no cabe en ninguna parte y
-- termina en una planilla aparte, que es de donde vinimos.
--
-- LA DECISIÓN DE FONDO: núcleo fijo, planilla propia encima.
--
--   Fijo y tipado   → contrato, fecha, categoría, neto, IVA, tipo de gasto,
--                     estado de pago. Es lo que alimenta el margen.
--   Propio          → todo lo demás: cargo, turno, N° de torre, HH del cargo.
--
-- Por qué no dejar que el contrato defina TODOS sus campos: el Dashboard suma
-- dos contratos en un mismo total. Si el neto de uno viviera en un campo que
-- ese contrato inventó, no habría forma de consolidar, y el módulo entero
-- existe para consolidar. Los campos propios describen; los fijos cuentan.
--
-- CÓMO SE GUARDA: los valores propios van en una columna `datos` de tipo jsonb
-- en cada registro. No es pereza de modelado: son campos que cambian por
-- contrato y en el tiempo, y una columna por cada uno significaría una
-- migración cada vez que alguien agrega "turno" a un contrato.
-- ============================================================================

-- ─── La definición de la planilla ───────────────────────────────────────────

create table if not exists public.campos_contrato (
  id text primary key,                                   -- "CF-MISC-personal-cargo"
  contrato_id text not null references public.contratos (id) on delete cascade,
  /* En qué formulario aparece. Un contrato puede pedir cosas distintas al
     cargar un costo de personal que al presentar un estado de pago. */
  seccion text not null
    check (seccion in ('personal', 'servicios', 'compras', 'estado_pago')),
  /* El nombre con que se guarda dentro del jsonb: sin espacios ni acentos. Lo
     genera la aplicación desde la etiqueta; no se teclea. */
  clave text not null check (clave ~ '^[a-z][a-z0-9_]*$'),
  etiqueta text not null,
  tipo text not null default 'texto'
    check (tipo in ('texto', 'numero', 'moneda', 'fecha', 'opcion', 'booleano')),
  unidad text,                                           -- "HH", "un", "días"
  /* Para los campos de tipo `opcion`: las alternativas del desplegable. */
  opciones text[] not null default '{}',
  ayuda text,
  obligatorio boolean not null default false,
  /* Un campo numérico marcado acá se puede totalizar al presentar el estado de
     pago: por ejemplo las HH de cada cargo, que sumadas son las HH del mes. */
  suma_en_edp boolean not null default false,
  orden smallint not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (contrato_id, seccion, clave)
);

comment on table public.campos_contrato is
  'Los campos propios de cada contrato, por formulario. El núcleo —neto, IVA, categoría— no vive acá: es fijo y tipado para que el Dashboard pueda consolidar.';

create index if not exists campos_contrato_idx
  on public.campos_contrato (contrato_id, seccion, orden) where activo;

-- ─── Dónde se guardan los valores ───────────────────────────────────────────
-- Una columna jsonb por tabla. Los campos propios cambian por contrato y en el
-- tiempo; una columna por cada uno obligaría a una migración cada vez que
-- alguien agrega "turno" a un contrato.

alter table public.costos_personal add column if not exists datos jsonb not null default '{}'::jsonb;
alter table public.servicios       add column if not exists datos jsonb not null default '{}'::jsonb;
alter table public.compras         add column if not exists datos jsonb not null default '{}'::jsonb;
alter table public.estados_pago    add column if not exists datos jsonb not null default '{}'::jsonb;

comment on column public.costos_personal.datos is
  'Valores de los campos propios del contrato, según campos_contrato. El núcleo no vive acá.';

-- Índices GIN: permiten filtrar y agrupar por un campo propio sin recorrer la
-- tabla entera. Sin esto, "cuánto se gastó en el turno B" recorre todo.
create index if not exists costos_personal_datos_idx on public.costos_personal using gin (datos);
create index if not exists servicios_datos_idx       on public.servicios using gin (datos);
create index if not exists compras_datos_idx         on public.compras using gin (datos);
create index if not exists estados_pago_datos_idx    on public.estados_pago using gin (datos);

-- ─── Autoría, bitácora y RLS ────────────────────────────────────────────────

alter table public.campos_contrato
  add column if not exists creado_por uuid references auth.users (id) on delete set null;
alter table public.campos_contrato
  add column if not exists actualizado_por uuid references auth.users (id) on delete set null;

drop trigger if exists campos_contrato_actualizado on public.campos_contrato;
create trigger campos_contrato_actualizado
  before update on public.campos_contrato
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists campos_contrato_autoria on public.campos_contrato;
create trigger campos_contrato_autoria
  before insert or update on public.campos_contrato
  for each row execute function public.marcar_autoria();

drop trigger if exists campos_contrato_auditoria on public.campos_contrato;
create trigger campos_contrato_auditoria
  after insert or update or delete on public.campos_contrato
  for each row execute function public.registrar_auditoria();

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos',
    'proveedores', 'solped', 'solped_items', 'cotizaciones', 'cotizacion_items',
    'anexos', 'campos_contrato'
  ];
$$;

alter table public.campos_contrato enable row level security;

drop policy if exists "campos: lectura autenticada" on public.campos_contrato;
create policy "campos: lectura autenticada"
  on public.campos_contrato for select to authenticated using (true);

drop policy if exists "campos: escribe gestion" on public.campos_contrato;
create policy "campos: escribe gestion"
  on public.campos_contrato for all to authenticated
  using (public.puede_editar()) with check (public.puede_editar());

-- ─── La planilla de los dos contratos reales ────────────────────────────────
-- Se siembran los campos que las planillas de Valar ya usan, para que el módulo
-- llegue con algo puesto en vez de una pantalla vacía. Son editables: esto es
-- un punto de partida, no una definición cerrada.

insert into public.campos_contrato
  (id, contrato_id, seccion, clave, etiqueta, tipo, unidad, opciones, ayuda, suma_en_edp, orden)
values
  -- Misceláneos: el EDP se arma por cargo y horas trabajadas.
  ('CF-MISC-personal-cargo', 'C-MISC', 'personal', 'cargo', 'Cargo', 'opcion', null,
   array['Supervisor', 'Maestro eléctrico', 'Maestro mecánico', 'Soldador', 'Ayudante', 'Prevencionista'],
   'El cargo con que se presenta en el estado de pago.', false, 1),
  ('CF-MISC-personal-turno', 'C-MISC', 'personal', 'turno', 'Turno', 'opcion', null,
   array['A', 'B', 'Administrativo'], null, false, 2),
  ('CF-MISC-personal-hh_cargo', 'C-MISC', 'personal', 'hh_cargo', 'HH del cargo', 'numero', 'HH',
   '{}', 'Horas de este cargo en el mes. Sumadas dan las HH del estado de pago.', true, 3),

  -- Torres: el EDP se arma por equipo y días de arriendo.
  ('CF-TORRES-servicios-torres', 'C-TORRES', 'servicios', 'torres', 'N° de torres', 'numero', 'un',
   '{}', 'Cuántas torres cubre este servicio.', true, 1),
  ('CF-TORRES-servicios-dias', 'C-TORRES', 'servicios', 'dias_arriendo', 'Días de arriendo', 'numero', 'días',
   '{}', 'Días efectivos del período.', true, 2),
  ('CF-TORRES-servicios-faena', 'C-TORRES', 'servicios', 'faena_equipo', 'Faena del equipo', 'texto', null,
   '{}', 'Dónde estuvo instalado.', false, 3)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
