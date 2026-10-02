-- ============================================================================
-- Plataforma Valar — Cuentas por pagar y flujo de pago a proveedores
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0025.
--
-- DE DÓNDE SALE: de la planilla «Pago Proveedores 13-08.xlsx», que es la rutina
-- que Valar ya corre cada semana a mano. Está leída entera, no interpretada:
-- sus parámetros, sus estados y su regla dura son los que quedan acá.
--
--   Parámetros:  plazo de pago 30 días corridos desde la FECHA DE FACTURA ·
--                tope de pago semanal $20.000.000 · alerta "por vencer" a 7
--                días · una OC sin factura pasa a reclamo a los 15 días.
--
--   Estados:     NO FACTURADO (no se paga, no tiene vencimiento) · PENDIENTE ·
--                POR VENCER · VENCIDO · PAGADO · RETENIDO · ANULADO.
--
--   Regla dura:  «ninguna cuenta se paga sin factura registrada». Por eso la
--                planilla separa PENDIENTE TOTAL en dos columnas, EXIGIBLE
--                (con factura) y BLOQUEADO (sin factura), y por eso acá
--                `apto_para_pago` es una columna calculada y no una casilla
--                que alguien pueda marcar.
--
-- LA FECHA DE LA FACTURA ES UNA COLUMNA NUEVA. `compras.fecha` dejó de ser la
-- fecha del documento en la 0024: hoy es el mes contable en su día 1, porque
-- Control de Gestión trabaja por mes. Calcular el vencimiento sobre esa fecha
-- daría un vencimiento por mes, no por factura. Son dos cosas distintas y
-- necesitan dos columnas.
--
-- EL TOPE SEMANAL NO ES UNA RESTRICCIÓN. Es un control: la pantalla avisa
-- cuando la semana se pasa de $20 M, y aun así deja programar. Una semana con
-- una factura grande y vencida se paga igual; lo que no puede pasar es que se
-- pase sin que nadie lo note.
-- ============================================================================

-- ─── 1. Los parámetros del flujo, como datos ────────────────────────────────
-- Son números de negocio, no constantes de código: el plazo puede cambiar y el
-- tope semanal cambia con la caja. Una sola fila, forzada por la clave.

create table if not exists public.parametros_pago (
  id boolean primary key default true check (id),
  plazo_pago_dias smallint not null default 30 check (plazo_pago_dias > 0),
  tope_semanal bigint not null default 20000000 check (tope_semanal >= 0),
  dias_alerta_vencimiento smallint not null default 7
    check (dias_alerta_vencimiento >= 0),
  dias_maximos_sin_factura smallint not null default 15
    check (dias_maximos_sin_factura >= 0),
  dia_pago_semanal smallint not null default 4
    check (dia_pago_semanal between 1 and 7),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);

comment on table public.parametros_pago is
  'Una sola fila con los parámetros del flujo de pago. Salen de la hoja «Parámetros» de la planilla de Valar.';
comment on column public.parametros_pago.plazo_pago_dias is
  'Días corridos desde la fecha de la factura. Se usa cuando el proveedor no tiene plazo propio.';
comment on column public.parametros_pago.tope_semanal is
  'Máximo a desembolsar en una semana. Es un aviso, no un impedimento.';
comment on column public.parametros_pago.dias_maximos_sin_factura is
  'Una OC emitida hace más días que esto y todavía sin factura se reclama al proveedor.';
comment on column public.parametros_pago.dia_pago_semanal is
  'Día en que se transfiere: 1 = lunes … 7 = domingo. En Valar es el jueves, y por eso los cuadros de pago se llaman «06 AGO», «13 AGO», «20 AGO».';

insert into public.parametros_pago (id) values (true)
on conflict (id) do nothing;

-- ─── 2. La factura del proveedor: fecha propia y programación de pago ───────

alter table public.compras
  add column if not exists fecha_factura date;

comment on column public.compras.fecha_factura is
  'La fecha que trae impresa la factura. De acá cuelga el vencimiento; `fecha` es el mes contable.';

comment on column public.compras.documento is
  'N° de la factura del proveedor. Mientras esté vacío, la línea NO es pagable.';

