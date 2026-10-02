-- ============================================================================
-- Plataforma Valar — Órdenes de compra a proveedores e ítems de gasto
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0001 a 0006.
--
-- EL CAMBIO DE FONDO: la unidad de costo deja de ser el documento y pasa a ser
-- el ÍTEM.
--
-- Así es como compra Valar de verdad: se emite una OC a un proveedor con varias
-- líneas —discos de corte, guantes, fierro—, el proveedor entrega por partes, y
-- esa misma OC termina repartida en varias facturas. Dentro de una factura
-- puede haber una línea reembolsable y otras que no.
--
-- Con la marca de "reembolsable" en el documento, eso era imposible de
-- registrar: obligaba a partir la factura o a mentir en una de las dos líneas.
-- Puesta en el ítem, cada línea dice lo suyo y el Dashboard suma bien.
--
-- OJO CON EL NOMBRE: `ordenes_compra` (de 0002) son las que el MANDANTE nos
-- emite a nosotros, y autorizan lo que podemos cobrar. Estas otras son las que
-- NOSOTROS le emitimos a un proveedor. En obra las dos se llaman "OC"; acá se
-- distinguen por el sufijo.
-- ============================================================================

-- ─── La orden de compra que emitimos ────────────────────────────────────────

create table if not exists public.ordenes_compra_proveedor (
  id text primary key,                                   -- "OCP-MISC-0012"
  contrato_id text not null references public.contratos (id) on delete restrict,
  numero text not null,                                  -- el correlativo visible
  proveedor text not null,
  rut_proveedor text,
  contacto text,
  correo_contacto text,
  fecha_emision date not null default current_date,
  /* Cuándo se necesita en faena. Es lo que convierte la OC en un compromiso y
     no en una lista de deseos. */
  fecha_requerida date,
  lugar_entrega text,
  condiciones_pago text default '30 días desde la factura',
  /* borrador  → todavía se está armando, no se envió
     emitida   → se mandó al proveedor
     parcial   → llegó parte de los ítems
     recibida  → llegó todo, falta facturación o pago
     cerrada   → recibida, facturada y pagada
     anulada   → se dejó sin efecto */
  estado text not null default 'borrador'
    check (estado in ('borrador', 'emitida', 'parcial', 'recibida', 'cerrada', 'anulada')),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (contrato_id, numero)
);

comment on table public.ordenes_compra_proveedor is
  'OC que Valar emite a un proveedor. Se imprime y se envía desde la plataforma.';

create index if not exists ocp_contrato_idx
  on public.ordenes_compra_proveedor (contrato_id, fecha_emision desc);

-- ─── El ítem: la unidad de costo ────────────────────────────────────────────

