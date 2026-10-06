-- ============================================================================
-- 0059 — Cada movimiento puede ser de un anexo: resultado por anexo
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0058.
--
-- POR QUÉ (06-10-2026): un anexo puede ser otro negocio dentro del contrato.
-- El Anexo N°2 de Misceláneos ("Carpas": montaje de 5000 m² de piso modular)
-- tiene sus propios ingresos y sus propios gastos; cargados al contrato se
-- mezclan con Misceláneos y no hay cómo decir cuánto ganó cada uno.
--
-- QUÉ:
--   · anexos.nombre: un nombre corto ("Carpas") para mostrarlo en los selectores.
--   · anexo_id OPCIONAL en estados_pago, compras, servicios, costos_personal,
--     solped y ordenes_compra_proveedor. Nulo = contrato base.
--   · Un trigger exige que el anexo sea del MISMO contrato del movimiento.
--   · items_detalle y costos_unificados llevan el anexo (columna nueva al
--     final): las líneas de una OC lo heredan de la OC; las de una compra
--     directa, de la compra.
--   · resultado_por_anexo: venta, costo y margen por contrato, anexo y mes.
--   · La numeración de EDP y la unicidad de personal pasan a ser por contrato
--     Y anexo: Carpas lleva su propia serie de estados de pago.
--
-- Lo ya cargado queda en el contrato base (anexo_id nulo).
-- ============================================================================

-- ─── 1. Nombre corto del anexo ──────────────────────────────────────────────

alter table public.anexos add column if not exists nombre text;
comment on column public.anexos.nombre is 'Nombre corto para elegirlo al cargar ("Carpas"). Si falta, se muestra "Anexo N°x".';

