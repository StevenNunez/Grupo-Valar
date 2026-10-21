-- ============================================================================
-- 0097 — Pagar una factura en cuotas (acuerdo de pago)
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0096.
--
-- Hasta hoy una factura se pagaba entera o no se pagaba: «Pagar» la marcaba
-- como pagada por su total. Las facturas grandes se acuerdan con el proveedor
-- en cuotas (p. ej. GRUAS MAVER: $38.318.000 en 15 M + 15 M + el saldo), y no
-- había cómo anotar una cuota sin dar la factura por pagada.
--
-- AHORA una factura puede tener un plan de cuotas (`pagos_factura`):
--
--   · cada cuota es un monto, una fecha en que se programa pagar y, cuando se
--     transfiere, la fecha de pago y la referencia;
--   · `compras.pagado` suma lo ya transferido. La factura sigue «pendiente»
--     por su saldo y pasa sola a «pagada» al completar el total (neto de NC);
--   · la semana de pago ve el monto de la PRÓXIMA cuota, no el saldo entero.
--
-- Una factura sin cuotas funciona igual que siempre. Quitar todas las cuotas de
-- una factura la devuelve a «pendiente» (ver el trigger).
--
-- Quien programa cuotas necesita `pagos.programar`; quien registra que una
-- cuota se transfirió, `pagos.marcar` (los mismos permisos de siempre).
-- ============================================================================

-- ─── 1. Cuánto de la factura ya se pagó ─────────────────────────────────────

alter table public.compras
  add column if not exists pagado bigint not null default 0 check (pagado >= 0);

comment on column public.compras.pagado is
  'Suma de las cuotas ya transferidas (pagos_factura). Una factura pagada de una vez, sin cuotas, queda en 0 y se lee por su estado.';

-- ─── 2. Las cuotas ──────────────────────────────────────────────────────────

create table if not exists public.pagos_factura (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  compra_id text not null,
  /* 1, 2, 3…: el orden del acuerdo. */
  numero smallint not null check (numero > 0),
  monto bigint not null check (monto > 0),
  /* En qué fecha de pago se piensa transferir. */
  fecha_programada date,
  /* Con fecha, la cuota está pagada. */
  fecha_pago date,
  /* N° de transferencia o comprobante. */
  referencia text,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  unique (empresa_id, compra_id, numero),
  foreign key (empresa_id, compra_id) references public.compras (empresa_id, id) on delete cascade
);

comment on table public.pagos_factura is
  'Las cuotas de pago de una factura de proveedor (acuerdo de pago). Cada cuota con fecha de pago es plata ya transferida.';

create index if not exists pagos_factura_compra_idx on public.pagos_factura (empresa_id, compra_id);

drop trigger if exists pagos_factura_actualizado on public.pagos_factura;
create trigger pagos_factura_actualizado before update on public.pagos_factura
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists pagos_factura_autoria on public.pagos_factura;
create trigger pagos_factura_autoria before insert or update on public.pagos_factura
  for each row execute function public.marcar_autoria();
drop trigger if exists pagos_factura_auditoria on public.pagos_factura;
create trigger pagos_factura_auditoria after insert or update or delete on public.pagos_factura
  for each row execute function public.registrar_auditoria();

-- Dar por transferida una cuota es lo mismo que «Pagar» una factura: pide el mismo permiso.
create or replace function public.pagos_factura_permiso()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.tiene_permiso('pagos.marcar') then
    if (tg_op = 'INSERT' and new.fecha_pago is not null)
       or (tg_op = 'UPDATE' and new.fecha_pago is distinct from old.fecha_pago) then
      raise exception 'Tu acceso no permite registrar pagos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pagos_factura_permiso on public.pagos_factura;
create trigger pagos_factura_permiso before insert or update on public.pagos_factura
  for each row execute function public.pagos_factura_permiso();

-- ─── 3. La factura sigue a sus cuotas ───────────────────────────────────────

