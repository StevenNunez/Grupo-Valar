-- ============================================================================
-- Plataforma Valar — Contratos recurrentes, categorías propias y UF
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0001 a 0004.
--
-- POR QUÉ: el módulo se armó pensando en obras con presupuesto total y avance
-- físico ("el contrato vale $1.240 M y va en 82%"). Las planillas reales de
-- Valar muestran otra cosa: contratos de servicio que se facturan mes a mes,
-- donde lo que importa es el MARGEN DEL MES contra una meta.
--
--   Misceláneos → el precio sale de la dotación (cargos × HH × tarifa)
--   Torres      → el precio sale de las unidades (N torres × UF)
--
-- Nada se borra en esta migración: se agrega lo que falta y las columnas
-- viejas quedan donde están hasta que la interfaz termine de mudarse.
-- ============================================================================

-- ─── El contrato dice de qué tipo es ────────────────────────────────────────

alter table public.contratos
  add column if not exists tipo text not null default 'dotacion'
    check (tipo in ('dotacion', 'unidades', 'obra'));

alter table public.contratos
  add column if not exists moneda text not null default 'CLP'
    check (moneda in ('CLP', 'UF'));

-- Meta de rentabilidad sobre ventas. El semáforo de las planillas usa 20%.
alter table public.contratos
  add column if not exists meta_margen numeric(5, 2) not null default 20
    check (meta_margen >= 0 and meta_margen <= 100);

alter table public.contratos
  add column if not exists inicio date;

comment on column public.contratos.tipo is
  'dotacion = se cotiza por cargos y HH · unidades = por cantidad × precio · obra = por avance físico';

-- En un contrato recurrente no hay "presupuesto total" ni "avance físico":
-- se factura mes a mes. Las columnas quedan, pero dejan de ser obligatorias.
alter table public.contratos alter column presupuesto drop not null;
alter table public.contratos alter column avance drop not null;

-- ─── Valor de la UF ─────────────────────────────────────────────────────────
-- Un solo valor por día, traído de la fuente. En las planillas la UF de junio
-- aparece con dos valores distintos según el archivo, y eso mueve el ingreso
-- de Torres en $20.089 solo en ese mes. Con una tabla, eso no puede pasar.

create table if not exists public.uf_diaria (
  fecha date primary key,
  valor numeric(12, 2) not null check (valor > 0),
  fuente text not null default 'mindicador.cl',
  registrado_en timestamptz not null default now()
);

comment on table public.uf_diaria is
  'Valor de la UF por día. La llena una función programada; nadie la teclea.';

-- La UF de un mes es la del día 1: es la que usan las planillas para valorizar
-- el EDP del período.
create or replace function public.uf_del_mes(periodo date)
returns numeric
language sql
stable
as $$
  select valor
  from public.uf_diaria
  where fecha = date_trunc('month', periodo)::date;
$$;

alter table public.uf_diaria enable row level security;

drop policy if exists "uf: lectura autenticada" on public.uf_diaria;
create policy "uf: lectura autenticada"
  on public.uf_diaria for select to authenticated using (true);

drop policy if exists "uf: escribe gestion" on public.uf_diaria;
create policy "uf: escribe gestion"
  on public.uf_diaria for all to authenticated
  using (public.puede_editar()) with check (public.puede_editar());

-- ─── Categorías de costo, propias de cada contrato ──────────────────────────
-- Torres usa Personal, Torres, Herramientas, Camioneta e Insumos.
-- Misceláneos usa Personal, Camioneta, RRHH, EPP, Traslado, Reembolsables y
-- HH Extra. No hay una lista común: cada contrato trae la suya.

create table if not exists public.categorias_costo (
  id text primary key,                                   -- "CAT-MISC-EPP"
  contrato_id text not null references public.contratos (id) on delete cascade,
  nombre text not null,
  /* A cuál de las tres secciones del menú pertenece. Permite que Egresos siga
     teniendo Compras / Servicios / Personal aunque las categorías cambien de
     un contrato a otro. */
  familia text not null default 'compras'
    check (familia in ('compras', 'servicios', 'personal')),
  /* Los sueldos y las HH extra no llevan IVA. Marcarlo acá evita la regla "se
     asume bruto y se divide por 1,19" que las planillas aplican a ojo —y que
     en el archivo integrado se aplica dos veces sobre montos que ya venían
     netos, restando $415.207 al costo de Misceláneos solo en junio. */
  afecta_iva boolean not null default true,
  /* Cuánto se presupuestó por mes para esta categoría. De acá sale el semáforo
     de desviación de la hoja AVANCE. */
  presupuesto_mensual bigint not null default 0 check (presupuesto_mensual >= 0),
  orden smallint not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (contrato_id, nombre)
);

