-- ============================================================================
-- Plataforma Valar — Egresos: Servicios y subcontratos
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0001, 0002 y 0003.
--
-- El costo de una obra se parte en tres, y cada parte se carga distinto:
--
--   Compras   → materiales e insumos que se compran una vez
--   Servicios → subcontratos, arriendos y fletes, que se contratan a terceros
--   Personal  → mano de obra propia, mes a mes
--
-- Estaban los dos extremos; faltaba el del medio. Y como el costo real sale de
-- sumarlos, la vista `contratos_resumen` se rehace para incluirlo.
-- ============================================================================

create table if not exists public.servicios (
  id text primary key,                                   -- "SV-C2601-03"
  contrato_id text not null references public.contratos (id) on delete restrict,
  contratista text not null,
  documento text,                                        -- factura del tercero
  detalle text not null,
  /* Qué clase de servicio es. Sirve para saber cuánto de la obra se está
     ejecutando con terceros, que es una pregunta distinta de cuánto cuesta. */
  tipo_servicio text not null default 'subcontrato'
    check (tipo_servicio in ('subcontrato', 'arriendo', 'flete', 'asesoria', 'otro')),
  -- Mismo criterio que en compras: el reembolsable se recupera del mandante.
  tipo text not null default 'ordinario'
    check (tipo in ('ordinario', 'reembolsable')),
  neto bigint not null check (neto >= 0),
  iva bigint not null default 0 check (iva >= 0),
  fecha date not null,
  -- Un subcontrato cubre un tramo de obra, no un día. Ambas son opcionales.
  desde date,
  hasta date,
  estado_pago text not null default 'pendiente'
    check (estado_pago in ('pendiente', 'pagada')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.servicios is
  'Subcontratos, arriendos y servicios de terceros imputados al contrato.';

alter table public.servicios drop column if exists total;
alter table public.servicios
  add column total bigint generated always as (neto + iva) stored;

create index if not exists servicios_contrato_idx on public.servicios (contrato_id);
create index if not exists servicios_fecha_idx on public.servicios (fecha);

-- ─── Marca de tiempo, autoría y bitácora ────────────────────────────────────
-- Las tres funciones ya existen desde 0002 y 0003; acá solo se enganchan.

drop trigger if exists servicios_actualizado on public.servicios;
create trigger servicios_actualizado
  before update on public.servicios
  for each row execute function public.tocar_actualizado_en();

alter table public.servicios
  add column if not exists creado_por uuid references auth.users (id) on delete set null;
alter table public.servicios
  add column if not exists actualizado_por uuid references auth.users (id) on delete set null;

drop trigger if exists servicios_autoria on public.servicios;
create trigger servicios_autoria
  before insert or update on public.servicios
  for each row execute function public.marcar_autoria();

drop trigger if exists servicios_auditoria on public.servicios;
create trigger servicios_auditoria
  after insert or update or delete on public.servicios
  for each row execute function public.registrar_auditoria();

-- La lista de tablas auditadas también la incluye, para que 0003 la tome si se
-- vuelve a correr.
create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad'
  ];
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.servicios enable row level security;

drop policy if exists "servicios: lectura autenticada" on public.servicios;
create policy "servicios: lectura autenticada"
  on public.servicios for select
  to authenticated
  using (true);

drop policy if exists "servicios: escribe gestion" on public.servicios;
create policy "servicios: escribe gestion"
  on public.servicios for all
  to authenticated
  using (public.puede_editar())
  with check (public.puede_editar());

-- ============================================================================
-- El costo real pasa a ser compras + servicios + personal
-- ============================================================================

drop view if exists public.contratos_resumen;
create view public.contratos_resumen
with (security_invoker = true) as
  select
    c.id,
    c.nombre,
    c.cliente,
    c.faena,
    c.avance,
    c.presupuesto,
    c.estado,
    c.termino,
    coalesce(co.ordinario, 0)::bigint as costo_compras,
    coalesce(sv.ordinario, 0)::bigint as costo_servicios,
    coalesce(pe.personal, 0)::bigint as costo_personal,
    -- Los reembolsables de las dos fuentes van juntos y aparte: son costo, pero
    -- se recuperan del mandante, así que castigar el margen con ellos mentiría.
    (coalesce(co.reembolsable, 0) + coalesce(sv.reembolsable, 0))::bigint
      as costo_reembolsable,
    (coalesce(co.ordinario, 0) + coalesce(sv.ordinario, 0) + coalesce(pe.personal, 0))::bigint
      as costo_real,
    coalesce(fa.facturado, 0)::bigint as facturado
  from public.contratos c
  left join (
    select
      contrato_id,
      sum(neto) filter (where tipo = 'ordinario') as ordinario,
      sum(neto) filter (where tipo = 'reembolsable') as reembolsable
    from public.compras
    group by contrato_id
  ) co on co.contrato_id = c.id
  left join (
    select
      contrato_id,
      sum(neto) filter (where tipo = 'ordinario') as ordinario,
      sum(neto) filter (where tipo = 'reembolsable') as reembolsable
    from public.servicios
    group by contrato_id
  ) sv on sv.contrato_id = c.id
  left join (
    select contrato_id, sum(costo_total) as personal
    from public.costos_personal
    group by contrato_id
  ) pe on pe.contrato_id = c.id
  left join (
    select contrato_id, sum(neto) as facturado
    from public.facturas
    group by contrato_id
  ) fa on fa.contrato_id = c.id;
