-- ============================================================================
-- Plataforma Valar — Contratos que cambian, y egresos en una sola pantalla
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0018.
--
-- TRES COSAS, pedidas por el usuario el 08-09-2026:
--
--   1. MODALIDAD del contrato. Valar hace servicios industriales y toma
--      contratos de todo tipo: largo plazo, spot, suma alzada. Eso no es lo
--      mismo que el `tipo` que ya existía —dotación, unidades, obra—, que dice
--      cómo se calcula el precio. Un contrato a largo plazo puede cobrarse por
--      dotación y uno spot por suma alzada: son dos preguntas distintas y
--      mezclarlas obliga a elegir cuál se guarda.
--
--   2. EL CONTRATO MUTA. El original tiene un monto y un plazo, pero siempre
--      aparecen adendums: mayor obra, menor obra, extensión de plazo. Hasta
--      ahora eso se resolvía editando el contrato encima, y así se pierde cuál
--      era el trato original —que es justamente lo que hay que poder mostrar
--      cuando el mandante pregunta—. Los adendums pasan a ser registros
--      propios y el monto vigente se calcula: base más lo que sumen o resten.
--
--   3. COMPRAS Y SERVICIOS SE MIRAN JUNTOS. Son la misma pregunta —qué se
--      gastó con terceros—, aunque cada uno guarde campos propios. Se unen en
--      una vista, no en una tabla: un arriendo tiene período y recurrencia que
--      una compra de ferretería no tiene, y forzarlos a una sola tabla llenaría
--      la mitad de las columnas de nulos.
-- ============================================================================

-- ─── 1. La modalidad ────────────────────────────────────────────────────────

alter table public.contratos
  add column if not exists modalidad text not null default 'largo_plazo'
    check (modalidad in (
      'largo_plazo',        -- marco, plurianual: se factura mes a mes
      'spot',               -- puntual, una sola vez
      'suma_alzada',        -- precio fijo por el total de la obra
      'precios_unitarios',  -- serie de precios, se paga lo ejecutado
      'administracion',     -- administración delegada, costo más honorario
      'arriendo'            -- equipos por período
    ));

comment on column public.contratos.modalidad is
  'Cómo se contrató. Distinto de `tipo`, que dice cómo se calcula el precio.';

-- Los dos contratos vigentes son de largo plazo: se facturan mes a mes desde
-- hace años. Queda dicho para no tener que adivinarlo desde la pantalla.
update public.contratos set modalidad = 'largo_plazo'
where id in ('C-MISC', 'C-TORRES') and modalidad is distinct from 'largo_plazo';

-- ─── 2. Adendums ────────────────────────────────────────────────────────────
-- Cada modificación al contrato original, con su propio documento y su fecha.
-- El contrato base NO se toca: así se puede responder "el trato original era
-- este y después pasó esto otro", que es la pregunta que llega en una revisión.

create table if not exists public.adendums (
  id text primary key,                                   -- "AD-MISC-01"
  contrato_id text not null references public.contratos (id) on delete cascade,
  numero smallint not null,                              -- correlativo del contrato
  /* mayor_obra       → se agrega alcance y monto
     menor_obra       → se reduce (el monto va negativo)
     extension_plazo  → mismo alcance, más tiempo
     cambio_alcance   → cambia lo que hay que hacer, con o sin monto
     reajuste         → se ajustan precios (IPC, UF, negociación)
     otro             → lo que no calce en los anteriores */
  tipo text not null default 'mayor_obra'
    check (tipo in ('mayor_obra', 'menor_obra', 'extension_plazo',
                    'cambio_alcance', 'reajuste', 'otro')),
  descripcion text not null,
  /* Lo que suma o resta al monto del contrato. Negativo en una menor obra: es
     una resta de verdad, no un monto positivo con otro nombre. */
  monto bigint not null default 0,
  /* Días que agrega o quita al plazo. También puede ser negativo. */
  dias_plazo smallint not null default 0,
  /* Si el adendum fija una fecha nueva en vez de sumar días, manda esta. */
  nueva_fecha_termino date,
  fecha date not null default current_date,              -- cuándo se firmó
  documento text,                                        -- N° del adendum del mandante
  /* `borrador` mientras se negocia; solo los `vigente` mueven el monto y el
     plazo del contrato. Un adendum anulado se conserva: saber qué se negoció y
     no prosperó también es información. */
  estado text not null default 'vigente'
    check (estado in ('borrador', 'vigente', 'anulado')),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (contrato_id, numero)
);

comment on table public.adendums is
  'Modificaciones al contrato original: mayor obra, menor obra, extensiones de plazo. El contrato base no se edita.';

create index if not exists adendums_contrato_idx
  on public.adendums (contrato_id, numero);

-- ─── 3. Recurrencia en los servicios ────────────────────────────────────────
-- Un arriendo de torres no es un gasto de una vez: se repite todos los meses
-- mientras dure. Marcarlo permite separar el gasto que va a volver del que no,
-- que es una pregunta distinta de cuánto costó.

alter table public.servicios
  add column if not exists recurrente boolean not null default false;

