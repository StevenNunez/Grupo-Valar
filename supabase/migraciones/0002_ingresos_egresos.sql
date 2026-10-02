-- ============================================================================
-- Plataforma Valar — Control de Gestión: Ingresos y Egresos
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- IDEA CENTRAL: el Dashboard deja de tener números propios. Todo se calcula
-- desde estas tablas:
--
--   Facturación del mes  ←  facturas emitidas
--   Costo real del contrato  ←  compras + costo de personal
--
-- Por eso `contratos.costo_real` y la tabla `facturacion` DESAPARECEN: eran
-- copias a mano de algo que ahora se deduce. Un solo lugar donde cargar el
-- dato, un solo número posible.
-- ============================================================================

-- ─── INGRESOS ───────────────────────────────────────────────────────────────

-- Estados de pago presentados al mandante.
create table if not exists public.estados_pago (
  id text primary key,                                   -- "EP-C2601-03"
  contrato_id text not null references public.contratos (id) on delete cascade,
  numero smallint not null,
  periodo date not null,                                 -- día 1 del mes que cubre
  avance_periodo numeric(5, 2) not null default 0
    check (avance_periodo between 0 and 100),
  monto_neto bigint not null check (monto_neto >= 0),
  retenciones bigint not null default 0 check (retenciones >= 0),
  estado text not null
    check (estado in ('presentado', 'aprobado', 'facturado', 'pagado', 'rechazado')),
  fecha_presentacion date not null,
  fecha_aprobacion date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (contrato_id, numero)
);

comment on table public.estados_pago is
  'EP presentados al mandante. El monto va neto y en pesos, sin decimales.';

