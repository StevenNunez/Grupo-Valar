-- ============================================================================
-- 0122 — Oficina Central también compra por Abastecimiento
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0121.
--
-- EL PROBLEMA (16-11-2026): no se podía hacer una solicitud de compra para
-- Oficina Central. Toda la cadena —solicitud, cotización, orden, recepción,
-- factura y pago— cuelga de un contrato, y Oficina Central no es un contrato:
-- sus egresos se cargaban a mano en su pantalla, sin solicitud ni orden.
--
-- LA REGLA (decidida por el usuario): una compra de Oficina Central sigue el
-- flujo completo, igual que la de un contrato, y el gasto cae solo en Oficina
-- Central al emitir la orden. La solicitud entera va a UN centro de costo
-- (General, Pagnol, Tokio…: un egreso nunca se reparte) y cada ítem lleva su
-- categoría de oficina (compras, insumos, mantenciones…).
--
-- CÓMO: Oficina Central entra a Abastecimiento como un centro de costo interno,
-- con el id fijo `OFICINA` en `contratos`. Así la cadena entera —llaves,
-- permisos por contrato, correlativos, Pagnol— funciona sin tocarla. Lo que SÍ
-- cambia:
--
--   1. La fila `OFICINA` por empresa (y sola para las empresas nuevas).
--   2. `centro_costo` en la solicitud y en la orden; `categoria_oficina` en sus
--      ítems. Solo valen para `OFICINA`.
--   3. `costos_unificados` deja fuera a `OFICINA`: no es un contrato, y no debe
--      aparecer en el Dashboard, en Egresos ni en el resumen de contratos.
--   4. `egresos_oficina_de_ordenes()`: las líneas de sus órdenes, con la misma
--      regla de costo de siempre (orden emitida, cantidad vigente, mes de la
--      orden), para sumarlas a los egresos de Oficina Central.
--
-- Control de Gestión no ofrece `OFICINA` en ningún selector de contrato: eso lo
-- decide la aplicación, que la reconoce por su id.
-- ============================================================================

-- ─── 1. Oficina Central como centro de costo de Abastecimiento ──────────────

create or replace function public.sembrar_contrato_oficina(empresa text)
returns void language sql security definer set search_path = '' as $$
  insert into public.contratos (empresa_id, id, nombre, nombre_corto, cliente, faena, estado, termino)
  values (empresa, 'OFICINA', 'Oficina Central', 'Oficina Central', 'Interno', 'Oficina Central', 'activo', date '2099-12-31')
  on conflict (empresa_id, id) do nothing;
$$;

revoke all on function public.sembrar_contrato_oficina(text) from public, anon, authenticated;

select public.sembrar_contrato_oficina(id) from public.empresas;

create or replace function public.sembrar_contrato_oficina_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sembrar_contrato_oficina(new.id);
  return new;
end;
$$;

drop trigger if exists empresas_siembra_contrato_oficina on public.empresas;
create trigger empresas_siembra_contrato_oficina
  after insert on public.empresas
  for each row execute function public.sembrar_contrato_oficina_trigger();

-- ─── 2. Centro de costo por solicitud y orden; categoría de oficina por ítem ─

alter table public.solped add column if not exists centro_costo text;
alter table public.ordenes_compra_proveedor add column if not exists centro_costo text;
alter table public.solped_items add column if not exists categoria_oficina text;
alter table public.items_compra add column if not exists categoria_oficina text;

comment on column public.solped.centro_costo is
  'Solo en solicitudes de Oficina Central (contrato OFICINA): el centro de costo al que va toda la solicitud (0122).';
comment on column public.ordenes_compra_proveedor.centro_costo is
  'Solo en órdenes de Oficina Central (contrato OFICINA): el centro de costo al que va toda la orden (0122).';
comment on column public.solped_items.categoria_oficina is
  'Solo en solicitudes de Oficina Central: la categoría de oficina del ítem (0122). La de contrato va en categoria_id.';
comment on column public.items_compra.categoria_oficina is
  'Solo en órdenes de Oficina Central: la categoría de oficina de la línea (0122). La de contrato va en categoria_id.';

