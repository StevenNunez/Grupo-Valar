-- ============================================================================
-- 0068 — Reembolsos de gastos (rendiciones)
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Va después de la 0067. Idempotente.
--
-- Pedido del 08-10-2026: alguien compra algo para el contrato con su propia
-- plata (una chapa, viajes en taxi) y pide que se le devuelva. Ese gasto es
-- costo del contrato igual que una compra, pero:
--
--   · viene de una RENDICIÓN: hay que saber que los datos salen de ahí y
--     quién la rindió, que es a quien se le paga;
--   · trae varios documentos —boletas, facturas— de comercios distintos;
--   · se registra a veces ya devuelta.
--
-- Se guarda como una compra más (así suma al costo, al Dashboard, al
-- resultado por anexo y a Pagos sin tocar nada de eso), con:
--
--   compras.origen = 'reembolso' y compras.rendido_por = quién pagó. El
--   "proveedor" de la compra es esa persona: es a quien se le devuelve, y así
--   aparece en Pagos. estado_pago 'pagada' = ya devuelto.
--
--   Cada línea es un documento de la rendición: tipo (boleta / factura /
--   sin documento), N°, comercio y fecha.
--
-- El IVA: con FACTURA se recupera, así que el costo es el neto. Con BOLETA no
-- se recupera: el costo es todo lo pagado y la línea va sin IVA. Por eso las
-- líneas aceptan "afecto": false aunque su categoría lleve IVA.
--
-- No confundir con tipo = 'reembolsable', que es lo que se le cobra al
-- MANDANTE. Una rendición puede traer líneas de los dos tipos.
-- ============================================================================

-- ─── 1. La compra sabe si viene de una rendición ────────────────────────────

alter table public.compras
  add column if not exists origen text not null default 'proveedor',
  add column if not exists rendido_por text;

alter table public.compras drop constraint if exists compras_origen_check;
alter table public.compras add constraint compras_origen_check
  check (origen in ('proveedor', 'reembolso'));
alter table public.compras drop constraint if exists compras_reembolso_con_persona;
alter table public.compras add constraint compras_reembolso_con_persona
  check (origen <> 'reembolso' or btrim(coalesce(rendido_por, '')) <> '');

comment on column public.compras.origen is
  'proveedor: compra a un tercero. reembolso: gasto que pagó alguien de su bolsillo y se le devuelve (rendición).';
comment on column public.compras.rendido_por is
  'En un reembolso, quién pagó y a quién se le devuelve.';

-- ─── 2. Cada línea de una rendición es un documento ─────────────────────────

alter table public.items_compra
  add column if not exists tipo_documento text,
  add column if not exists documento text,
  add column if not exists comercio text,
  add column if not exists fecha_documento date;

alter table public.items_compra drop constraint if exists items_compra_tipo_documento_check;
alter table public.items_compra add constraint items_compra_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('boleta', 'factura', 'otro'));

comment on column public.items_compra.tipo_documento is
  'En una rendición: boleta (sin IVA recuperable, el costo es lo pagado), factura (costo neto) u otro comprobante.';

-- ─── 3. La función que guarda la compra, con lo de la rendición ─────────────
-- Mismos parámetros que la 0053 y cuatro más con valor por defecto: las
-- llamadas que ya existen siguen funcionando igual.

drop function if exists public.guardar_compra_directa(text, text, text, text, text, date, date, bigint, jsonb, jsonb);

create or replace function public.guardar_compra_directa(
  p_id text, p_contrato_id text, p_proveedor_id text, p_proveedor text, p_documento text,
  p_fecha date, p_periodo_control date, p_iva bigint, p_datos jsonb, p_lineas jsonb,
  p_origen text default 'proveedor', p_rendido_por text default null,
  p_estado_pago text default null, p_fecha_pago date default null)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  existente record;
  neto_total bigint;
  primera record;
  cuantas int;
  empresa text := public.empresa_actual();
  v_origen text := coalesce(nullif(p_origen, ''), 'proveedor');