create index if not exists categorias_contrato_idx
  on public.categorias_costo (contrato_id, orden);

-- Cada costo dice a qué categoría del contrato pertenece.
alter table public.compras
  add column if not exists categoria_id text
    references public.categorias_costo (id) on delete set null;
alter table public.servicios
  add column if not exists categoria_id text
    references public.categorias_costo (id) on delete set null;
alter table public.costos_personal
  add column if not exists categoria_id text
    references public.categorias_costo (id) on delete set null;

-- Las planillas guardan una observación por línea; conviene no perderla.
alter table public.compras add column if not exists observaciones text;
alter table public.servicios add column if not exists observaciones text;
alter table public.costos_personal add column if not exists observaciones text;

-- ─── El EDP lleva su propia cobranza ────────────────────────────────────────
-- En la hoja EDP el estado de pago arrastra retención, fecha de cobro, monto
-- cobrado y saldo. Eso vivía repartido entre `estados_pago` y `facturas`.

alter table public.estados_pago
  add column if not exists tipo_edp text not null default 'ordinario'
    check (tipo_edp in ('ordinario', 'extraordinario'));

alter table public.estados_pago
  add column if not exists retencion_pct numeric(5, 2) not null default 0
    check (retencion_pct >= 0 and retencion_pct <= 100);

alter table public.estados_pago add column if not exists fecha_cobro date;

alter table public.estados_pago
  add column if not exists monto_cobrado bigint not null default 0
    check (monto_cobrado >= 0);

-- Para los contratos en UF: cuántas UF cubre el EDP. El monto en pesos sale de
-- multiplicar por la UF del período, no de teclearlo.
alter table public.estados_pago
  add column if not exists monto_uf numeric(12, 2) check (monto_uf >= 0);

comment on column public.estados_pago.tipo_edp is
  'Ordinario = el servicio contratado del mes · Extraordinario = trabajos fuera del contrato base';

-- ─── Auditoría de lo nuevo ──────────────────────────────────────────────────

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'categorias_costo', 'seguridad'
  ];
$$;

do $$
declare
  t text;
