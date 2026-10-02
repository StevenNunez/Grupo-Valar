-- ============================================================================
-- Plataforma Valar — Anexos de contrato, y la modalidad en dos niveles
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0020.
--
-- CUATRO CAMBIOS, pedidos por el usuario el 08-09-2026:
--
--   1. "Adendum" pasa a llamarse ANEXO DE CONTRATO, que es como se le dice.
--      La tabla se renombra, no solo la pantalla: un nombre en la base y otro
--      en la interfaz obliga a traducir mentalmente cada vez que se lee el
--      código.
--
--   2. La MODALIDAD queda en dos: spot y largo plazo. Es la primera pregunta
--      —¿es puntual o es permanente?— y solo tiene esas dos respuestas.
--
--   3. Dentro de la modalidad va la FORMA DE CONTRATACIÓN: suma alzada,
--      precios unitarios, administración delegada o arriendo. Acá NO se crea
--      una columna nueva: se reutiliza `tipo`, que la 0005 había definido como
--      dotación/unidades/obra y que nunca se usó para nada más que mostrarse.
--      Dos columnas que significan casi lo mismo es exactamente el problema que
--      se evitó al separar modalidad de tipo, y no vale la pena repetirlo.
--
--   4. El ESTADO deja de escribirse a mano. Un contrato está vigente, por
--      vencer o cerrado según su fecha de término —la vigente, la que ya
--      incorpora los anexos—, y eso la base lo sabe sin que nadie lo actualice.
--      Un estado que hay que acordarse de cambiar es un estado que va a estar
--      mal justo cuando se necesite.
-- ============================================================================

-- ─── 1. Adendums pasan a ser anexos ─────────────────────────────────────────

drop view if exists public.contratos_detalle;

alter table if exists public.adendums rename to anexos;

/* La llave primaria conserva su nombre viejo al renombrar la tabla. Se busca
   cuál es en vez de asumirlo: si el nombre no calza —porque la tabla se creó de
   otra forma o ya se renombró antes—, un `alter ... rename constraint` a secas
   corta la migración entera por un detalle cosmético. */
do $$
declare
  actual text;
begin
  select conname into actual
  from pg_constraint
  where conrelid = 'public.anexos'::regclass and contype = 'p';

  if actual is not null and actual <> 'anexos_pkey' then
    execute format('alter table public.anexos rename constraint %I to anexos_pkey', actual);
  end if;
end;
$$;

drop index if exists public.adendums_contrato_idx;
create index if not exists anexos_contrato_idx on public.anexos (contrato_id, numero);

comment on table public.anexos is
  'Anexos del contrato: mayor obra, menor obra, extensiones de plazo. El contrato base no se edita.';

/* Los triggers y las políticas conservan el nombre viejo al renombrar la tabla:
   se rehacen con el nombre nuevo.

   Se sueltan LOS DOS nombres, el viejo y el nuevo. Soltar solo el viejo hace
   que la migración funcione la primera vez y falle en la segunda contra lo que
   ella misma creó, que es la peor clase de migración: la que no se puede
   repetir justo cuando hay que repetirla. */
drop trigger if exists adendums_actualizado on public.anexos;
drop trigger if exists adendums_autoria on public.anexos;
drop trigger if exists adendums_auditoria on public.anexos;

drop trigger if exists anexos_actualizado on public.anexos;
drop trigger if exists anexos_autoria on public.anexos;
drop trigger if exists anexos_auditoria on public.anexos;

create trigger anexos_actualizado
  before update on public.anexos
  for each row execute function public.tocar_actualizado_en();

create trigger anexos_autoria
  before insert or update on public.anexos
  for each row execute function public.marcar_autoria();

create trigger anexos_auditoria
  after insert or update or delete on public.anexos
  for each row execute function public.registrar_auditoria();

drop policy if exists "adendums: lectura autenticada" on public.anexos;
drop policy if exists "adendums: escribe gestion" on public.anexos;

drop policy if exists "anexos: lectura autenticada" on public.anexos;
create policy "anexos: lectura autenticada"
  on public.anexos for select to authenticated using (true);

drop policy if exists "anexos: escribe gestion" on public.anexos;
create policy "anexos: escribe gestion"
  on public.anexos for all to authenticated
  using (public.puede_editar()) with check (public.puede_editar());

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos',
    'proveedores', 'solped', 'solped_items', 'cotizaciones', 'cotizacion_items',
    'anexos'
  ];