create or replace function public.sincronizar_pago_de_compra(p_empresa text, p_compra text, p_borrado boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total bigint;
  v_estado text;
  v_n int;
  v_pagado bigint;
  v_ultimo date;
  v_proxima date;
begin
  select c.total - coalesce((select sum(n.neto + n.iva) from public.notas_credito n
                              where n.empresa_id = c.empresa_id and n.compra_id = c.id), 0),
         c.estado_pago
    into v_total, v_estado
    from public.compras c
   where c.empresa_id = p_empresa and c.id = p_compra;
  if not found then return; end if;

  select count(*),
         coalesce(sum(monto) filter (where fecha_pago is not null), 0),
         max(fecha_pago),
         min(fecha_programada) filter (where fecha_pago is null)
    into v_n, v_pagado, v_ultimo, v_proxima
    from public.pagos_factura
   where empresa_id = p_empresa and compra_id = p_compra;

  -- Sin cuotas: vuelve a lo de siempre. Si se acaban de quitar todas, la factura se reabre.
  if v_n = 0 then
    update public.compras
       set pagado = 0,
           estado_pago = case when p_borrado and estado_pago = 'pagada' then 'pendiente' else estado_pago end,
           fecha_pago = case when p_borrado and estado_pago = 'pagada' then null else fecha_pago end
     where empresa_id = p_empresa and id = p_compra;
    return;
  end if;

  -- Retenida o anulada: las cuotas se anotan, pero el estado lo decide quien la retuvo.
  if v_estado in ('retenida', 'anulada') then
    update public.compras set pagado = v_pagado where empresa_id = p_empresa and id = p_compra;
    return;
  end if;

  if v_total > 0 and v_pagado >= v_total then
    update public.compras
       set pagado = v_pagado, estado_pago = 'pagada', fecha_pago = v_ultimo
     where empresa_id = p_empresa and id = p_compra;
  else
    update public.compras
       set pagado = v_pagado,
           estado_pago = 'pendiente',
           fecha_pago = null,
           -- La semana de pago es la de la próxima cuota sin pagar.
           fecha_pago_programada = coalesce(v_proxima, fecha_pago_programada)
     where empresa_id = p_empresa and id = p_compra;
  end if;
end;
$$;

create or replace function public.pagos_factura_sincroniza()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.sincronizar_pago_de_compra(
    coalesce(new.empresa_id, old.empresa_id),
    coalesce(new.compra_id, old.compra_id),
    tg_op = 'DELETE');
  return null;
end;
$$;

drop trigger if exists pagos_factura_sincroniza on public.pagos_factura;
create trigger pagos_factura_sincroniza after insert or update or delete on public.pagos_factura
  for each row execute function public.pagos_factura_sincroniza();

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────

alter table public.pagos_factura enable row level security;

drop policy if exists "cuotas: lee" on public.pagos_factura;
create policy "cuotas: lee" on public.pagos_factura for select to authenticated
  using (public.ve_empresa(empresa_id) and public.tiene_permiso('pagos.ver'));

drop policy if exists "cuotas: programa" on public.pagos_factura;
create policy "cuotas: programa" on public.pagos_factura for insert to authenticated
  with check (empresa_id = public.empresa_actual()
              and (public.tiene_permiso('pagos.programar') or public.tiene_permiso('pagos.marcar')));

drop policy if exists "cuotas: modifica" on public.pagos_factura;
create policy "cuotas: modifica" on public.pagos_factura for update to authenticated
  using (empresa_id = public.empresa_actual()
         and (public.tiene_permiso('pagos.programar') or public.tiene_permiso('pagos.marcar')))
  with check (empresa_id = public.empresa_actual()
              and (public.tiene_permiso('pagos.programar') or public.tiene_permiso('pagos.marcar')));

drop policy if exists "cuotas: elimina" on public.pagos_factura;
create policy "cuotas: elimina" on public.pagos_factura for delete to authenticated
  using (empresa_id = public.empresa_actual()
         and (public.tiene_permiso('pagos.programar') or public.tiene_permiso('pagos.marcar')));

grant select, insert, update, delete on public.pagos_factura to authenticated;

-- ─── 5. Cuentas por pagar: lo pagado, el saldo y la próxima cuota ───────────
-- Las columnas nuevas van AL FINAL. `flujo_de_pagos` cuelga de esta vista:
-- se tira antes y se vuelve a crear abajo, ahora sumando saldos.

drop view if exists public.flujo_de_pagos;

create or replace view public.cuentas_por_pagar
with (security_invoker = true) as
with p as (
  select * from public.parametros_pago where id
),
nc as (
  select n.empresa_id, n.compra_id, sum(n.neto)::bigint as neto, sum(n.iva)::bigint as iva
    from public.notas_credito n
   group by n.empresa_id, n.compra_id
),
/* Cuánto de cada factura cobra cosas que no llegaron. Si una línea está en
   dos facturas, lo que falta se le carga a cada una hasta lo que cobró. */
retenido as (
  select fi.empresa_id, fi.compra_id,
         sum(round(least(fi.cantidad, a.sin_recibir) * a.precio_unitario))::bigint as sin_recibir
    from public.factura_items fi
    join public.items_avance a on a.empresa_id = fi.empresa_id and a.id = fi.item_id
   where a.sin_recibir > 0
   group by fi.empresa_id, fi.compra_id
),
/* La próxima cuota sin pagar de cada factura: la de fecha más cercana. */
proxima as (
  select distinct on (pf.empresa_id, pf.compra_id)
         pf.empresa_id, pf.compra_id, pf.monto, pf.numero
    from public.pagos_factura pf
   where pf.fecha_pago is null
   order by pf.empresa_id, pf.compra_id, pf.fecha_programada nulls last, pf.numero
),
cuotas as (
  select pf.empresa_id, pf.compra_id, count(*)::int as cuotas
    from public.pagos_factura pf
   group by pf.empresa_id, pf.compra_id
),
lineas as (
  select
    'F:' || c.id as id,
    'factura'::text as origen,
    c.id as compra_id,
    c.orden_id,
    o.numero as orden_numero,
    c.contrato_id,
    ct.nombre as contrato,
    coalesce(c.proveedor_id, o.proveedor_id) as proveedor_id,
    coalesce(pr.razon_social, c.proveedor) as proveedor,
    pr.rut,
    coalesce(pr.estado_cuenta, 'por_validar') as estado_cuenta,
    pr.banco,
    pr.numero_cuenta,
    c.detalle,
    c.documento,
    c.fecha_factura,
    c.fecha as periodo,
    c.neto - coalesce(nc.neto, 0) as neto,
    c.iva - coalesce(nc.iva, 0) as iva,
    c.total - coalesce(nc.neto, 0) - coalesce(nc.iva, 0) as total,
    coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p)) as plazo_dias,
    coalesce(c.fecha_vencimiento,
             c.fecha_factura + coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p))::integer) as vencimiento,
    c.fecha_pago_programada,
    c.fecha_pago,
    c.estado_pago,
    case when c.documento is null then greatest(current_date - c.fecha, 0) end as dias_sin_facturar,
    coalesce(r.sin_recibir, 0)::bigint as sin_recibir,
    coalesce(nc.neto, 0)::bigint as nota_credito,
    c.pagado::bigint as pagado,
    coalesce(cu.cuotas, 0)::int as cuotas,
    px.monto::bigint as cuota_monto,
    px.numero::int as cuota_numero
  from public.compras c
  join public.contratos ct on ct.empresa_id = c.empresa_id and ct.id = c.contrato_id
  left join public.ordenes_compra_proveedor o on o.empresa_id = c.empresa_id and o.id = c.orden_id
  left join public.proveedores pr on pr.empresa_id = c.empresa_id and pr.id = coalesce(c.proveedor_id, o.proveedor_id)
  left join nc on nc.empresa_id = c.empresa_id and nc.compra_id = c.id
  left join retenido r on r.empresa_id = c.empresa_id and r.compra_id = c.id
  left join proxima px on px.empresa_id = c.empresa_id and px.compra_id = c.id
  left join cuotas cu on cu.empresa_id = c.empresa_id and cu.compra_id = c.id
  where c.estado_pago <> 'pagada' or c.fecha_pago >= current_date - 60

  union all

  select
    'O:' || o.id,
    'orden'::text,
    null::text,
    o.id,
    o.numero,
    o.contrato_id,
    ct.nombre,
    o.proveedor_id,
    coalesce(pr.razon_social, o.proveedor),
    coalesce(pr.rut, o.rut_proveedor),
    coalesce(pr.estado_cuenta, 'por_validar'),
    pr.banco,
    pr.numero_cuenta,
    'Saldo sin facturar de la orden',
    null::text,
    null::date,
    o.fecha_emision,
    r.neto - r.facturado,
    0::bigint,
    r.neto - r.facturado,
    coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p)),
    null::date,
    null::date,
    null::date,
    'pendiente'::text,
    greatest(current_date - o.fecha_emision, 0),
    0::bigint,
    0::bigint,
    0::bigint,
    0::int,
    null::bigint,
    null::int
  from public.ordenes_compra_proveedor o
  join public.ordenes_proveedor_resumen r on r.id = o.id and r.contrato_id = o.contrato_id
  join public.contratos ct on ct.empresa_id = o.empresa_id and ct.id = o.contrato_id
  left join public.proveedores pr on pr.empresa_id = o.empresa_id and pr.id = o.proveedor_id
  where o.estado in ('emitida', 'parcial', 'recibida')
    and r.neto > r.facturado
)
select
  l.id, l.origen, l.compra_id, l.orden_id, l.orden_numero, l.contrato_id, l.contrato,
  l.proveedor_id, l.proveedor, l.rut, l.estado_cuenta, l.banco, l.numero_cuenta, l.detalle,
  l.documento, l.fecha_factura, l.periodo, l.neto, l.iva, l.total, l.plazo_dias, l.vencimiento,
  l.fecha_pago_programada, l.fecha_pago, l.estado_pago, l.dias_sin_facturar,
  (l.vencimiento - current_date) as dias_para_vencer,
  case
    when l.estado_pago = 'pagada'   then 'pagado'
    when l.estado_pago = 'retenida' then 'retenido'
    when l.estado_pago = 'anulada'  then 'anulado'
    when l.documento is null        then 'no_facturado'
    -- Cobra algo que no llegó: no se paga hasta que llegue o venga la NC.
    when l.sin_recibir > 0          then 'retenido'
    when l.vencimiento is null      then 'pendiente'
    when l.vencimiento < current_date then 'vencido'
    when l.vencimiento <= current_date + (select dias_alerta_vencimiento from p) then 'por_vencer'
    else 'pendiente'
  end as estado_documento,
  case
    when l.documento is not null then 'ok'
    when l.estado_pago = 'pagada' then 'pagado_sin_factura'
    when l.dias_sin_facturar > (select dias_maximos_sin_factura from p) then 'factura_atrasada'
    else 'falta_factura'
  end as alerta_documental,
  (l.documento is not null and l.estado_pago = 'pendiente' and l.sin_recibir = 0) as apto_para_pago,
  (date_trunc('week', l.fecha_pago_programada)::date) as semana_pago,
  l.sin_recibir,
  l.nota_credito,
  (l.sin_recibir > 0 and l.fecha_factura <= current_date - 5) as solicitar_nc,
  -- Nuevas (0097): cuotas
  l.pagado,
  /* Lo que falta pagar. Una factura pagada de una vez (sin cuotas) queda en 0. */
  case when l.estado_pago = 'pagada' then 0::bigint
       else greatest(l.total - l.pagado, 0)::bigint end as saldo,
  l.cuotas,
  l.cuota_monto,
  l.cuota_numero