alter table public.compras
  add column if not exists fecha_pago_programada date;

comment on column public.compras.fecha_pago_programada is
  'En qué fecha de pago semanal quedó agendada. Nula = todavía no entra a ninguna semana.';

comment on column public.compras.fecha_vencimiento is
  'Vencimiento pactado, cuando no es el plazo de siempre. Vacío = fecha de la factura + el plazo del proveedor.';

/* Las facturas que ya están cargadas: si nadie escribió la fecha del documento,
   la mejor que hay es la del mes contable. No se inventa nada —queda a la
   vista y se corrige desde la ficha— pero evita que el vencimiento nazca nulo. */
update public.compras
set fecha_factura = fecha
where fecha_factura is null and documento is not null;

/* Dos estados que la planilla usa y la tabla no tenía. RETENIDA es la factura
   que existe pero no se paga por una razón (una diferencia, un respaldo que
   falta); ANULADA es la que se dejó sin efecto. Ninguna de las dos es
   "pendiente": mezclarlas infla lo que hay que pagar. */
alter table public.compras drop constraint if exists compras_estado_pago_check;
alter table public.compras add constraint compras_estado_pago_check
  check (estado_pago in ('pendiente', 'pagada', 'retenida', 'anulada'));

-- ─── 3. El proveedor: si se le puede transferir hoy ─────────────────────────
-- Distinto de `estado`, que dice si se le compra. Una cuenta sin validar no
-- frena la compra, frena la transferencia, y son dos conversaciones distintas.

alter table public.proveedores
  add column if not exists estado_cuenta text not null default 'por_validar'
    check (estado_cuenta in ('creada', 'nueva_cuenta', 'por_validar'));

comment on column public.proveedores.estado_cuenta is
  'creada = dado de alta en el banco, se le puede transferir. nueva_cuenta = falta crearla. por_validar = datos bancarios sin confirmar.';

-- Con cuenta cargada, el estado que corresponde es "creada" salvo que alguien
-- diga lo contrario. Sin número de cuenta no hay nada que validar todavía.
update public.proveedores
set estado_cuenta = 'creada'
where estado_cuenta = 'por_validar'
  and numero_cuenta is not null
  and btrim(numero_cuenta) <> '';

-- ─── 4. La OC apunta al maestro ─────────────────────────────────────────────
-- Sin esto, "Morosmin", "MOROSMIN SPA" y "Morosmin Spa" son tres proveedores al
-- juntar lo que se le debe a cada uno. Es el problema que la planilla resuelve
-- con una columna de alias.

alter table public.ordenes_compra_proveedor
  add column if not exists proveedor_id text
    references public.proveedores (id) on delete set null;

comment on column public.ordenes_compra_proveedor.proveedor_id is
  'A quién se le emitió, del maestro. El texto `proveedor` es lo que salió impreso en la orden.';

create index if not exists ocp_proveedor_idx
  on public.ordenes_compra_proveedor (proveedor_id);

update public.ordenes_compra_proveedor o
set proveedor_id = p.id
from public.proveedores p
where o.proveedor_id is null
  and lower(btrim(o.proveedor)) = lower(btrim(p.razon_social));

/* La vista se rehace porque expande `o.*` al crearse: sin esto, la columna
   nueva existe en la tabla pero la aplicación no la ve, y el formulario de la
   orden no puede saber a qué proveedor del maestro apunta.

   Las dos vistas del final cuelgan de esta, así que se tiran ANTES y se vuelven
   a crear más abajo. Solo hace falta al correr la migración por segunda vez: la
   primera todavía no existen. Sin esto Postgres corta con «cannot drop view
   ordenes_proveedor_resumen because other objects depend on it», que es
   exactamente lo que pasa al reaplicar. */
drop view if exists public.flujo_de_pagos;
drop view if exists public.cuentas_por_pagar;

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

comment on view public.ordenes_proveedor_resumen is
  'La orden con sus totales y su avance, calculados desde sus ítems.';

grant select on public.ordenes_proveedor_resumen to authenticated;

