-- ============================================================================
-- 0053 — Compra directa (sin OC) con varias líneas
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0051.
--
-- POR QUÉ: una factura de ferretería trae diez líneas con categorías distintas
-- y alguna reembolsable. Hasta ahora una compra era UNA línea: había que crear
-- diez compras repitiendo proveedor, documento y fecha.
--
-- CÓMO: la compra (el documento) sigue en `compras`; sus líneas son
-- `items_compra` sin orden, unidas por `factura_items` igual que la factura de
-- una OC. Así el costo sale por línea —con su categoría y su marca de
-- reembolsable— y la compra deja de contarse entera (`costos_unificados` ya
-- excluye las compras con detalle desde la 0051).
--
-- AL CONTADO: sin OC no hay recepción que esperar. Las líneas nacen recibidas,
-- así la factura queda pagable de inmediato y nunca "retenida".
--
-- `p_lineas` = [{"descripcion","unidad","cantidad","precio_unitario","categoria_id","tipo"}, …]
-- Al editar se reemplazan las líneas: es una sola transacción, o todo o nada.
-- ============================================================================

create or replace function public.guardar_compra_directa(
  p_id text,
  p_contrato_id text,
  p_proveedor_id text,
  p_proveedor text,
  p_documento text,
  p_fecha date,
  p_periodo_control date,
  p_iva bigint,
  p_datos jsonb,
  p_lineas jsonb
)
returns text
language plpgsql
set search_path = public
as $$
declare
  existente record;
  neto_total bigint;
  primera record;
  cuantas int;
  empresa text := public.empresa_actual();
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
           datos = coalesce(p_datos, '{}'::jsonb)
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
      neto, iva, fecha, periodo_control, fecha_factura, estado_pago, datos
    ) values (
      p_id, p_contrato_id, nullif(p_proveedor_id, ''), btrim(p_proveedor), nullif(btrim(p_documento), ''),
      primera.descripcion || case when cuantas > 1 then format(' y %s líneas más', cuantas - 1) else '' end,
      primera.categoria_id, primera.tipo, neto_total, coalesce(p_iva, 0),
      p_fecha, p_periodo_control, p_fecha, 'pendiente', coalesce(p_datos, '{}'::jsonb)
    );
  end if;

  /* Las líneas: recibidas desde ya (al contado) y cubiertas enteras por esta
     compra. El IVA de cada una sigue a su categoría. */
  insert into public.items_compra (
    id, contrato_id, categoria_id, descripcion, cantidad, unidad, precio_unitario, iva, tipo,
    estado_recepcion, cantidad_recibida, fecha_recepcion
  )
  select
    format('IT-%s-%s', p_id, lpad(l.n::text, 3, '0')),
    p_contrato_id,
    nullif(l.categoria_id, ''),
    btrim(l.descripcion),
    l.cantidad,
    coalesce(nullif(btrim(l.unidad), ''), 'UN'),
    l.precio_unitario,
    case when coalesce(cat.afecta_iva, true) then round(l.cantidad * l.precio_unitario * 0.19) else 0 end,
    coalesce(nullif(l.tipo, ''), 'ordinario'),
    'recibido',
    l.cantidad,
    p_fecha
  from (
    select row_number() over () as n, x.*
      from jsonb_to_recordset(p_lineas) as x(
        descripcion text, unidad text, cantidad numeric, precio_unitario bigint, categoria_id text, tipo text)
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
$$;

/* Borrar la compra se lleva sus líneas sin OC. Sin esto quedarían sueltas y
   seguirían sumando costo: la línea existe aunque su documento ya no. Las de
   una OC no se tocan: son de la orden, y vuelven a quedar "por facturar". */
create or replace function public.borrar_lineas_de_compra_directa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.items_compra i
   where i.empresa_id = old.empresa_id and i.orden_id is null
     and exists (select 1 from public.factura_items fi
                  where fi.empresa_id = i.empresa_id and fi.item_id = i.id and fi.compra_id = old.id);
  return old;
end;
$$;

drop trigger if exists compras_borra_lineas_directas on public.compras;
create trigger compras_borra_lineas_directas
  before delete on public.compras
  for each row execute function public.borrar_lineas_de_compra_directa();

grant execute on function public.guardar_compra_directa(text, text, text, text, text, date, date, bigint, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