-- Órdenes de compra recibidas del mandante: el techo de lo que se puede cobrar.
create table if not exists public.ordenes_compra (
  id text primary key,                                   -- "OC-C2601-01"
  contrato_id text not null references public.contratos (id) on delete cascade,
  numero text not null,                                  -- el folio del mandante
  mandante text not null,
  monto_autorizado bigint not null check (monto_autorizado >= 0),
  fecha_emision date not null,
  vigencia date,
  estado text not null default 'vigente'
    check (estado in ('vigente', 'consumida', 'vencida')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Facturas emitidas. De acá sale la facturación mensual del Dashboard.
create table if not exists public.facturas (
  id text primary key,                                   -- el folio: "F-4821"
  contrato_id text not null references public.contratos (id) on delete cascade,
  estado_pago_id text references public.estados_pago (id) on delete set null,
  neto bigint not null check (neto >= 0),
  iva bigint not null default 0 check (iva >= 0),
  fecha_emision date not null,
  vencimiento date,
  estado_cobro text not null default 'emitida'
    check (estado_cobro in ('emitida', 'enviada', 'pagada', 'vencida')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- El total nunca se teclea: se calcula. Así no puede quedar descuadrado.
alter table public.facturas
  drop column if exists total;
alter table public.facturas
  add column total bigint generated always as (neto + iva) stored;

-- ─── EGRESOS ────────────────────────────────────────────────────────────────

-- Compras de materiales, insumos y servicios, imputadas al contrato.
create table if not exists public.compras (
  id text primary key,                                   -- "CO-C2601-07"
  contrato_id text not null references public.contratos (id) on delete cascade,
  proveedor text not null,
  documento text,                                        -- factura del proveedor
  detalle text not null,
  -- Ordinario: costo propio de la obra, va contra el presupuesto.
  -- Reembolsable: se le recupera al mandante, no debería castigar el margen.
  tipo text not null default 'ordinario'
    check (tipo in ('ordinario', 'reembolsable')),
  neto bigint not null check (neto >= 0),
  iva bigint not null default 0 check (iva >= 0),
  fecha date not null,
  estado_pago text not null default 'pendiente'
    check (estado_pago in ('pendiente', 'pagada')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.compras
  drop column if exists total;
alter table public.compras
  add column total bigint generated always as (neto + iva) stored;

-- Costo de mano de obra por contrato y mes.
create table if not exists public.costos_personal (
  id text primary key,                                   -- "PE-C2601-2026-07"
  contrato_id text not null references public.contratos (id) on delete cascade,
  faena text not null default '',
  periodo date not null,                                 -- día 1 del mes
  dotacion smallint not null default 0 check (dotacion >= 0),
  horas_hombre integer not null default 0 check (horas_hombre >= 0),
  remuneraciones bigint not null default 0 check (remuneraciones >= 0),
  leyes_sociales bigint not null default 0 check (leyes_sociales >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (contrato_id, periodo)
);

alter table public.costos_personal
  drop column if exists costo_total;
alter table public.costos_personal
  add column costo_total bigint
    generated always as (remuneraciones + leyes_sociales) stored;

-- ─── Índices ────────────────────────────────────────────────────────────────

create index if not exists estados_pago_contrato_idx on public.estados_pago (contrato_id);
create index if not exists estados_pago_periodo_idx on public.estados_pago (periodo);
create index if not exists ordenes_compra_contrato_idx on public.ordenes_compra (contrato_id);
create index if not exists facturas_contrato_idx on public.facturas (contrato_id);
create index if not exists facturas_emision_idx on public.facturas (fecha_emision);
create index if not exists compras_contrato_idx on public.compras (contrato_id);
create index if not exists compras_fecha_idx on public.compras (fecha);
create index if not exists costos_personal_contrato_idx on public.costos_personal (contrato_id);

-- ─── Marca de tiempo al editar ──────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'estados_pago', 'ordenes_compra', 'facturas', 'compras', 'costos_personal'
  ] loop
    execute format('drop trigger if exists %I_actualizado on public.%I', t, t);
    execute format(
      'create trigger %I_actualizado before update on public.%I
         for each row execute function public.tocar_actualizado_en()', t, t);
  end loop;
end;
$$;

-- ============================================================================
-- Vistas: lo que el Dashboard lee
--
-- `security_invoker = true` es lo que hace que respeten RLS: la vista consulta
-- con los permisos de quien la llama, no con los de quien la creó. Sin eso,
-- una vista sería un agujero por el que se ven datos sin sesión.
-- ============================================================================

-- Facturación por mes, deducida de las facturas emitidas.
drop view if exists public.facturacion_mensual;
create view public.facturacion_mensual
with (security_invoker = true) as
  select
    date_trunc('month', fecha_emision)::date as periodo,
    sum(neto)::bigint as monto,
    count(*)::int as documentos
  from public.facturas
  group by 1;

-- Contratos con su costo real deducido de los egresos imputados.
-- Las compras reembolsables se suman aparte: son costo, pero se recuperan del
-- mandante, así que castigar el margen con ellas daría una lectura falsa.
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
    coalesce(co.reembolsable, 0)::bigint as costo_reembolsable,
    coalesce(pe.personal, 0)::bigint as costo_personal,
    (coalesce(co.ordinario, 0) + coalesce(pe.personal, 0))::bigint as costo_real,
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
    select contrato_id, sum(costo_total) as personal
    from public.costos_personal
    group by contrato_id
  ) pe on pe.contrato_id = c.id
  left join (
    select contrato_id, sum(neto) as facturado
    from public.facturas
    group by contrato_id
  ) fa on fa.contrato_id = c.id;

-- ============================================================================
-- Row Level Security — mismas reglas que el resto:
-- con sesión se lee todo; escribir requiere rol 'gestion' o 'admin'.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'estados_pago', 'ordenes_compra', 'facturas', 'compras', 'costos_personal'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s: lectura autenticada" on public.%I', t, t);
    execute format(
      'create policy "%s: lectura autenticada" on public.%I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s: escribe gestion" on public.%I', t, t);
    execute format(
      'create policy "%s: escribe gestion" on public.%I
         for all to authenticated
         using (public.puede_editar()) with check (public.puede_editar())', t, t);
  end loop;
end;
$$;

-- ─── Limpieza de lo que quedó duplicado ─────────────────────────────────────
-- Se hace al final: si algo de arriba falla, no se pierde nada.

drop table if exists public.facturacion;          -- ahora es facturacion_mensual
alter table public.contratos drop column if exists costo_real;  -- ahora se deduce