from lineas l;

grant select on public.cuentas_por_pagar to authenticated;

-- ─── 6. Flujo de pagos: lo mismo por proveedor, ahora sobre saldos ──────────

create view public.flujo_de_pagos
with (security_invoker = true) as
  select
    coalesce(c.proveedor_id, 'SIN-MAESTRO:' || c.proveedor) as clave,
    c.proveedor_id,
    c.proveedor,
    c.rut,
    max(c.estado_cuenta) as estado_cuenta,
    max(c.banco) as banco,
    max(c.numero_cuenta) as numero_cuenta,
    count(*)::int as lineas,
    coalesce(sum(c.saldo) filter (
      where c.estado_documento not in ('pagado', 'anulado')
    ), 0)::bigint as pendiente_total,
    coalesce(sum(c.saldo) filter (where c.apto_para_pago), 0)::bigint as exigible,
    coalesce(sum(c.saldo) filter (
      where c.estado_documento = 'no_facturado'
    ), 0)::bigint as bloqueado,
    coalesce(sum(c.saldo) filter (where c.estado_documento = 'vencido'), 0)::bigint as vencido,
    coalesce(sum(c.saldo) filter (where c.estado_documento = 'por_vencer'), 0)::bigint as por_vencer,
    coalesce(sum(c.saldo) filter (where c.estado_documento = 'retenido'), 0)::bigint as retenido,
    coalesce(sum(coalesce(c.cuota_monto, c.saldo)) filter (
      where c.fecha_pago_programada is not null and c.estado_pago = 'pendiente'
    ), 0)::bigint as programado,
    min(c.vencimiento) filter (where c.apto_para_pago) as vence_primero
  from public.cuentas_por_pagar c
  group by 1, 2, 3, 4;

comment on view public.flujo_de_pagos is
  'Cuánto se le debe a cada proveedor (saldo, ya descontado lo pagado en cuotas), separando lo exigible de lo bloqueado. Es la hoja «Flujo de Pagos» de la planilla.';

grant select on public.flujo_de_pagos to authenticated;

notify pgrst, 'reload schema';