alter table public.solped drop constraint if exists solped_centro_costo_fk;
alter table public.solped
  add constraint solped_centro_costo_fk
  foreign key (empresa_id, centro_costo) references public.centros_costo_oficina (empresa_id, id);

alter table public.ordenes_compra_proveedor drop constraint if exists ordenes_compra_proveedor_centro_costo_fk;
alter table public.ordenes_compra_proveedor
  add constraint ordenes_compra_proveedor_centro_costo_fk
  foreign key (empresa_id, centro_costo) references public.centros_costo_oficina (empresa_id, id);

alter table public.solped_items drop constraint if exists solped_items_categoria_oficina_fk;
alter table public.solped_items
  add constraint solped_items_categoria_oficina_fk
  foreign key (empresa_id, categoria_oficina) references public.categorias_oficina (empresa_id, id);

alter table public.items_compra drop constraint if exists items_compra_categoria_oficina_fk;
alter table public.items_compra
  add constraint items_compra_categoria_oficina_fk
  foreign key (empresa_id, categoria_oficina) references public.categorias_oficina (empresa_id, id);

-- El centro de costo es de Oficina Central: un contrato no lo lleva.
alter table public.solped drop constraint if exists solped_centro_solo_oficina;
alter table public.solped
  add constraint solped_centro_solo_oficina check (centro_costo is null or contrato_id = 'OFICINA');

alter table public.ordenes_compra_proveedor drop constraint if exists ordenes_compra_proveedor_centro_solo_oficina;
alter table public.ordenes_compra_proveedor
  add constraint ordenes_compra_proveedor_centro_solo_oficina check (centro_costo is null or contrato_id = 'OFICINA');

alter table public.items_compra drop constraint if exists items_compra_categoria_oficina_solo_oficina;
alter table public.items_compra
  add constraint items_compra_categoria_oficina_solo_oficina check (categoria_oficina is null or contrato_id = 'OFICINA');

create index if not exists items_compra_oficina_idx
  on public.items_compra (empresa_id, orden_id) where contrato_id = 'OFICINA';

-- ─── 3. costos_unificados: Oficina Central no es un contrato ────────────────
-- La misma vista de la 0099, con una sola diferencia: las líneas de órdenes y
-- las compras de `OFICINA` quedan fuera. Mismas columnas y tipos.