$$;

alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal',
    'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos'
  )
);

-- La bitácora ya escrita apuntaba a "adendums": se corrige para que el
-- historial de un anexo no se corte en el cambio de nombre.
update public.auditoria set tabla = 'anexos' where tabla = 'adendums';
update public.adjuntos set tabla = 'anexos' where tabla = 'adendums';

-- ─── 2 y 3. Modalidad en dos niveles ────────────────────────────────────────

alter table public.contratos drop constraint if exists contratos_modalidad_check;

update public.contratos
set modalidad = case
  when modalidad in ('spot') then 'spot'
  else 'largo_plazo'
end;

alter table public.contratos add constraint contratos_modalidad_check
  check (modalidad in ('spot', 'largo_plazo'));

comment on column public.contratos.modalidad is
  'La primera pregunta: puntual (spot) o permanente (largo plazo).';

-- `tipo` deja de ser dotación/unidades/obra y pasa a ser la forma de
-- contratación. El mapeo sale de lo que cada contrato es de verdad:
--   dotacion  → precios unitarios (se cobra por cargo y hora trabajada)
--   unidades  → arriendo          (19 torres por un precio mensual)
--   obra      → suma alzada       (un precio fijo por el total)
alter table public.contratos drop constraint if exists contratos_tipo_check;

update public.contratos
set tipo = case tipo
  when 'dotacion' then 'precios_unitarios'
  when 'unidades' then 'arriendo'
  when 'obra' then 'suma_alzada'
  else tipo
end;

alter table public.contratos add constraint contratos_tipo_check
  check (tipo in ('suma_alzada', 'precios_unitarios', 'administracion_delegada', 'arriendo'));

alter table public.contratos alter column tipo set default 'precios_unitarios';

comment on column public.contratos.tipo is
  'Forma de contratación dentro de la modalidad: suma alzada, precios unitarios, administración delegada o arriendo.';

-- ─── 4. La vigencia se deduce de la fecha ───────────────────────────────────

create view public.contratos_detalle
with (security_invoker = true) as
  with movimientos as (
    select
      a.contrato_id,
      count(*)::int as anexos,
      coalesce(sum(a.monto), 0)::bigint as monto_anexos,
      coalesce(sum(a.dias_plazo), 0)::int as dias_anexos,
      max(a.nueva_fecha_termino) as fecha_fijada,
      max(a.fecha) as ultimo_anexo
    from public.anexos a
    where a.estado = 'vigente'
    group by a.contrato_id
  ),
  base as (
    select
      r.*,
      c.modalidad,
      c.tipo,
      c.moneda,
      c.meta_margen,
      c.inicio,
      coalesce(m.anexos, 0) as anexos,
      coalesce(m.monto_anexos, 0)::bigint as monto_anexos,
      coalesce(m.dias_anexos, 0) as dias_anexos,
      m.ultimo_anexo,
      case
        when r.presupuesto is null and coalesce(m.monto_anexos, 0) = 0 then null
        else (coalesce(r.presupuesto, 0) + coalesce(m.monto_anexos, 0))::bigint
      end as monto_vigente,
      coalesce(m.fecha_fijada, r.termino + coalesce(m.dias_anexos, 0)) as termino_vigente
    from public.contratos_resumen r
    join public.contratos c on c.id = r.id
    left join movimientos m on m.contrato_id = r.id
  )
  select
    b.*,
    /* La vigencia no se teclea: sale de la fecha de término que rige hoy, la
       que ya incorpora los anexos. Sesenta días es el aviso: es el tiempo que
       toma renovar o licitar de nuevo. */
    case
      when b.termino_vigente < current_date then 'cerrado'
      when b.termino_vigente <= current_date + 60 then 'por-vencer'
      else 'vigente'
    end as vigencia,
    (b.termino_vigente - current_date)::int as dias_restantes,
    /* Cuánto dura, contando desde el inicio si está cargado. */
    case
      when b.inicio is not null then (b.termino_vigente - b.inicio)::int
    end as dias_plazo_total
  from base b;

comment on view public.contratos_detalle is
  'Contratos con su modalidad, su vigencia deducida de las fechas y el efecto de los anexos.';

grant select on public.contratos_detalle to authenticated;

notify pgrst, 'reload schema';