-- ─── 5. Cuentas por pagar ───────────────────────────────────────────────────
-- Una línea por cada cosa que se le debe a un proveedor, venga de una factura
-- registrada o de una OC que todavía no facturan. Las dos tienen que estar a la
-- vista: la planilla de Valar programa la semana mirando ambas, porque una OC
-- de $38 M sin factura es plata comprometida aunque hoy no se pueda pagar.

drop view if exists public.flujo_de_pagos;
drop view if exists public.cuentas_por_pagar;
create view public.cuentas_por_pagar
with (security_invoker = true) as
with p as (
  select * from public.parametros_pago where id
),
lineas as (
  /* a) Facturas del proveedor. Las pagadas siguen apareciendo dos meses: es lo
        que permite armar el cuadro de la semana y revisar la anterior. */
  select
    'F:' || c.id                          as id,
    'factura'::text                       as origen,
    c.id                                  as compra_id,
    c.orden_id,
    o.numero                              as orden_numero,
    c.contrato_id,
    ct.nombre                             as contrato,
    coalesce(c.proveedor_id, o.proveedor_id) as proveedor_id,
    coalesce(pr.razon_social, c.proveedor) as proveedor,
    pr.rut,
    coalesce(pr.estado_cuenta, 'por_validar') as estado_cuenta,
    pr.banco,
    pr.numero_cuenta,
    c.detalle,
    c.documento,
    c.fecha_factura,
    c.fecha                               as periodo,
    c.neto,
    c.iva,
    c.total,
    coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p)) as plazo_dias,
    coalesce(
      c.fecha_vencimiento,
      c.fecha_factura + coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p))
    )                                     as vencimiento,
    c.fecha_pago_programada,
    c.fecha_pago,
    c.estado_pago,
    /* Días que lleva la compra sin factura registrada. Con factura no aplica. */
    case when c.documento is null then greatest(current_date - c.fecha, 0) end as dias_sin_facturar
  from public.compras c
  join public.contratos ct on ct.id = c.contrato_id
  left join public.ordenes_compra_proveedor o on o.id = c.orden_id
  left join public.proveedores pr on pr.id = coalesce(c.proveedor_id, o.proveedor_id)
  where c.estado_pago <> 'pagada'
     or c.fecha_pago >= current_date - 60

  union all

  /* b) Órdenes emitidas con saldo sin facturar. El monto es lo que falta por
        facturar, no el total: si la OC ya vino a medias en una factura, esa
        mitad ya está en la rama de arriba y contarla dos veces duplicaría la
        deuda. */
  select
    'O:' || o.id                          as id,
    'orden'::text                         as origen,
    null::text                            as compra_id,
    o.id                                  as orden_id,
    o.numero                              as orden_numero,
    o.contrato_id,
    ct.nombre                             as contrato,
    o.proveedor_id,
    coalesce(pr.razon_social, o.proveedor) as proveedor,
    coalesce(pr.rut, o.rut_proveedor)     as rut,
    coalesce(pr.estado_cuenta, 'por_validar') as estado_cuenta,
    pr.banco,
    pr.numero_cuenta,
    'Saldo sin facturar de la orden'      as detalle,
    null::text                            as documento,
    null::date                            as fecha_factura,
    o.fecha_emision                       as periodo,
    (r.neto - r.facturado)                as neto,
    0::bigint                             as iva,
    (r.neto - r.facturado)                as total,
    coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p)) as plazo_dias,
    null::date                            as vencimiento,
    null::date                            as fecha_pago_programada,
    null::date                            as fecha_pago,
    'pendiente'::text                     as estado_pago,
    greatest(current_date - o.fecha_emision, 0) as dias_sin_facturar
  from public.ordenes_compra_proveedor o
  join public.ordenes_proveedor_resumen r on r.id = o.id
  join public.contratos ct on ct.id = o.contrato_id
  left join public.proveedores pr on pr.id = o.proveedor_id
  where o.estado in ('emitida', 'parcial', 'recibida')
    and r.neto > r.facturado
)
select
  l.*,
  (l.vencimiento - current_date) as dias_para_vencer,

  /* El estado del documento, con el mismo orden de la planilla. Lo que un
     humano escribió arriba —pagada, retenida, anulada— manda sobre el cálculo:
     una factura pagada no vuelve a estar vencida porque pasó su fecha. */
  case
    when l.estado_pago = 'pagada'   then 'pagado'
    when l.estado_pago = 'retenida' then 'retenido'
    when l.estado_pago = 'anulada'  then 'anulado'
    when l.documento is null        then 'no_facturado'
    when l.vencimiento is null      then 'pendiente'
    when l.vencimiento < current_date then 'vencido'
    when l.vencimiento <= current_date + (select dias_alerta_vencimiento from p)
                                    then 'por_vencer'
    else 'pendiente'
  end as estado_documento,

  /* Si el respaldo está completo. Es la alerta que hace que el proveedor mande
     la factura antes de que la deuda envejezca sin documento. */
  case
    when l.documento is not null then 'ok'
    when l.estado_pago = 'pagada' then 'pagado_sin_factura'
    when l.dias_sin_facturar > (select dias_maximos_sin_factura from p)
      then 'factura_atrasada'
    else 'falta_factura'
  end as alerta_documental,

  /* La regla dura de la planilla, hecha columna: sin factura no se paga. */
  (l.documento is not null and l.estado_pago = 'pendiente') as apto_para_pago,

  /* El lunes de la semana en que quedó agendada. Es con lo que se arma el
     cuadro de pago y se compara contra el tope. */
  (date_trunc('week', l.fecha_pago_programada)::date) as semana_pago