create or replace view public.costos_unificados
with (security_invoker = true) as
SELECT d.id,
    d.contrato_id,
    d.categoria_id,
    d.categoria,
    d.familia,
    d.fecha,
    d.periodo,
    COALESCE(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor'::text) AS tercero,
    d.descripcion AS detalle,
    CASE WHEN d.tipo = 'activo' THEN 'ordinario'::text ELSE d.tipo END AS tipo,
    d.neto,
    d.iva,
    d.total,
    COALESCE(d.estado_pago, 'pendiente'::text) AS estado_pago,
    d.anexo_id,
    (d.tipo = 'activo') AS es_activo
   FROM items_detalle d
  WHERE (d.orden_id IS NOT NULL OR d.compra_id IS NOT NULL OR d.factura_numero IS NOT NULL)
    AND NOT EXISTS ( SELECT 1
           FROM ordenes_compra_proveedor oc
          WHERE oc.id = d.orden_id AND oc.estado IN ('borrador', 'anulada'))
    AND d.contrato_id <> 'OFICINA'
UNION ALL
 SELECT c.id,
    c.contrato_id,
    c.categoria_id,
    COALESCE(cat.nombre, 'Sin categoría'::text) AS categoria,
    COALESCE(cat.familia, 'compras'::text) AS familia,
    c.fecha,
    COALESCE(c.periodo_control, date_trunc('month'::text, c.fecha::timestamp with time zone)::date) AS periodo,
    c.proveedor AS tercero,
    c.detalle,
    CASE WHEN c.tipo = 'activo' THEN 'ordinario'::text ELSE c.tipo END AS tipo,
    c.neto,
    c.iva,
    c.total,
    c.estado_pago,
    c.anexo_id,
    (c.tipo = 'activo') AS es_activo
   FROM compras c
     LEFT JOIN categorias_costo cat ON cat.empresa_id = c.empresa_id AND cat.id = c.categoria_id
  WHERE c.estado_pago <> 'anulada'::text
    AND c.contrato_id <> 'OFICINA'
    AND NOT (EXISTS ( SELECT 1
           FROM items_compra i
          WHERE i.empresa_id = c.empresa_id AND i.compra_id = c.id)) AND NOT (EXISTS ( SELECT 1
           FROM factura_items fi
          WHERE fi.empresa_id = c.empresa_id AND fi.compra_id = c.id))
UNION ALL
 SELECT s.id,
    s.contrato_id,
    s.categoria_id,
    COALESCE(cat.nombre, 'Servicios'::text) AS categoria,
    COALESCE(cat.familia, 'servicios'::text) AS familia,
    s.fecha,
    date_trunc('month'::text, s.fecha::timestamp with time zone)::date AS periodo,
    s.contratista AS tercero,
    s.detalle,
    CASE WHEN s.tipo = 'activo' THEN 'ordinario'::text ELSE s.tipo END AS tipo,
    s.neto,
    s.iva,
    s.total,
    s.estado_pago,
    s.anexo_id,
    (s.tipo = 'activo') AS es_activo
   FROM servicios s
     LEFT JOIN categorias_costo cat ON cat.empresa_id = s.empresa_id AND cat.id = s.categoria_id
  WHERE s.estado_pago <> 'anulada'::text
UNION ALL
 SELECT p.id,
    p.contrato_id,
    p.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    p.periodo AS fecha,
    p.periodo,
    p.faena AS tercero,
    'Remuneraciones y leyes sociales'::text AS detalle,
    'ordinario'::text AS tipo,
    p.costo_total AS neto,
    0::bigint AS iva,
    p.costo_total AS total,
    'pagada'::text AS estado_pago,
    p.anexo_id,
    false AS es_activo
   FROM costos_personal p
     LEFT JOIN categorias_costo cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id;

grant select on public.costos_unificados to authenticated;

-- ─── 4. Las órdenes de Oficina Central, como egresos de Oficina Central ─────
-- La misma regla de costo que un contrato (0080, 0085): cuenta la orden emitida
-- —ni borrador ni anulada—, por la cantidad vigente de cada línea, en el mes de
-- la orden (o el que se le fijó a la línea). «Pagado» = toda facturada y pagada.
--
-- Es una función y no una vista porque se ve con el permiso de Oficina Central
-- (`oficina_central.ver`), como sus egresos, y no con el acceso por contrato.

create or replace function public.egresos_oficina_de_ordenes()
returns table (
  id text,
  orden_id text,
  orden_numero text,
  categoria text,
  centro_costo text,
  fecha date,
  proveedor text,
  descripcion text,
  neto bigint,
  iva bigint,
  estado text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    o.id,
    o.numero,
    coalesce(i.categoria_oficina, 'compras'),
    coalesce(o.centro_costo, 'general'),
    coalesce(date_trunc('month', i.periodo_control)::date, o.fecha_emision),
    o.proveedor,
    i.descripcion,
    round(a.vigente * i.precio_unitario)::bigint,
    case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end,
    case when a.facturada_neta >= a.vigente and fac.pagada then 'pagado' else 'pendiente' end
  from public.items_compra i
  join public.ordenes_compra_proveedor o on o.empresa_id = i.empresa_id and o.id = i.orden_id
  join public.items_avance a on a.empresa_id = i.empresa_id and a.id = i.id
  left join lateral (
    select bool_and(c.estado_pago = 'pagada') as pagada
      from public.factura_items fi
      join public.compras c on c.empresa_id = fi.empresa_id and c.id = fi.compra_id
     where fi.empresa_id = i.empresa_id and fi.item_id = i.id
  ) fac on true
  where i.empresa_id = public.empresa_actual()
    and i.contrato_id = 'OFICINA'
    and o.estado not in ('borrador', 'anulada')
    and a.vigente > 0
    and public.tiene_permiso('oficina_central.ver');
$$;

comment on function public.egresos_oficina_de_ordenes() is
  'Las líneas de las órdenes de compra de Oficina Central (contrato OFICINA), como egresos de Oficina Central. Misma regla de costo que un contrato.';

revoke all on function public.egresos_oficina_de_ordenes() from public, anon;
grant execute on function public.egresos_oficina_de_ordenes() to authenticated;

notify pgrst, 'reload schema';