create table if not exists public.items_compra (
  id text primary key,                                   -- "IT-MISC-000123"
  contrato_id text not null references public.contratos (id) on delete restrict,
  /* De qué OC salió. Nulo cuando es un gasto directo sin orden previa: una
     compra chica de ferretería no necesita OC. */
  orden_id text references public.ordenes_compra_proveedor (id) on delete set null,
  /* En qué factura llegó. Nulo mientras el proveedor no facture: es
     exactamente lo que permite saber qué de la OC está pendiente. */
  compra_id text references public.compras (id) on delete set null,
  categoria_id text references public.categorias_costo (id) on delete set null,

  descripcion text not null,
  cantidad numeric(12, 2) not null default 1 check (cantidad > 0),
  unidad text not null default 'un',
  precio_unitario bigint not null default 0 check (precio_unitario >= 0),
  /* El neto no se teclea: sale de cantidad × precio. Un total escrito a mano
     que no cuadra con sus partes es la forma más común de descuadrar una OC. */
  neto bigint generated always as (round(cantidad * precio_unitario)) stored,
  iva bigint not null default 0 check (iva >= 0),

  /* Acá vive ahora la marca que antes estaba en el documento. */
  tipo text not null default 'ordinario'
    check (tipo in ('ordinario', 'reembolsable')),

  estado_recepcion text not null default 'pendiente'
    check (estado_recepcion in ('pendiente', 'parcial', 'recibido')),
  cantidad_recibida numeric(12, 2) not null default 0 check (cantidad_recibida >= 0),
  fecha_recepcion date,
  recibido_por text,

  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.items_compra is
  'Línea de gasto. Es la unidad de costo del módulo: acá viven la categoría y la marca de reembolsable.';

create index if not exists items_contrato_idx on public.items_compra (contrato_id);
create index if not exists items_orden_idx on public.items_compra (orden_id);
create index if not exists items_compra_idx on public.items_compra (compra_id);
create index if not exists items_categoria_idx on public.items_compra (categoria_id);

-- La factura del proveedor gana su fecha de pago.
alter table public.compras add column if not exists fecha_pago date;
alter table public.compras
  add column if not exists orden_id text
    references public.ordenes_compra_proveedor (id) on delete set null;

-- ============================================================================
-- Migración de los gastos que ya están cargados
--
-- Cada compra existente pasa a tener un ítem con sus mismos datos: cantidad 1
-- al precio del neto. Los totales no se mueven ni un peso, y desde ahora se
-- pueden ir abriendo en líneas a medida que se carguen con OC.
-- ============================================================================

insert into public.items_compra (
  id, contrato_id, compra_id, categoria_id, descripcion,
  cantidad, unidad, precio_unitario, iva, tipo,
  estado_recepcion, cantidad_recibida, fecha_recepcion, observaciones
)
select
  'IT-' || c.id,
  c.contrato_id,
  c.id,
  c.categoria_id,
  c.detalle,
  1,
  'un',
  c.neto,
  c.iva,
  c.tipo,
  -- Si la factura ya llegó, el material se recibió: no se factura lo que no
  -- se entregó.
  'recibido',
  1,
  c.fecha,
  c.observaciones
from public.compras c
where not exists (
  select 1 from public.items_compra i where i.compra_id = c.id
);

-- Los SERVICIOS no se convierten en ítems. Un subcontrato o un arriendo es una
-- sola cosa: partirlo en líneas no aporta, y su marca de reembolsable a nivel de
-- documento alcanza. Siguen entrando al costo por su propia tabla.

-- ─── La factura y su ítem no pueden separarse ───────────────────────────────
-- Mientras la interfaz de Compras siga editando el encabezado, hay que impedir
-- que el total del documento y el de su única línea se vayan por caminos
-- distintos. Con varias líneas el encabezado deja de mandar: manda la suma.

create or replace function public.sincronizar_item_unico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cuantos int;
begin
  select count(*) into cuantos from public.items_compra where compra_id = new.id;

  if cuantos = 1 then
    update public.items_compra
    set precio_unitario = new.neto,
        cantidad = 1,
        iva = new.iva,
        tipo = new.tipo,
        categoria_id = new.categoria_id,
        descripcion = new.detalle,
        fecha_recepcion = new.fecha
    where compra_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists compras_sincroniza_item on public.compras;
create trigger compras_sincroniza_item
  after update on public.compras
  for each row execute function public.sincronizar_item_unico();

-- ─── Estado de la orden, deducido de sus ítems ──────────────────────────────
-- El estado no se teclea: lo dicen las líneas. Una OC "recibida" con la mitad
-- de los ítems pendientes es una mentira que se cuela sola si se escribe a mano.

create or replace function public.recalcular_estado_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  orden text := coalesce(new.orden_id, old.orden_id);
  total int;
  recibidos int;
  facturados int;
  estado_actual text;
begin
  if orden is null then
    return coalesce(new, old);
  end if;

  select estado into estado_actual
  from public.ordenes_compra_proveedor where id = orden;

  -- Un borrador o una orden anulada no cambian de estado por sus líneas.
  if estado_actual in ('borrador', 'anulada') then
    return coalesce(new, old);
  end if;

  select
    count(*),
    count(*) filter (where estado_recepcion = 'recibido'),
    count(*) filter (where compra_id is not null)
  into total, recibidos, facturados
  from public.items_compra where orden_id = orden;

  update public.ordenes_compra_proveedor
  set estado = case
        when total = 0 then 'emitida'
        when recibidos = total and facturados = total then 'cerrada'
        when recibidos = total then 'recibida'
        when recibidos > 0 then 'parcial'
        else 'emitida'
      end
  where id = orden;

  return coalesce(new, old);
end;
$$;

drop trigger if exists items_estado_orden on public.items_compra;
create trigger items_estado_orden
  after insert or update or delete on public.items_compra
  for each row execute function public.recalcular_estado_orden();

-- ─── Marca de tiempo, autoría, bitácora y RLS ───────────────────────────────

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'categorias_costo',
    'ordenes_compra_proveedor', 'items_compra', 'seguridad'
  ];
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ordenes_compra_proveedor', 'items_compra'] loop
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
-- Las vistas pasan a leer los ítems
-- ============================================================================

