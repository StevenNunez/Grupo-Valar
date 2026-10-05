-- ============================================================================
-- 0047 — El estado del contrato sale de las fechas; a mano, solo "cancelado"
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- EL PROBLEMA. `contratos.estado` venía de la 0001 —en plazo, en riesgo,
-- atrasado, cerrado— como texto obligatorio y sin valor por defecto. Después
-- la vigencia pasó a calcularse sola en `contratos_detalle` (vigente / por
-- vencer / cerrado, con la fecha de término que rige hoy, anexos incluidos), y
-- el formulario dejó de pedir el estado. Pero la columna seguía exigiéndolo: el
-- primer contrato real de Valar no se pudo guardar.
--
-- LO QUE QUEDA. Lo que las fechas ya dicen no se teclea. La columna guarda lo
-- ÚNICO que las fechas no pueden saber:
--
--   activo     manda el calendario: vigente, por vencer o cerrado
--   cancelado  se terminó antes de tiempo; la vigencia dice "cancelado"
--
-- "En riesgo" y "atrasado" eran juicios a mano que nadie mantenía; si vuelven,
-- tendrán que salir de los datos (avance contra plazo), no de un selector.
-- ============================================================================

alter table public.contratos drop constraint if exists contratos_estado_check;

update public.contratos set estado = 'activo' where estado is distinct from 'cancelado';

alter table public.contratos
  alter column estado set default 'activo',
  add constraint contratos_estado_check check (estado in ('activo', 'cancelado'));

comment on column public.contratos.estado is
  'activo = la vigencia sale de las fechas. cancelado = terminó antes de tiempo. '
  'Lo demás (vigente, por vencer, cerrado) lo calcula `contratos_detalle`.';

/* La misma vista de la 0021, con un caso más al principio de la vigencia: un
   contrato cancelado dice "cancelado" aunque sus fechas sigan corriendo. Las
   columnas no cambian, así que `create or replace` alcanza y no hay que
   descolgar nada. `security_invoker` va explícito para que hereden el RLS. */
create or replace view public.contratos_detalle
with (security_invoker = true) as
with movimientos as (
  select a.contrato_id,
         count(*)::integer as anexos,
         coalesce(sum(a.monto), 0::numeric)::bigint as monto_anexos,
         coalesce(sum(a.dias_plazo), 0::bigint)::integer as dias_anexos,
         max(a.nueva_fecha_termino) as fecha_fijada,
         max(a.fecha) as ultimo_anexo
    from public.anexos a
   where a.estado = 'vigente'
   group by a.contrato_id
), base as (
  select r.id,
         r.nombre,
         r.cliente,
         r.faena,
         r.avance,
         r.presupuesto,
         r.estado,
         r.termino,
         r.costo_compras,
         r.costo_servicios,
         r.costo_personal,
         r.costo_reembolsable,
         r.costo_real,
         r.facturado,
         c.modalidad,
         c.tipo,
         c.moneda,
         c.meta_margen,
         c.inicio,
         coalesce(m.anexos, 0) as anexos,
         coalesce(m.monto_anexos, 0::bigint) as monto_anexos,
         coalesce(m.dias_anexos, 0) as dias_anexos,
         m.ultimo_anexo,
         case
           when r.presupuesto is null and coalesce(m.monto_anexos, 0::bigint) = 0 then null::bigint
           else coalesce(r.presupuesto, 0::bigint) + coalesce(m.monto_anexos, 0::bigint)
         end as monto_vigente,
         coalesce(m.fecha_fijada, r.termino + coalesce(m.dias_anexos, 0)) as termino_vigente
    from public.contratos_resumen r
    join public.contratos c on c.id = r.id
    left join movimientos m on m.contrato_id = r.id
)
select id,
       nombre,
       cliente,
       faena,
       avance,
       presupuesto,
       estado,
       termino,
       costo_compras,
       costo_servicios,
       costo_personal,
       costo_reembolsable,
       costo_real,
       facturado,
       modalidad,
       tipo,
       moneda,
       meta_margen,
       inicio,
       anexos,
       monto_anexos,
       dias_anexos,
       ultimo_anexo,
       monto_vigente,
       termino_vigente,
       case
         when estado = 'cancelado' then 'cancelado'::text
         when termino_vigente < current_date then 'cerrado'::text
         when termino_vigente <= (current_date + 60) then 'por-vencer'::text
         else 'vigente'::text
       end as vigencia,
       termino_vigente - current_date as dias_restantes,
       case
         when inicio is not null then termino_vigente - inicio
         else null::integer
       end as dias_plazo_total
  from base b;

notify pgrst, 'reload schema';
