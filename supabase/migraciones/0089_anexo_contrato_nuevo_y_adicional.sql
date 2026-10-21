-- ════════════════════════════════════════════════════════════════════════════
-- 0089 — Anexo = contrato nuevo; adicional = suma al valor del contrato
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy el monto de TODOS los anexos vigentes se sumaba al valor del contrato
-- base. Un anexo es un contrato nuevo (Carpas dentro de Misceláneos): tiene su
-- propio valor y NO mueve el del contrato. Solo un adicional se suma al valor
-- inicial del contrato.
--
--   suma_al_contrato   true = adicional: su monto entra al valor vigente del
--                      contrato. false (por defecto) = anexo, contrato nuevo.
--   venta_por_valor    true = contrato por avance/consumo: su venta es el valor
--                      del contrato y no la suma de sus estados de pago (que
--                      pasan a ser solo el cobro). La venta se reconoce en el
--                      mes de su primer movimiento. Carpas queda así.
--
-- Los anexos ya cargados quedan como anexo (suma_al_contrato = false).

alter table public.anexos
  add column if not exists suma_al_contrato boolean not null default false,
  add column if not exists venta_por_valor boolean not null default false;

comment on column public.anexos.suma_al_contrato is
  'Adicional: su monto se suma al valor del contrato. Falso = anexo (contrato nuevo, no mueve el valor del base).';
comment on column public.anexos.venta_por_valor is
  'Contrato por avance: la venta es el valor del contrato, no los estados de pago (0089).';

update public.anexos set venta_por_valor = true where id = 'AD-9500013862-02';

-- ─── Valor vigente: solo suman los adicionales ──────────────────────────────

create or replace view public.contratos_detalle
with (security_invoker = true) as
 WITH movimientos AS (
         SELECT a.contrato_id,
            count(*)::integer AS anexos,
            COALESCE(sum(a.monto) FILTER (WHERE a.suma_al_contrato), 0::numeric)::bigint AS monto_anexos,
            COALESCE(sum(a.dias_plazo), 0::bigint)::integer AS dias_anexos,
            max(a.nueva_fecha_termino) AS fecha_fijada,
            max(a.fecha) AS ultimo_anexo
           FROM anexos a
          WHERE a.estado = 'vigente'::text
          GROUP BY a.contrato_id
        ), base AS (
         SELECT r.id,
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
            c.cerrado_en,
            c.cierre_observaciones,
            COALESCE(m.anexos, 0) AS anexos,
            COALESCE(m.monto_anexos, 0::bigint) AS monto_anexos,
            COALESCE(m.dias_anexos, 0) AS dias_anexos,
            m.ultimo_anexo,
                CASE
                    WHEN r.presupuesto IS NULL AND COALESCE(m.monto_anexos, 0::bigint) = 0 THEN NULL::bigint
                    ELSE COALESCE(r.presupuesto, 0::bigint) + COALESCE(m.monto_anexos, 0::bigint)
                END AS monto_vigente,
                CASE
                    WHEN m.fecha_fijada IS NOT NULL THEN GREATEST(m.fecha_fijada, r.termino)
                    ELSE r.termino + COALESCE(m.dias_anexos, 0)
                END AS termino_vigente
           FROM contratos_resumen r
             JOIN contratos c ON c.id = r.id
             LEFT JOIN movimientos m ON m.contrato_id = r.id
        )
 SELECT id,
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
        CASE
            WHEN estado = 'cancelado'::text THEN 'cancelado'::text
            WHEN estado = 'cerrado'::text THEN 'cerrado'::text
            WHEN inicio IS NOT NULL AND inicio > CURRENT_DATE THEN 'por-comenzar'::text
            WHEN termino_vigente < CURRENT_DATE THEN 'vencido'::text
            WHEN termino_vigente <= (CURRENT_DATE + 60) THEN 'por-vencer'::text
            ELSE 'vigente'::text
        END AS vigencia,
    termino_vigente - CURRENT_DATE AS dias_restantes,
        CASE
            WHEN inicio IS NOT NULL THEN termino_vigente - inicio
            ELSE NULL::integer
        END AS dias_plazo_total,
    cerrado_en,
    cierre_observaciones
   FROM base b;

-- ─── Resultado por anexo: la venta por valor del contrato ───────────────────
-- Un anexo "por valor" vende su monto completo, en el mes de su primer
-- movimiento (estado de pago o costo). Sus estados de pago ordinarios dejan de
-- contar como venta; los extraordinarios se suman encima.

create or replace view public.resultado_por_anexo
with (security_invoker = true) as
with por_valor as (
  select a.contrato_id, a.id as anexo_id, a.monto::bigint as venta,
         (select min(x.p) from (
            select e.periodo as p from public.estados_pago e
             where e.contrato_id = a.contrato_id and e.anexo_id = a.id
            union all
            select k.periodo from public.costos_unificados k
             where k.contrato_id = a.contrato_id and k.anexo_id = a.id
          ) x where x.p is not null) as periodo
    from public.anexos a
   where a.venta_por_valor and a.estado = 'vigente'
),
ventas_todas as (
  select e.contrato_id, e.anexo_id, e.periodo, sum(e.monto_neto)::bigint as venta
    from public.estados_pago e
   where e.anexo_id is null
      or e.tipo_edp = 'extraordinario'
      or not exists (select 1 from por_valor p where p.contrato_id = e.contrato_id and p.anexo_id = e.anexo_id)
   group by e.contrato_id, e.anexo_id, e.periodo
  union all
  select p.contrato_id, p.anexo_id, p.periodo, p.venta from por_valor p where p.periodo is not null
),
ventas as (
  select contrato_id, anexo_id, periodo, sum(venta)::bigint as venta
    from ventas_todas
   group by contrato_id, anexo_id, periodo
),
costos as (
  select k.contrato_id, k.anexo_id, k.periodo,
         sum(k.neto) filter (where k.tipo = 'ordinario')::bigint as costo,
         sum(k.neto) filter (where k.tipo = 'reembolsable')::bigint as reembolsable
    from public.costos_unificados k
   group by k.contrato_id, k.anexo_id, k.periodo
)
select
  coalesce(v.contrato_id, k.contrato_id) as contrato_id,
  coalesce(v.anexo_id, k.anexo_id) as anexo_id,
  coalesce(v.periodo, k.periodo) as periodo,
  coalesce(v.venta, 0)::bigint as venta,
  coalesce(k.costo, 0)::bigint as costo,
  coalesce(k.reembolsable, 0)::bigint as reembolsable,
  (coalesce(v.venta, 0) - coalesce(k.costo, 0))::bigint as margen
from ventas v
full join costos k
  on k.contrato_id = v.contrato_id
 and k.anexo_id is not distinct from v.anexo_id
 and k.periodo = v.periodo;

grant select on public.resultado_por_anexo to authenticated;

notify pgrst, 'reload schema';
