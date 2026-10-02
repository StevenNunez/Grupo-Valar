-- ============================================================================
-- Plataforma Valar — Cotizaciones, avance por ítem y expediente
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0015.
--
-- QUÉ RESUELVE (todo salió de revisar el diseño antes de congelarlo):
--
--   1. El avance se sigue POR ÍTEM, no por documento. Una SOLPED de diez ítems
--      con ocho cotizados y dos comprados no cabe en un solo estado.
--   2. La cotización se compara ítem contra ítem, no por su total: es la única
--      forma de saber que el cemento salía más barato en A y el fierro en B.
--   3. Se distingue cuándo se PIDIÓ el precio de cuándo LLEGÓ. De ahí sale el
--      tiempo de respuesta de cada proveedor.
--   4. Se guarda la fecha que el proveedor COMPROMETE, además de la requerida y
--      la real. Sin esas tres no hay cumplimiento de entrega que medir.
--   5. Cambiar una SOLPED ya aprobada la devuelve a aprobación. Una firma vale
--      para lo que se firmó, no para lo que se escriba después.
--
-- LO QUE NO SE HIZO Y SE PROPUSO: una tabla intermedia entre la SOLPED y la OC.
-- Ya existe: es `items_compra`, que tiene `solped_item_id`, `cantidad`,
-- `precio_unitario` y `orden_id`. Guardar la cantidad comprada en dos tablas es
-- la receta para que dos pantallas muestren números distintos. Lo que faltaba
-- era la VISTA que responde la pregunta, y es la primera de este archivo.
-- ============================================================================

-- ─── Cotizaciones ───────────────────────────────────────────────────────────
-- Una por proveedor y por SOLPED. La SOLCOT de Valar es esta ficha: la llena
-- abastecimiento con los precios que averigua, no se le manda al proveedor para
-- que la complete.
--
-- `solicitada_en` y `recibida_en` van separadas a propósito: la diferencia
-- entre las dos es el tiempo de respuesta del proveedor, que es un dato de
-- gestión que hoy no existe en ninguna parte.

create table if not exists public.cotizaciones (
  id text primary key,                                   -- "COT-0001"
  /* El número interno con que Valar la identifica, si se usa uno. */
  numero text,
  solped_id text not null references public.solped (id) on delete cascade,
  proveedor_id text not null references public.proveedores (id) on delete restrict,

  solicitada_en date not null default current_date,
  recibida_en date,
  validez_hasta date,
  plazo_entrega_dias smallint check (plazo_entrega_dias >= 0),
  condicion_pago text,

  /* El flete y el descuento no son un detalle: son lo que hace que el más
     barato de la lista no sea el más barato puesto en obra. Van aparte para
     poder comparar las dos cosas. */
  flete bigint not null default 0 check (flete >= 0),
  descuento bigint not null default 0 check (descuento >= 0),

  estado text not null default 'solicitada'
    check (estado in ('solicitada', 'recibida', 'descartada', 'seleccionada')),
  seleccionada boolean not null default false,
  /* Obligatorio al seleccionar. No solo cuando no gana el más barato: escribir
     "menor precio" cuesta un segundo y deja el criterio por escrito igual. */
  motivo_seleccion text,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint cotizacion_seleccionada_con_motivo
    check (not seleccionada or motivo_seleccion is not null),
  unique (solped_id, proveedor_id)
);

comment on table public.cotizaciones is
  'Precios de un proveedor para una solicitud. La diferencia entre solicitada_en y recibida_en es su tiempo de respuesta.';

create index if not exists cotizaciones_solped_idx on public.cotizaciones (solped_id);
create index if not exists cotizaciones_proveedor_idx on public.cotizaciones (proveedor_id);

create table if not exists public.cotizacion_items (
  id text primary key,
  cotizacion_id text not null references public.cotizaciones (id) on delete cascade,
  /* Contra qué ítem de la solicitud cotiza. Es lo que permite comparar precio
     contra precio en vez de total contra total, y descubrir que el cemento
     conviene en A y el fierro en B. */
  solped_item_id text not null references public.solped_items (id) on delete cascade,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  precio_unitario bigint not null default 0 check (precio_unitario >= 0),
  neto bigint generated always as (round(cantidad * precio_unitario)) stored,
  /* Si el proveedor no tiene el ítem, se deja dicho: una cotización con un
     hueco no es lo mismo que una cotización más barata. */
  disponible boolean not null default true,
  plazo_dias smallint check (plazo_dias >= 0),
  observacion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (cotizacion_id, solped_item_id)
);