begin
  select count(*) into cuantas
    from jsonb_to_recordset(p_lineas) as x(descripcion text, cantidad numeric, precio_unitario bigint)
   where btrim(coalesce(x.descripcion, '')) <> '';
  if cuantas = 0 then
    raise exception 'La compra necesita al menos una línea con descripción.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lineas) as x(descripcion text, cantidad numeric, precio_unitario bigint)
              where btrim(coalesce(x.descripcion, '')) <> '' and (coalesce(x.cantidad, 0) <= 0 or coalesce(x.precio_unitario, 0) < 0)) then
    raise exception 'Cada línea necesita una cantidad mayor que cero y un precio que no sea negativo.' using errcode = 'check_violation';
  end if;
  if p_estado_pago is not null and p_estado_pago not in ('pendiente', 'pagada') then
    raise exception 'Estado de pago no válido: %', p_estado_pago using errcode = 'check_violation';
  end if;

  select coalesce(sum(round(x.cantidad * x.precio_unitario)), 0)::bigint into neto_total
    from jsonb_to_recordset(p_lineas) as x(descripcion text, cantidad numeric, precio_unitario bigint)
   where btrim(coalesce(x.descripcion, '')) <> '';

  -- La categoría y el tipo del documento son los de la primera línea, como en la factura de OC.
  select x.descripcion, nullif(x.categoria_id, '') as categoria_id, coalesce(nullif(x.tipo, ''), 'ordinario') as tipo
    into primera
    from jsonb_to_recordset(p_lineas) as x(descripcion text, categoria_id text, tipo text)
   where btrim(coalesce(x.descripcion, '')) <> ''
   limit 1;

  select * into existente from public.compras where empresa_id = empresa and id = p_id;

  if found then
    if existente.orden_id is not null then
      raise exception 'Esta factura viene de una orden de compra: se edita desde el ciclo de la orden.'
        using errcode = 'check_violation';
    end if;

    update public.compras
       set contrato_id = p_contrato_id,
           proveedor_id = nullif(p_proveedor_id, ''),
           proveedor = btrim(p_proveedor),
           documento = nullif(btrim(p_documento), ''),
           detalle = primera.descripcion || case when cuantas > 1 then format(' y %s líneas más', cuantas - 1) else '' end,
           categoria_id = primera.categoria_id,
           tipo = primera.tipo,
           neto = neto_total,
           iva = coalesce(p_iva, 0),
           fecha = p_fecha,
           periodo_control = p_periodo_control,
           datos = coalesce(p_datos, '{}'::jsonb),
           origen = v_origen,
           rendido_por = nullif(btrim(coalesce(p_rendido_por, '')), ''),
           estado_pago = coalesce(p_estado_pago, estado_pago),
           fecha_pago = case when p_estado_pago is null then fecha_pago
                             when p_estado_pago = 'pagada' then coalesce(p_fecha_pago, fecha_pago, current_date)
                             else null end
     where empresa_id = empresa and id = p_id;

    -- Las líneas anteriores de esta compra (sin orden) se reemplazan.
    delete from public.items_compra i
     where i.empresa_id = empresa and i.orden_id is null
       and (i.compra_id = p_id
            or exists (select 1 from public.factura_items fi
                        where fi.empresa_id = i.empresa_id and fi.item_id = i.id and fi.compra_id = p_id));
  else
    insert into public.compras (
      id, contrato_id, proveedor_id, proveedor, documento, detalle, categoria_id, tipo,
      neto, iva, fecha, periodo_control, fecha_factura, estado_pago, fecha_pago, datos, origen, rendido_por
    ) values (
      p_id, p_contrato_id, nullif(p_proveedor_id, ''), btrim(p_proveedor), nullif(btrim(p_documento), ''),
      primera.descripcion || case when cuantas > 1 then format(' y %s líneas más', cuantas - 1) else '' end,
      primera.categoria_id, primera.tipo, neto_total, coalesce(p_iva, 0),
      p_fecha, p_periodo_control, p_fecha, coalesce(p_estado_pago, 'pendiente'),
      case when p_estado_pago = 'pagada' then coalesce(p_fecha_pago, current_date) end,
      coalesce(p_datos, '{}'::jsonb), v_origen, nullif(btrim(coalesce(p_rendido_por, '')), '')
    );
  end if;

  /* Las líneas: recibidas desde ya (al contado) y cubiertas enteras por esta
     compra. El IVA de cada una sigue a su categoría, salvo que la línea diga
     que no es afecta (una boleta de una rendición). */
  insert into public.items_compra (
    id, contrato_id, categoria_id, descripcion, cantidad, unidad, precio_unitario, iva, tipo,
    estado_recepcion, cantidad_recibida, fecha_recepcion,
    tipo_documento, documento, comercio, fecha_documento
  )
  select
    format('IT-%s-%s', p_id, lpad(l.n::text, 3, '0')),
    p_contrato_id,
    nullif(l.categoria_id, ''),
    btrim(l.descripcion),
    l.cantidad,
    coalesce(nullif(btrim(l.unidad), ''), 'UN'),
    l.precio_unitario,
    case when l.afecto is false then 0
         when coalesce(cat.afecta_iva, true) then round(l.cantidad * l.precio_unitario * 0.19)
         else 0 end,
    coalesce(nullif(l.tipo, ''), 'ordinario'),
    'recibido',
    l.cantidad,
    coalesce(l.fecha_documento, p_fecha),
    nullif(l.tipo_documento, ''),
    nullif(btrim(coalesce(l.documento, '')), ''),
    nullif(btrim(coalesce(l.comercio, '')), ''),
    l.fecha_documento
  from (
    select row_number() over () as n, x.*
      from jsonb_to_recordset(p_lineas) as x(
        descripcion text, unidad text, cantidad numeric, precio_unitario bigint, categoria_id text, tipo text,
        afecto boolean, tipo_documento text, documento text, comercio text, fecha_documento date)
     where btrim(coalesce(x.descripcion, '')) <> ''
  ) l
  left join public.categorias_costo cat on cat.empresa_id = empresa and cat.id = nullif(l.categoria_id, '');

  -- En una sentencia aparte: las partes de un WITH no se ven entre sí, y el
  -- trigger que copia el contrato necesita encontrar la línea ya creada.
  insert into public.factura_items (compra_id, item_id, contrato_id, cantidad)
  select p_id, i.id, '', i.cantidad
    from public.items_compra i
   where i.empresa_id = empresa and i.id like format('IT-%s-%%', p_id) and i.orden_id is null;

  return p_id;
