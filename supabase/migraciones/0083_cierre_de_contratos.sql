-- ════════════════════════════════════════════════════════════════════════════
-- 0083 — Cierre de contratos y estados por calendario
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy un contrato "se cerraba solo" cuando pasaba su fecha de término, y
-- uno que aún no empezaba podía salir como "Por vencer". Ahora:
--
--   · Cerrar es una ACCIÓN: `estado = 'cerrado'` (con fecha y observaciones).
--     No borra nada: ingresos, costos y finiquitos quedan donde estaban.
--   · La vigencia se calcula así, en este orden:
--       cancelado     se marcó cancelado
--       cerrado       se cerró a mano → pasa a la vista de contratos cerrados
--       por-comenzar  su inicio todavía no llega
--       vencido       pasó su término y nadie lo cerró (sigue entre los vigentes)
--       por-vencer    le quedan 60 días o menos
--       vigente       el resto

alter table public.contratos
  add column if not exists cerrado_en date,
  add column if not exists cierre_observaciones text;

alter table public.contratos drop constraint if exists contratos_estado_check;
alter table public.contratos
  add constraint contratos_estado_check check (estado in ('activo', 'cancelado', 'cerrado'));

comment on column public.contratos.estado is
  'activo = la vigencia sale de las fechas. cancelado = terminó antes de tiempo. '
  'cerrado = se cerró a mano y pasó al cierre económico (0083).';

create or replace view public.contratos_detalle
with (security_invoker = true) as
 WITH movimientos AS (
         SELECT a.contrato_id,
            count(*)::integer AS anexos,
            COALESCE(sum(a.monto), 0::numeric)::bigint AS monto_anexos,
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

notify pgrst, 'reload schema';