comment on table public.cotizacion_items is
  'El precio de un proveedor para un ítem concreto de la solicitud.';

create index if not exists cotizacion_items_cot_idx on public.cotizacion_items (cotizacion_id);
create index if not exists cotizacion_items_item_idx on public.cotizacion_items (solped_item_id);

-- ─── Cuánto va de cada ítem pedido ──────────────────────────────────────────
-- Pedido, comprado, recibido y pendiente, deducidos de lo que existe. Nada de
-- esto se teclea ni se guarda: un contador que alguien tiene que acordarse de
-- actualizar es un contador que va a estar malo.

drop view if exists public.solped_items_avance;
create view public.solped_items_avance
with (security_invoker = true) as
  select
    i.id,
    i.solped_id,
    i.linea,
    i.descripcion,
    i.unidad,
    i.cantidad as cantidad_pedida,
    i.categoria_id,
    i.observacion,
    coalesce(sum(ic.cantidad), 0)::numeric              as cantidad_comprada,
    coalesce(sum(ic.cantidad_recibida), 0)::numeric     as cantidad_recibida,
    greatest(i.cantidad - coalesce(sum(ic.cantidad), 0), 0)::numeric as cantidad_pendiente,
    coalesce(sum(ic.neto), 0)::bigint                   as comprado_neto,
    count(distinct ic.orden_id)::int                    as ordenes,
    /* El estado del ítem, no el del documento. Este es el punto: una SOLPED
       puede tener un ítem recibido, otro comprado y otro todavía pendiente, y
       las tres cosas son ciertas al mismo tiempo. */
    case
      when coalesce(sum(ic.cantidad_recibida), 0) >= i.cantidad then 'recibido'
      when coalesce(sum(ic.cantidad), 0) >= i.cantidad then 'comprado'
      when coalesce(sum(ic.cantidad), 0) > 0 then 'comprado-parcial'
      when exists (
        select 1 from public.cotizacion_items ci where ci.solped_item_id = i.id
      ) then 'cotizado'
      else 'pendiente'
    end as estado
  from public.solped_items i
  left join public.items_compra ic on ic.solped_item_id = i.id
  group by i.id;

-- ─── El cuadro comparativo ──────────────────────────────────────────────────
-- Una fila por cotización con lo que de verdad se compara: el costo puesto en
-- obra, no el subtotal de la lista.

drop view if exists public.comparativo_cotizaciones;
create view public.comparativo_cotizaciones
with (security_invoker = true) as
  select
    c.id,
    c.solped_id,
    c.proveedor_id,
    p.razon_social as proveedor,
    c.numero,
    c.solicitada_en,
    c.recibida_en,
    (c.recibida_en - c.solicitada_en)::int as dias_respuesta,
    c.validez_hasta,
    c.plazo_entrega_dias,
    c.condicion_pago,
    c.estado,
    c.seleccionada,
    c.motivo_seleccion,
    coalesce(sum(ci.neto), 0)::bigint as items_neto,
    c.descuento,
    c.flete,
    /* Lo único que sirve para decidir: lo que cuesta tenerlo en obra. */
    (coalesce(sum(ci.neto), 0) - c.descuento + c.flete)::bigint as costo_puesto,
    count(ci.id)::int as items_cotizados,
    count(ci.id) filter (where not ci.disponible)::int as items_sin_stock
  from public.cotizaciones c
  join public.proveedores p on p.id = c.proveedor_id
  left join public.cotizacion_items ci on ci.cotizacion_id = c.id
  group by c.id, p.razon_social;

comment on view public.comparativo_cotizaciones is
  'Cotizaciones lado a lado por su costo puesto en obra: ítems menos descuento más flete.';

grant select on public.comparativo_cotizaciones to authenticated;
grant select on public.solped_items_avance to authenticated;

-- ─── Las tres fechas de una entrega ─────────────────────────────────────────
-- Requerida (lo que necesita faena), comprometida (lo que promete el proveedor)
-- y real (lo que pasó). Con una sola no se puede saber de quién fue el atraso.

alter table public.ordenes_compra_proveedor
  add column if not exists fecha_comprometida date;

alter table public.ordenes_compra_proveedor
  add column if not exists fecha_confirmacion date;

comment on column public.ordenes_compra_proveedor.fecha_comprometida is
  'La que el proveedor promete al confirmar. Contra la recepción real sale su cumplimiento.';