begin
  foreach t in array array['categorias_costo'] loop
    execute format(
      'alter table public.%I add column if not exists creado_por uuid
         references auth.users (id) on delete set null', t);
    execute format(
      'alter table public.%I add column if not exists actualizado_por uuid
         references auth.users (id) on delete set null', t);

    execute format('drop trigger if exists %I_actualizado on public.%I', t, t);
    execute format(
      'create trigger %I_actualizado before update on public.%I
         for each row execute function public.tocar_actualizado_en()', t, t);

    execute format('drop trigger if exists %I_autoria on public.%I', t, t);
    execute format(
      'create trigger %I_autoria before insert or update on public.%I
         for each row execute function public.marcar_autoria()', t, t);

    execute format('drop trigger if exists %I_auditoria on public.%I', t, t);
    execute format(
      'create trigger %I_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t, t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s: lectura autenticada" on public.%I', t, t);
    execute format(
      'create policy "%s: lectura autenticada" on public.%I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s: escribe gestion" on public.%I', t, t);
    execute format(
      'create policy "%s: escribe gestion" on public.%I for all to authenticated
         using (public.puede_editar()) with check (public.puede_editar())', t, t);
  end loop;
end;
$$;

-- ============================================================================
-- Vistas del Dashboard
-- ============================================================================

/*
  Todos los costos del módulo en una sola lista, vengan de donde vengan.

  Las tres tablas siguen existiendo porque cada una guarda campos propios —un
  subcontrato tiene período, un mes de personal tiene dotación y HH—, pero para
  sumar y para graficar hace falta verlas juntas.
*/
drop view if exists public.costos_unificados;
create view public.costos_unificados
with (security_invoker = true) as
  select
    c.id, c.contrato_id, c.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    coalesce(cat.familia, 'compras') as familia,
    c.fecha,
    date_trunc('month', c.fecha)::date as periodo,
    c.proveedor as tercero,
    c.detalle,
    c.tipo,
    c.neto, c.iva, c.total,
    c.estado_pago
  from public.compras c
  left join public.categorias_costo cat on cat.id = c.categoria_id

  union all

  select
    s.id, s.contrato_id, s.categoria_id,
    coalesce(cat.nombre, 'Servicios') as categoria,
    coalesce(cat.familia, 'servicios') as familia,
    s.fecha,
    date_trunc('month', s.fecha)::date as periodo,
    s.contratista as tercero,
    s.detalle,
    s.tipo,
    s.neto, s.iva, s.total,
    s.estado_pago
  from public.servicios s
  left join public.categorias_costo cat on cat.id = s.categoria_id

  union all

  select
    p.id, p.contrato_id, p.categoria_id,
    coalesce(cat.nombre, 'Personal') as categoria,
    coalesce(cat.familia, 'personal') as familia,
    p.periodo as fecha,
    p.periodo,
    p.faena as tercero,
    'Remuneraciones y leyes sociales' as detalle,
    'ordinario' as tipo,
    p.costo_total as neto,
    0::bigint as iva,
    p.costo_total as total,
    'pagada' as estado_pago
  from public.costos_personal p
  left join public.categorias_costo cat on cat.id = p.categoria_id;

/*
  Venta, costo y margen por contrato y mes: la fila con la que se dibuja todo
  el Dashboard.

  La venta sale de los estados de pago del período, no de las facturas: un EDP
  aprobado ya es venta del mes aunque la factura salga después.
*/
drop view if exists public.resumen_mensual;
create view public.resumen_mensual
with (security_invoker = true) as
  with meses as (
    select contrato_id, periodo from public.estados_pago
    union
    select contrato_id, periodo from public.costos_unificados
  ),
  ventas as (
    select
      contrato_id,
      periodo,
      sum(monto_neto)::bigint as venta,
      sum(monto_neto) filter (where tipo_edp = 'ordinario')::bigint as venta_ordinaria,
      sum(monto_neto) filter (where tipo_edp = 'extraordinario')::bigint as venta_extraordinaria,
      sum(monto_cobrado)::bigint as cobrado
    from public.estados_pago
    group by 1, 2
  ),
  costos as (
    select
      contrato_id,
      periodo,
      -- Los reembolsables son costo, pero se recuperan del mandante: van
      -- aparte para no ensuciar el margen de la operación.
      sum(neto) filter (where tipo = 'ordinario')::bigint as costo,
      sum(neto) filter (where tipo = 'reembolsable')::bigint as reembolsable
    from public.costos_unificados
    group by 1, 2
  )
  select
    m.contrato_id,
    c.nombre as contrato,
    c.cliente,
    m.periodo,
    coalesce(v.venta, 0)::bigint as venta,
    coalesce(v.venta_ordinaria, 0)::bigint as venta_ordinaria,
    coalesce(v.venta_extraordinaria, 0)::bigint as venta_extraordinaria,
    coalesce(v.cobrado, 0)::bigint as cobrado,
    coalesce(k.costo, 0)::bigint as costo,
    coalesce(k.reembolsable, 0)::bigint as reembolsable,
    (coalesce(v.venta, 0) - coalesce(k.costo, 0))::bigint as margen,
    case
      when coalesce(v.venta, 0) > 0
      then round(((v.venta - coalesce(k.costo, 0))::numeric / v.venta) * 100, 2)
      else null
    end as margen_pct,
    c.meta_margen
  from meses m
  join public.contratos c on c.id = m.contrato_id
  left join ventas v on v.contrato_id = m.contrato_id and v.periodo = m.periodo
  left join costos k on k.contrato_id = m.contrato_id and k.periodo = m.periodo;

/* Costo por categoría y mes, contra lo presupuestado. Es la hoja AVANCE. */
drop view if exists public.costos_por_categoria;
create view public.costos_por_categoria
with (security_invoker = true) as
  select
    cat.id as categoria_id,
    cat.contrato_id,
    cat.nombre as categoria,
    cat.familia,
    cat.afecta_iva,
    cat.presupuesto_mensual,
    cu.periodo,
    coalesce(sum(cu.neto), 0)::bigint as real,
    (coalesce(sum(cu.neto), 0) - cat.presupuesto_mensual)::bigint as desviacion
  from public.categorias_costo cat
  left join public.costos_unificados cu on cu.categoria_id = cat.id
  group by cat.id, cat.contrato_id, cat.nombre, cat.familia, cat.afecta_iva,
           cat.presupuesto_mensual, cu.periodo;
