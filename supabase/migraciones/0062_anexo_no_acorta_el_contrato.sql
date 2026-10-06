-- ============================================================================
-- 0062 — Un anexo alarga el contrato, pero nunca lo acorta
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0061.
--
-- Pasó el 06-10-2026: Misceláneos (9500013862) termina el 28-02-2027, pero
-- salía "cerrado". Su Anexo N°2 (Carpas) trae nueva fecha de término
-- 30-09-2026 —el fin de ese anexo, no del contrato— y la vista tomaba
-- cualquier fecha fijada por un anexo como el término del contrato, aunque
-- fuera ANTERIOR.
--
-- Ahora: si algún anexo vigente fija una fecha, rige la mayor entre esa y el
-- término del contrato. Un contrato que termina antes de tiempo se marca
-- "cancelado" en el contrato (0047), no con un anexo. Sin fecha fijada, siguen
-- sumando los días de plazo de los anexos, como antes.
--
-- Solo cambia la expresión de termino_vigente: mismas columnas y tipos.
-- ============================================================================

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
            WHEN termino_vigente < CURRENT_DATE THEN 'cerrado'::text
            WHEN termino_vigente <= (CURRENT_DATE + 60) THEN 'por-vencer'::text
            ELSE 'vigente'::text
        END AS vigencia,
    termino_vigente - CURRENT_DATE AS dias_restantes,
        CASE
            WHEN inicio IS NOT NULL THEN termino_vigente - inicio
            ELSE NULL::integer
        END AS dias_plazo_total
   FROM base b;

notify pgrst, 'reload schema';