alter table public.servicios
  add column if not exists periodicidad text
    check (periodicidad in ('mensual', 'quincenal', 'semanal', 'anual'));

comment on column public.servicios.recurrente is
  'Si el gasto se repite mientras dure el período: un arriendo sí, un flete puntual no.';

-- ─── Contratos, con su vigencia calculada ───────────────────────────────────
-- Monta sobre `contratos_resumen`, que ya trae el costo real deducido. Acá se
-- le suma lo que los adendums vigentes mueven.

drop view if exists public.contratos_detalle;
create view public.contratos_detalle
with (security_invoker = true) as
  with movimientos as (
    select
      a.contrato_id,
      count(*)::int as adendums,
      coalesce(sum(a.monto), 0)::bigint as monto_adendums,
      coalesce(sum(a.dias_plazo), 0)::int as dias_adendums,
      max(a.nueva_fecha_termino) as fecha_fijada,
      max(a.fecha) as ultimo_adendum
    from public.adendums a
    where a.estado = 'vigente'
    group by a.contrato_id
  )
  select
    r.*,
    c.modalidad,
    c.tipo,
    c.moneda,
    c.meta_margen,
    c.inicio,
    coalesce(m.adendums, 0) as adendums,
    coalesce(m.monto_adendums, 0)::bigint as monto_adendums,
    coalesce(m.dias_adendums, 0) as dias_adendums,
    m.ultimo_adendum,
    /* El monto que rige hoy. Si el contrato no tiene monto base —los
       recurrentes no lo tienen— y tampoco hay adendums con monto, queda nulo:
       cero diría que el contrato vale cero, que es distinto de "no aplica". */
    case
      when r.presupuesto is null and coalesce(m.monto_adendums, 0) = 0 then null
      else (coalesce(r.presupuesto, 0) + coalesce(m.monto_adendums, 0))::bigint
    end as monto_vigente,
    /* El término que rige hoy: la fecha que fije el último adendum, o el
       término original más los días que sumen. */
    coalesce(m.fecha_fijada, r.termino + coalesce(m.dias_adendums, 0)) as termino_vigente
  from public.contratos_resumen r
  join public.contratos c on c.id = r.id
  left join movimientos m on m.contrato_id = r.id;

comment on view public.contratos_detalle is
  'Contratos con su modalidad y su vigencia: monto y término después de los adendums.';

grant select on public.contratos_detalle to authenticated;

-- ─── Egresos con terceros, en una sola lista ────────────────────────────────
-- Compras y servicios juntos, con el origen a la vista y los campos propios de
-- cada uno. El personal queda fuera a propósito: no es un gasto con un tercero
-- y tiene su propia pantalla.

drop view if exists public.egresos_terceros;
create view public.egresos_terceros
with (security_invoker = true) as
  select
    c.id,
    'compra'::text as origen,
    c.contrato_id,
    c.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    c.proveedor as tercero,
    c.documento,
    c.detalle,
    c.tipo,
    null::text as clase,                                 -- solo aplica a servicios
    false as recurrente,
    null::text as periodicidad,
    c.fecha,
    null::date as desde,
    null::date as hasta,
    c.neto, c.iva, c.total,
    c.estado_pago,
    c.creado_en
  from public.compras c
  left join public.categorias_costo cat on cat.id = c.categoria_id

  union all

  select
    s.id,
    'servicio'::text as origen,
    s.contrato_id,
    s.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
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
    s.neto, s.iva, s.total,
    s.estado_pago,
    s.creado_en
  from public.servicios s
  left join public.categorias_costo cat on cat.id = s.categoria_id;

comment on view public.egresos_terceros is
  'Compras y servicios en una sola lista, con el origen a la vista. El personal va aparte: no es un gasto con un tercero.';

grant select on public.egresos_terceros to authenticated;

-- ─── Autoría, bitácora y RLS de los adendums ────────────────────────────────

alter table public.adendums
  add column if not exists creado_por uuid references auth.users (id) on delete set null;
alter table public.adendums
  add column if not exists actualizado_por uuid references auth.users (id) on delete set null;

drop trigger if exists adendums_actualizado on public.adendums;
create trigger adendums_actualizado
  before update on public.adendums
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists adendums_autoria on public.adendums;
create trigger adendums_autoria
  before insert or update on public.adendums
  for each row execute function public.marcar_autoria();

drop trigger if exists adendums_auditoria on public.adendums;
create trigger adendums_auditoria
  after insert or update or delete on public.adendums
  for each row execute function public.registrar_auditoria();

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos',
    'proveedores', 'solped', 'solped_items', 'cotizaciones', 'cotizacion_items',
    'adendums'
  ];
$$;

alter table public.adendums enable row level security;

drop policy if exists "adendums: lectura autenticada" on public.adendums;
create policy "adendums: lectura autenticada"
  on public.adendums for select to authenticated using (true);

drop policy if exists "adendums: escribe gestion" on public.adendums;
create policy "adendums: escribe gestion"
  on public.adendums for all to authenticated
  using (public.puede_editar()) with check (public.puede_editar());

-- El adendum firmado se adjunta al registro.
alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal',
    'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'adendums'
  )
);

notify pgrst, 'reload schema';
