-- ============================================================================
-- Plataforma Valar — Las compras apuntan al maestro de proveedores
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0023.
--
-- DOS COSAS.
--
-- 1. `compras.proveedor` era texto libre. Con 80 proveedores reales cargados en
--    Abastecimiento, escribir el nombre a mano significa que "Melón Hormigones",
--    "Melon Hormigones" y "MELON HORMIGONES S.A." son tres proveedores distintos
--    para cualquier consulta, y ninguno calza con el maestro. Se agrega el
--    enlace al maestro y se conserva el texto: el texto es lo que quedó escrito
--    en la factura ese día, el enlace es con quién se trabajó.
--
--    El enlace es opcional a propósito: hay compras viejas cuyo proveedor no
--    está en el maestro, y obligarlas a tener uno significaría inventárselo.
--
-- 2. La vista `ciclo_ingreso` suma dos columnas que faltaban —la vigencia de la
--    orden y el IVA de la factura— para que las dos se puedan EDITAR desde la
--    ficha del ciclo sin ir a buscarlas a otra consulta.
-- ============================================================================

-- ─── 1. El enlace al maestro ────────────────────────────────────────────────

alter table public.compras
  add column if not exists proveedor_id text
    references public.proveedores (id) on delete set null;

comment on column public.compras.proveedor_id is
  'Con quién se compró, del maestro de Abastecimiento. Opcional: hay compras anteriores al maestro.';

comment on column public.compras.proveedor is
  'El nombre tal como quedó escrito en el documento. El maestro manda para consultar; esto para leer la factura.';

create index if not exists compras_proveedor_idx on public.compras (proveedor_id);

/* Las compras que ya existen se enganchan solas cuando el nombre calza con la
   razón social, sin distinguir mayúsculas ni espacios de más. Lo que no calce
   queda sin enlace, que es la respuesta honesta: no se adivina un proveedor. */
update public.compras c
set proveedor_id = p.id
from public.proveedores p
where c.proveedor_id is null
  and lower(btrim(c.proveedor)) = lower(btrim(p.razon_social));

-- El egreso de Control de Gestión es MENSUAL: se carga una línea por contrato y
-- mes, porque es por mes que se calcula el resultado. El detalle documento por
-- documento vive en Abastecimiento.
comment on column public.compras.fecha is
  'El mes que se está cargando, en su día 1. Control de Gestión trabaja por mes.';

-- ─── 2. La vista, con lo que faltaba para editar ────────────────────────────

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
    o.mandante as orden_mandante,
    o.monto_autorizado,
    o.fecha_emision as orden_fecha,
    o.vigencia as orden_vigencia,
    o.estado as orden_estado,

    f.id as factura_id,
    f.neto as factura_neto,
    f.iva as factura_iva,
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

notify pgrst, 'reload schema';