alter table public.ordenes_compra_proveedor
  add column if not exists cotizacion_id text
    references public.cotizaciones (id) on delete set null;

-- ─── Cumplimiento del proveedor ─────────────────────────────────────────────
-- Sale de las tres fechas. Es el KPI que convierte la recepción, que ya se
-- registraba, en información de gestión.

drop view if exists public.cumplimiento_proveedores;
create view public.cumplimiento_proveedores
with (security_invoker = true) as
  with entregas as (
    select
      o.proveedor_id,
      o.id as orden_id,
      o.fecha_comprometida,
      max(i.fecha_recepcion) as fecha_recibida
    from public.ordenes_compra_proveedor o
    join public.items_compra i on i.orden_id = o.id
    where o.proveedor_id is not null
      and i.fecha_recepcion is not null
    group by o.proveedor_id, o.id, o.fecha_comprometida
  )
  select
    p.id as proveedor_id,
    p.razon_social as proveedor,
    count(e.orden_id)::int as entregas,
    count(e.orden_id) filter (
      where e.fecha_comprometida is not null and e.fecha_recibida <= e.fecha_comprometida
    )::int as a_tiempo,
    count(e.orden_id) filter (
      where e.fecha_comprometida is not null and e.fecha_recibida > e.fecha_comprometida
    )::int as atrasadas,
    round(avg(
      case when e.fecha_comprometida is not null
        then (e.fecha_recibida - e.fecha_comprometida) end
    ), 1) as dias_atraso_promedio
  from public.proveedores p
  left join entregas e on e.proveedor_id = p.id
  group by p.id, p.razon_social;

comment on view public.cumplimiento_proveedores is
  'Entregas a tiempo y atraso promedio de cada proveedor, medidos contra la fecha que él mismo comprometió.';

grant select on public.cumplimiento_proveedores to authenticated;

-- ─── Cambiar lo aprobado exige aprobarlo de nuevo ───────────────────────────
-- Una firma vale para lo que se firmó. Si después de aprobada se agrega,
-- cambia o borra un ítem, la solicitud vuelve a la fila de aprobación y sube su
-- versión. No es desconfianza: es que el aprobador tiene derecho a ver lo que
-- está autorizando.

alter table public.solped
  add column if not exists version smallint not null default 1;

create or replace function public.reabrir_solped_modificada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cual text := coalesce(new.solped_id, old.solped_id);
  estado_actual text;
begin
  select estado into estado_actual from public.solped where id = cual;

  /* Solo importa mientras esté aprobada y todavía no se haya comprado nada.
     Después de que hay órdenes emitidas, cambiar la solicitud es otro problema
     —el de la orden— y devolverla a aprobación no arreglaría nada. */
  if estado_actual in ('aprobada', 'en-cotizacion', 'cotizada') then
    update public.solped
    set estado = 'en-aprobacion',
        version = version + 1
    where id = cual;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists solped_items_reabren on public.solped_items;
create trigger solped_items_reabren
  after insert or update or delete on public.solped_items
  for each row execute function public.reabrir_solped_modificada();

comment on function public.reabrir_solped_modificada() is
  'Devuelve a aprobación una solicitud ya aprobada cuyos ítems cambiaron, y sube su versión.';

-- ─── Autoría, bitácora y RLS de lo nuevo ────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['cotizaciones', 'cotizacion_items'] loop
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
      'create policy "%s: escribe gestion" on public.%I
         for all to authenticated
         using (public.puede_editar()) with check (public.puede_editar())', t, t);
  end loop;
end;
$$;

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos',
    'proveedores', 'solped', 'solped_items', 'cotizaciones', 'cotizacion_items'
  ];
$$;

-- Los respaldos también cuelgan de una cotización: el PDF que mandó el
-- proveedor es la prueba de lo que cotizó.
alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal',
    'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones'
  )
);

-- ─── El expediente ──────────────────────────────────────────────────────────
-- Una fila por solicitud con TODO el ciclo resumido: qué se pidió, qué se
-- cotizó, qué se compró, qué llegó, qué se facturó y qué se pagó.
--
-- Es la pantalla que responde de una sola mirada las preguntas que hoy obligan
-- a abrir cuatro planillas: ¿en qué va?, ¿qué falta?, ¿llegó la factura?,
-- ¿se pagó?