from lineas l;

comment on view public.cuentas_por_pagar is
  'Todo lo que se le debe a proveedores, línea por línea: facturas registradas y saldos de OC sin facturar. `apto_para_pago` es la regla dura: sin factura no se paga.';

grant select on public.cuentas_por_pagar to authenticated;

-- ─── 6. Flujo de pagos: lo mismo, por proveedor ─────────────────────────────
-- Es la hoja «Flujo de Pagos» de la planilla: cuánto se le debe a cada uno,
-- cuánto de eso es exigible hoy y cuánto está bloqueado esperando la factura.

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
    coalesce(sum(c.total) filter (
      where c.estado_documento not in ('pagado', 'anulado')
    ), 0)::bigint as pendiente_total,
    coalesce(sum(c.total) filter (where c.apto_para_pago), 0)::bigint as exigible,
    coalesce(sum(c.total) filter (
      where c.estado_documento = 'no_facturado'
    ), 0)::bigint as bloqueado,
    coalesce(sum(c.total) filter (where c.estado_documento = 'vencido'), 0)::bigint as vencido,
    coalesce(sum(c.total) filter (where c.estado_documento = 'por_vencer'), 0)::bigint as por_vencer,
    coalesce(sum(c.total) filter (where c.estado_documento = 'retenido'), 0)::bigint as retenido,
    coalesce(sum(c.total) filter (
      where c.fecha_pago_programada is not null and c.estado_pago = 'pendiente'
    ), 0)::bigint as programado,
    min(c.vencimiento) filter (where c.apto_para_pago) as vence_primero
  from public.cuentas_por_pagar c
  group by 1, 2, 3, 4;

comment on view public.flujo_de_pagos is
  'Cuánto se le debe a cada proveedor, separando lo exigible (con factura) de lo bloqueado (sin factura). Es la hoja «Flujo de Pagos» de la planilla.';

grant select on public.flujo_de_pagos to authenticated;

-- ─── 7. RLS de los parámetros ───────────────────────────────────────────────
-- Los lee cualquiera con sesión —la pantalla los muestra— y los cambia un
-- administrador: el tope semanal y el plazo de pago son decisiones de gerencia.

alter table public.parametros_pago enable row level security;

drop policy if exists "parametros_pago: lectura autenticada" on public.parametros_pago;
create policy "parametros_pago: lectura autenticada"
  on public.parametros_pago for select to authenticated using (true);

drop policy if exists "parametros_pago: cambia admin" on public.parametros_pago;
create policy "parametros_pago: cambia admin"
  on public.parametros_pago for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

notify pgrst, 'reload schema';