-- ─── 2. El anexo de cada movimiento ─────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['estados_pago', 'compras', 'servicios', 'costos_personal', 'solped', 'ordenes_compra_proveedor'] loop
    execute format('alter table public.%I add column if not exists anexo_id text', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_anexo_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (empresa_id, anexo_id)
         references public.anexos (empresa_id, id) on delete set null (anexo_id)', t, t || '_anexo_fkey');
    execute format('create index if not exists %I on public.%I (empresa_id, anexo_id) where anexo_id is not null', t || '_anexo_idx', t);
  end loop;
end;
$$;

/* Un anexo de otro contrato no tiene sentido: sería cargarle a Carpas un gasto
   de Torres. Se revisa en la base, no solo en la pantalla. */
create or replace function public.validar_anexo_del_contrato()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.anexo_id is not null and not exists (
    select 1 from public.anexos a
     where a.empresa_id = new.empresa_id and a.id = new.anexo_id and a.contrato_id = new.contrato_id
  ) then
    raise exception 'El anexo % no es del contrato %.', new.anexo_id, new.contrato_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['estados_pago', 'compras', 'servicios', 'costos_personal', 'solped', 'ordenes_compra_proveedor'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_anexo_valido', t);
    execute format(
      'create trigger %I before insert or update of anexo_id, contrato_id on public.%I
         for each row execute function public.validar_anexo_del_contrato()', t || '_anexo_valido', t);
  end loop;
end;
$$;

-- ─── 3. Numeración y unicidad: por contrato Y anexo ─────────────────────────
-- Antes además no miraban la empresa. coalesce(anexo_id, '') = la base.

alter table public.estados_pago drop constraint if exists estados_pago_contrato_id_numero_key;
drop index if exists public.estados_pago_contrato_id_numero_key;
create unique index if not exists estados_pago_numero_por_anexo
  on public.estados_pago (empresa_id, contrato_id, coalesce(anexo_id, ''), numero);

drop index if exists public.costos_personal_unico_idx;
create unique index costos_personal_unico_idx
  on public.costos_personal (empresa_id, contrato_id, coalesce(anexo_id, ''), periodo, categoria_id)
  where categoria_id is not null;
drop index if exists public.costos_personal_sin_categoria_idx;
create unique index costos_personal_sin_categoria_idx
  on public.costos_personal (empresa_id, contrato_id, coalesce(anexo_id, ''), periodo)
  where categoria_id is null;

-- ─── 4. Las vistas de costo llevan el anexo (columna nueva al final) ────────

create or replace view public.items_detalle
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
    fac.proveedor as factura_proveedor,
    fac.documentos as factura_numero,
    fac.estado_pago,
    fac.fecha_pago,
    case
      when o.id is not null then o.fecha_emision
      else coalesce(fac.fecha, i.fecha_recepcion)
    end as fecha,
    case
      when o.id is not null then date_trunc('month', o.fecha_emision)::date
      else coalesce(fac.periodo_control, date_trunc('month', coalesce(fac.fecha, i.fecha_recepcion))::date)
    end as periodo,
    i.descripcion,
    a.vigente::numeric(12, 2) as cantidad,
    i.unidad,
    i.precio_unitario,
    round(a.vigente * i.precio_unitario)::bigint as neto,
    case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end as iva,
    round(a.vigente * i.precio_unitario)::bigint
      + case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end as total,
    i.tipo,
    i.estado_recepcion,
    i.cantidad_recibida,
    i.fecha_recepcion,
    case
      when a.vigente > 0 and a.facturada_neta >= a.vigente and fac.estado_pago = 'pagada' then 'pagado'
      when a.vigente > 0 and a.facturada_neta >= a.vigente then 'facturado'
      when a.recibida >= a.vigente and a.recibida > 0 then 'recibido'
      when a.recibida > 0 then 'parcial'
      else 'pendiente'
    end as etapa,
    -- Nueva (0059): el anexo, de la OC o de la compra directa.
    coalesce(o.anexo_id, fac.anexo_id) as anexo_id
  from public.items_compra i
  join public.items_avance a on a.empresa_id = i.empresa_id and a.id = i.id
  left join public.categorias_costo cat on cat.empresa_id = i.empresa_id and cat.id = i.categoria_id
  left join public.ordenes_compra_proveedor o on o.empresa_id = i.empresa_id and o.id = i.orden_id
  left join lateral (
    select
      string_agg(distinct c.documento, ', ') as documentos,
      max(c.proveedor) as proveedor,
      case when bool_and(c.estado_pago = 'pagada') then 'pagada' else min(c.estado_pago) end as estado_pago,
      max(c.fecha_pago) as fecha_pago,
      min(c.fecha) as fecha,
      min(c.periodo_control) as periodo_control,
      min(c.anexo_id) as anexo_id
    from public.factura_items fi
    join public.compras c on c.empresa_id = fi.empresa_id and c.id = fi.compra_id
    where fi.empresa_id = i.empresa_id and fi.item_id = i.id
    having count(*) > 0
  ) fac on true;

create or replace view public.costos_unificados
with (security_invoker = true) as
  select d.id, d.contrato_id, d.categoria_id, d.categoria, d.familia, d.fecha, d.periodo,
         coalesce(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor') as tercero,
         d.descripcion as detalle, d.tipo, d.neto, d.iva, d.total,
         coalesce(d.estado_pago, 'pendiente') as estado_pago,
         d.anexo_id
    from public.items_detalle d
  union all
  select c.id, c.contrato_id, c.categoria_id,
         coalesce(cat.nombre, 'Sin categoría'), coalesce(cat.familia, 'compras'),
         c.fecha, coalesce(c.periodo_control, date_trunc('month', c.fecha)::date),
         c.proveedor, c.detalle, c.tipo, c.neto, c.iva, c.total, c.estado_pago,
         c.anexo_id
    from public.compras c
    left join public.categorias_costo cat on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id
   where not exists (select 1 from public.items_compra i where i.empresa_id = c.empresa_id and i.compra_id = c.id)
     and not exists (select 1 from public.factura_items fi where fi.empresa_id = c.empresa_id and fi.compra_id = c.id)
  union all
  select s.id, s.contrato_id, s.categoria_id,
         coalesce(cat.nombre, 'Servicios'), coalesce(cat.familia, 'servicios'),
         s.fecha, date_trunc('month', s.fecha)::date,
         s.contratista, s.detalle, s.tipo, s.neto, s.iva, s.total, s.estado_pago,
         s.anexo_id
    from public.servicios s
    left join public.categorias_costo cat on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id
  union all
  select p.id, p.contrato_id, p.categoria_id,
         coalesce(cat.nombre, 'Personal'), coalesce(cat.familia, 'personal'),
         p.periodo, p.periodo, p.faena, 'Remuneraciones y leyes sociales', 'ordinario',
         p.costo_total, 0::bigint, p.costo_total, 'pagada',
         p.anexo_id
    from public.costos_personal p
    left join public.categorias_costo cat on cat.empresa_id = p.empresa_id and cat.id = p.categoria_id;

-- ─── 5. El resultado, por anexo ─────────────────────────────────────────────
-- Mismas reglas que resumen_mensual: venta = EDP netos; costo = lo ordinario
-- (lo reembolsable se le cobra al mandante y va aparte). anexo_id nulo = base.

create or replace view public.resultado_por_anexo
with (security_invoker = true) as
with ventas as (
  select e.contrato_id, e.anexo_id, e.periodo,
         sum(e.monto_neto)::bigint as venta
    from public.estados_pago e
   group by e.contrato_id, e.anexo_id, e.periodo
),
costos as (
  select k.contrato_id, k.anexo_id, k.periodo,
         sum(k.neto) filter (where k.tipo = 'ordinario')::bigint as costo,
         sum(k.neto) filter (where k.tipo = 'reembolsable')::bigint as reembolsable
    from public.costos_unificados k
   group by k.contrato_id, k.anexo_id, k.periodo
)
select
  coalesce(v.contrato_id, k.contrato_id) as contrato_id,
  coalesce(v.anexo_id, k.anexo_id) as anexo_id,
  coalesce(v.periodo, k.periodo) as periodo,
  coalesce(v.venta, 0)::bigint as venta,
  coalesce(k.costo, 0)::bigint as costo,
  coalesce(k.reembolsable, 0)::bigint as reembolsable,
  (coalesce(v.venta, 0) - coalesce(k.costo, 0))::bigint as margen
from ventas v
full join costos k
  on k.contrato_id = v.contrato_id
 and k.anexo_id is not distinct from v.anexo_id
 and k.periodo = v.periodo;

comment on view public.resultado_por_anexo is
  'Venta, costo y margen por contrato, anexo (nulo = base) y mes. Mismas reglas que resumen_mensual.';

grant select on public.resultado_por_anexo to authenticated;

-- ─── 6. Las vistas de solicitudes y órdenes muestran su anexo ──────────────
-- Las dos listan sus columnas una por una: la nueva va al final.

create or replace view public.solped_resumen
with (security_invoker = true) as
  select
    s.id, s.numero, s.contrato_id, c.nombre as contrato, s.solicitante_nombre, s.solicitante_cargo,
    s.area, s.fecha_emision, s.fecha_requerida, s.tipo_gasto, s.prioridad, s.estado,
    count(i.id)::integer as items,
    coalesce(sum(i.cantidad), 0::numeric) as cantidad_pedida,
    coalesce(sum(ic.cantidad), 0::numeric) as cantidad_comprada,
    coalesce(sum(ic.cantidad_recibida), 0::numeric) as cantidad_recibida,
    coalesce(sum(ic.neto), 0::numeric)::bigint as comprado_neto,
    current_date - s.fecha_emision as dias_abierta,
    s.anexo_id
  from public.solped s
  join public.contratos c on c.id = s.contrato_id
  left join public.solped_items i on i.solped_id = s.id
  left join public.items_compra ic on ic.solped_item_id = i.id
  group by s.empresa_id, s.id, c.nombre;

create or replace view public.ordenes_proveedor_resumen
with (security_invoker = true) as
  select
    o.id, o.contrato_id, o.numero, o.proveedor, o.rut_proveedor, o.contacto, o.correo_contacto,
    o.fecha_emision, o.fecha_requerida, o.lugar_entrega, o.condiciones_pago, o.estado, o.observaciones,
    o.creado_en, o.actualizado_en, o.creado_por, o.actualizado_por, o.direccion_proveedor,
    o.ciudad_proveedor, o.comuna_proveedor, o.telefono_contacto, o.solicitado_por, o.retira,
    o.autorizado_por, o.proyecto, o.emisor_nombre, o.emisor_correo, o.emisor_telefono, o.solped_id,
    o.proveedor_id, o.fecha_comprometida, o.fecha_confirmacion, o.cotizacion_id,
    coalesce(count(a.id) filter (where a.vigente > 0), 0)::int as items,
    coalesce(count(a.id) filter (where a.vigente > 0 and a.recibida >= a.vigente), 0)::int as items_recibidos,
    coalesce(count(a.id) filter (where a.vigente > 0 and a.facturada_neta >= a.vigente), 0)::int as items_facturados,
    coalesce(sum(round(a.vigente * a.precio_unitario)), 0)::bigint as neto,
    coalesce(sum(round(a.vigente * a.precio_unitario)
      + case when a.cantidad > 0 then round(a.iva * a.vigente / a.cantidad) else 0 end), 0)::bigint as total,
    coalesce(sum(round(a.vigente * a.precio_unitario)) filter (where i.tipo = 'reembolsable'), 0)::bigint as reembolsable,
    coalesce(sum(round(a.facturada_neta * a.precio_unitario)), 0)::bigint as facturado,
    -- Nuevas (0051)
    coalesce(sum(round(least(a.recibida, a.vigente) * a.precio_unitario)), 0)::bigint as recibido,
    coalesce(sum(round(a.sin_recibir * a.precio_unitario)), 0)::bigint as sin_recibir,
    coalesce(sum(round(a.recibida_sin_facturar * a.precio_unitario)), 0)::bigint as recibido_sin_facturar,
    coalesce(sum(round(a.acreditada * a.precio_unitario)), 0)::bigint as acreditado,
    coalesce(sum(round(a.cerrada * a.precio_unitario)), 0)::bigint as cerrado,
    coalesce(sum(round(a.por_recibir * a.precio_unitario)), 0)::bigint as por_recibir,
    coalesce((
      select sum(c.neto) from public.compras c
       where c.empresa_id = o.empresa_id and c.orden_id = o.id and c.estado_pago = 'pagada'
    ), 0)::bigint as pagado,
    coalesce((
      select count(*) from public.compras c
       where c.empresa_id = o.empresa_id and c.orden_id = o.id and c.estado_pago <> 'anulada'
    ), 0)::int as facturas,
    -- Facturaron algo que no llegó y ya pasaron 5 días: hay que pedir la NC.
    exists (
      select 1 from public.compras c
       where c.empresa_id = o.empresa_id and c.orden_id = o.id
         and c.estado_pago not in ('pagada', 'anulada')
         and c.fecha_factura <= current_date - 5
         and exists (
           select 1 from public.factura_items fi
             join public.items_avance x on x.empresa_id = fi.empresa_id and x.id = fi.item_id
            where fi.empresa_id = c.empresa_id and fi.compra_id = c.id and x.sin_recibir > 0)
    ) as solicitar_nc,
    -- Nueva (0059): contra qué anexo se compró.
    o.anexo_id
  from public.ordenes_compra_proveedor o
  left join public.items_compra i on i.empresa_id = o.empresa_id and i.orden_id = o.id
  left join public.items_avance a on a.empresa_id = i.empresa_id and a.id = i.id
  group by o.empresa_id, o.id;

notify pgrst, 'reload schema';