end;
$function$;

grant execute on function public.guardar_compra_directa(text, text, text, text, text, date, date, bigint, jsonb, jsonb, text, text, text, date)
  to authenticated;

-- ─── 4. La lista de egresos dice quién rindió ───────────────────────────────
-- Columnas nuevas al final: create or replace no admite otras.

create or replace view public.egresos_terceros
with (security_invoker = true) as
select c.id,
       'compra'::text as origen,
       c.contrato_id,
       c.categoria_id,
       coalesce(cat.nombre, 'Sin categoría'::text) as categoria,
       c.proveedor as tercero,
       c.documento,
       c.detalle,
       c.tipo,
       null::text as clase,
       false as recurrente,
       null::text as periodicidad,
       c.fecha,
       null::date as desde,
       null::date as hasta,
       c.neto,
       c.iva,
       c.total,
       c.estado_pago,
       c.creado_en,
       coalesce(c.periodo_control, date_trunc('month', c.fecha::timestamptz)::date) as periodo,
       c.rendido_por,
       c.fecha_pago
  from public.compras c
  left join public.categorias_costo cat on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id
union all
select s.id,
       'servicio'::text as origen,
       s.contrato_id,
       s.categoria_id,
       coalesce(cat.nombre, 'Sin categoría'::text) as categoria,
       s.contratista as tercero,
       s.documento,
       s.detalle,
       s.tipo,
       s.tipo_servicio as clase,
       s.recurrente,
       s.periodicidad,
       s.fecha,
       s.desde,
       s.hasta,
       s.neto,
       s.iva,
       s.total,
       s.estado_pago,
       s.creado_en,
       date_trunc('month', s.fecha::timestamptz)::date as periodo,
       null::text as rendido_por,
       null::date as fecha_pago
  from public.servicios s
  left join public.categorias_costo cat on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id;

notify pgrst, 'reload schema';