/* Cada ítem con todo lo que hace falta para mostrarlo y para sumarlo. */
drop view if exists public.items_detalle;
create view public.items_detalle
with (security_invoker = true) as
  select
    i.id,
    i.contrato_id,
    i.orden_id,
    i.compra_id,
    i.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    coalesce(cat.familia, 'compras') as familia,
    o.numero as orden_numero,
    o.proveedor as orden_proveedor,
    c.proveedor as factura_proveedor,
    c.documento as factura_numero,
    c.estado_pago,
    c.fecha_pago,
    -- La fecha del gasto es la de la factura; mientras no llegue, la de
    -- recepción; y si tampoco, la de emisión de la orden.
    coalesce(c.fecha, i.fecha_recepcion, o.fecha_emision) as fecha,
    date_trunc('month', coalesce(c.fecha, i.fecha_recepcion, o.fecha_emision))::date as periodo,
    i.descripcion,
    i.cantidad,
    i.unidad,
    i.precio_unitario,
    i.neto,
    i.iva,
    (i.neto + i.iva) as total,
    i.tipo,
    i.estado_recepcion,
    i.cantidad_recibida,
    i.fecha_recepcion,
    -- Lo que se pregunta en la reunión: en qué parte del ciclo va la línea.
    case
      when i.compra_id is not null and c.estado_pago = 'pagada' then 'pagado'
      when i.compra_id is not null then 'facturado'
      when i.estado_recepcion = 'recibido' then 'recibido'
      when i.estado_recepcion = 'parcial' then 'parcial'
      else 'pendiente'
    end as etapa
  from public.items_compra i
  left join public.categorias_costo cat on cat.id = i.categoria_id
  left join public.ordenes_compra_proveedor o on o.id = i.orden_id
  left join public.compras c on c.id = i.compra_id;

/* La orden con sus totales y su avance. */
drop view if exists public.ordenes_proveedor_resumen;
create view public.ordenes_proveedor_resumen
with (security_invoker = true) as
  select
    o.*,
    coalesce(count(i.id), 0)::int as items,
    coalesce(count(i.id) filter (where i.estado_recepcion = 'recibido'), 0)::int as items_recibidos,
    coalesce(count(i.id) filter (where i.compra_id is not null), 0)::int as items_facturados,
    coalesce(sum(i.neto), 0)::bigint as neto,
    coalesce(sum(i.neto + i.iva), 0)::bigint as total,
    coalesce(sum(i.neto) filter (where i.tipo = 'reembolsable'), 0)::bigint as reembolsable,
    coalesce(sum(i.neto) filter (where i.compra_id is not null), 0)::bigint as facturado
  from public.ordenes_compra_proveedor o
  left join public.items_compra i on i.orden_id = o.id
  group by o.id;

/*
  Costos unificados: ahora las compras y los servicios entran por sus ítems, y
  el personal sigue entrando por su total mensual.

  Esto es lo que hace que un ítem reembolsable dentro de una factura ordinaria
  llegue bien al Dashboard.
*/
/* `cascade` porque `resumen_mensual` y `costos_por_categoria` cuelgan de esta
   vista; se vuelven a crear más abajo, sin cambios respecto de 0005. */
drop view if exists public.costos_unificados cascade;
create view public.costos_unificados
with (security_invoker = true) as
  select
    d.id, d.contrato_id, d.categoria_id, d.categoria, d.familia,
    d.fecha, d.periodo,
    coalesce(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor') as tercero,
    d.descripcion as detalle,
    d.tipo, d.neto, d.iva, d.total,
    coalesce(d.estado_pago, 'pendiente') as estado_pago
  from public.items_detalle d

  union all

  select
    s.id, s.contrato_id, s.categoria_id,
    coalesce(cat.nombre, 'Servicios'), coalesce(cat.familia, 'servicios'),
    s.fecha, date_trunc('month', s.fecha)::date,
    s.contratista,
    s.detalle,
    s.tipo, s.neto, s.iva, s.total,
    s.estado_pago
  from public.servicios s
  left join public.categorias_costo cat on cat.id = s.categoria_id

  union all

  select
    p.id, p.contrato_id, p.categoria_id,
    coalesce(cat.nombre, 'Personal'), coalesce(cat.familia, 'personal'),
    p.periodo, p.periodo,
    p.faena,
    'Remuneraciones y leyes sociales',
    'ordinario',
    p.costo_total, 0::bigint, p.costo_total,
    'pagada'
  from public.costos_personal p
  left join public.categorias_costo cat on cat.id = p.categoria_id;

-- ─── Vistas que dependían de `costos_unificados` ────────────────────────────
-- Las tira abajo el `cascade` de arriba. Van idénticas a 0005: solo cambia de
-- dónde saca las compras la vista de la que cuelgan.

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