drop view if exists public.expediente_solped;
create view public.expediente_solped
with (security_invoker = true) as
  with avance as (
    select
      a.solped_id,
      count(*)::int as items,
      count(*) filter (where a.estado = 'pendiente')::int as items_pendientes,
      count(*) filter (where a.estado = 'cotizado')::int as items_cotizados,
      count(*) filter (where a.estado in ('comprado', 'comprado-parcial'))::int as items_comprados,
      count(*) filter (where a.estado = 'recibido')::int as items_recibidos,
      coalesce(sum(a.cantidad_pedida), 0)::numeric as cantidad_pedida,
      coalesce(sum(a.cantidad_comprada), 0)::numeric as cantidad_comprada,
      coalesce(sum(a.cantidad_recibida), 0)::numeric as cantidad_recibida,
      coalesce(sum(a.comprado_neto), 0)::bigint as comprado_neto
    from public.solped_items_avance a
    group by a.solped_id
  ),
  cotiz as (
    select
      c.solped_id,
      count(*)::int as cotizaciones,
      count(*) filter (where c.recibida_en is not null)::int as cotizaciones_recibidas,
      min(cc.costo_puesto) filter (where c.recibida_en is not null)::bigint as mejor_costo,
      max(cc.costo_puesto) filter (where c.recibida_en is not null)::bigint as peor_costo,
      max(cc.costo_puesto) filter (where c.seleccionada)::bigint as costo_elegido
    from public.cotizaciones c
    join public.comparativo_cotizaciones cc on cc.id = c.id
    group by c.solped_id
  ),
  ordenes as (
    select
      o.solped_id,
      count(*)::int as ordenes,
      count(*) filter (where o.estado in ('emitida', 'parcial'))::int as ordenes_abiertas
    from public.ordenes_compra_proveedor o
    where o.solped_id is not null
    group by o.solped_id
  ),
  firmas as (
    select
      ap.registro_id,
      count(*) filter (where ap.accion = 'aprobado')::int as aprobaciones,
      max(ap.ocurrido_en) as ultima_firma
    from public.aprobaciones ap
    where ap.documento = 'solped'
    group by ap.registro_id
  )
  select
    s.id,
    s.numero,
    s.version,
    s.contrato_id,
    c.nombre as contrato,
    s.sa,
    s.solicitante_nombre,
    s.solicitante_cargo,
    s.area,
    s.tipo_gasto,
    s.prioridad,
    s.estado,
    s.fecha_emision,
    s.fecha_requerida,
    (current_date - s.fecha_emision)::int as dias_abierta,
    coalesce(a.items, 0) as items,
    coalesce(a.items_pendientes, 0) as items_pendientes,
    coalesce(a.items_cotizados, 0) as items_cotizados,
    coalesce(a.items_comprados, 0) as items_comprados,
    coalesce(a.items_recibidos, 0) as items_recibidos,
    coalesce(a.cantidad_pedida, 0) as cantidad_pedida,
    coalesce(a.cantidad_comprada, 0) as cantidad_comprada,
    coalesce(a.cantidad_recibida, 0) as cantidad_recibida,
    coalesce(a.comprado_neto, 0) as comprado_neto,
    coalesce(k.cotizaciones, 0) as cotizaciones,
    coalesce(k.cotizaciones_recibidas, 0) as cotizaciones_recibidas,
    k.mejor_costo,
    k.peor_costo,
    k.costo_elegido,
    /* Ahorro competitivo: contra la MEJOR alternativa comparable, no contra la
       más cara. Comparar contra la más cara infla el número igual que comparar
       contra un presupuesto que escribió el propio solicitante. */
    case
      when k.costo_elegido is not null and k.mejor_costo is not null
      then (k.mejor_costo - k.costo_elegido)::bigint
    end as diferencia_vs_mejor,
    coalesce(o.ordenes, 0) as ordenes,
    coalesce(o.ordenes_abiertas, 0) as ordenes_abiertas,
    coalesce(f.aprobaciones, 0) as aprobaciones,
    f.ultima_firma
  from public.solped s
  join public.contratos c on c.id = s.contrato_id
  left join avance a on a.solped_id = s.id
  left join cotiz k on k.solped_id = s.id
  left join ordenes o on o.solped_id = s.id
  left join firmas f on f.registro_id = s.id;

comment on view public.expediente_solped is
  'El ciclo completo de una solicitud en una fila: pedido, cotizado, comprado, recibido y firmado.';

grant select on public.expediente_solped to authenticated;

notify pgrst, 'reload schema';
