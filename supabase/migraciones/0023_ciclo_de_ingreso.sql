-- ============================================================================
-- Plataforma Valar — La cadena del ingreso: EDP → OC → Factura
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0022.
--
-- EL FLUJO REAL, dicho por el usuario: sin estado de pago no hay orden de
-- compra, y sin orden de compra no se factura. Las tres cosas existían en la
-- base, pero sueltas:
--
--   estados_pago   →  (nada las unía)
--   ordenes_compra →  sin referencia al EDP del que salió
--   facturas       →  apuntaban al EDP, pero no a la OC
--
-- Sin esos dos enlaces no se puede responder "¿de qué estado de pago salió esta
-- factura?" ni impedir que se facture algo que el mandante no autorizó, que es
-- justamente lo que la orden de compra significa: el techo de lo que se puede
-- cobrar.
--
-- Los enlaces son opcionales a propósito. Hay facturas y órdenes viejas que
-- nacieron antes de esta cadena, y obligarlas a tener padre significaría
-- inventarles uno o dejarlas fuera del sistema.
-- ============================================================================

-- ─── Los dos eslabones que faltaban ─────────────────────────────────────────

alter table public.ordenes_compra
  add column if not exists estado_pago_id text
    references public.estados_pago (id) on delete set null;

comment on column public.ordenes_compra.estado_pago_id is
  'De qué estado de pago salió esta orden. Sin EDP no hay OC.';

alter table public.facturas
  add column if not exists orden_compra_id text
    references public.ordenes_compra (id) on delete set null;

comment on column public.facturas.orden_compra_id is
  'Contra qué orden se factura. La orden es el techo de lo que se puede cobrar.';

create index if not exists ordenes_compra_edp_idx
  on public.ordenes_compra (estado_pago_id);
create index if not exists facturas_oc_idx
  on public.facturas (orden_compra_id);

-- ─── El ciclo completo, una fila por estado de pago ─────────────────────────
-- Es lo que la pantalla necesita para saber qué etapa habilitar: no se puede
-- emitir la orden si el mandante no aprobó el EDP, ni facturar si no hay orden.

drop view if exists public.ciclo_ingreso;
create view public.ciclo_ingreso
with (security_invoker = true) as
  select
    e.id,
    e.contrato_id,
    c.nombre as contrato,
    c.cliente,
    e.numero,
    e.periodo,
    e.tipo_edp,
    e.estado,
    e.avance_periodo,
    e.monto_neto,
    e.monto_uf,
    e.retenciones,
    e.monto_cobrado,
    e.fecha_presentacion,
    e.fecha_aprobacion,
    e.datos,

    o.id as orden_id,
    o.numero as orden_numero,
    o.monto_autorizado,
    o.fecha_emision as orden_fecha,
    o.estado as orden_estado,

    f.id as factura_id,
    f.neto as factura_neto,
    f.total as factura_total,
    f.fecha_emision as factura_fecha,
    f.vencimiento as factura_vencimiento,
    f.estado_cobro,

    /* En qué etapa está la cadena. Es lo que decide qué se puede hacer:
         edp      → todavía se está armando o esperando la aprobación
         orden    → aprobado, falta la orden del mandante
         factura  → hay orden, falta emitir la factura
         cobro    → facturado, falta que paguen
         cerrado  → pagado */
    case
      when f.id is not null and f.estado_cobro = 'pagada' then 'cerrado'
      when f.id is not null then 'cobro'
      when o.id is not null then 'factura'
      when e.estado = 'aprobado' then 'orden'
      else 'edp'
    end as etapa
  from public.estados_pago e
  join public.contratos c on c.id = e.contrato_id
  left join lateral (
    select * from public.ordenes_compra o2
    where o2.estado_pago_id = e.id
    order by o2.fecha_emision desc limit 1
  ) o on true
  left join lateral (
    select * from public.facturas f2
    where f2.estado_pago_id = e.id
    order by f2.fecha_emision desc limit 1
  ) f on true;

comment on view public.ciclo_ingreso is
  'Una fila por estado de pago con su orden y su factura: es lo que dice en qué etapa está y qué se puede hacer.';

grant select on public.ciclo_ingreso to authenticated;

-- ─── Los respaldos de la orden y la factura ─────────────────────────────────
-- `ordenes_compra` no estaba en la lista de tablas que admiten adjuntos, y la
-- orden del mandante es justamente un documento que llega en PDF.

alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal',
    'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos'
  )
);

notify pgrst, 'reload schema';
