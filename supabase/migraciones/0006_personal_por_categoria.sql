-- ============================================================================
-- Plataforma Valar — El costo de personal admite varias categorías por mes
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0005.
--
-- POR QUÉ: `costos_personal` nació con "una fila por contrato y mes", cuando el
-- personal era un solo número. Las planillas de Valar lo separan en dos líneas
-- que se controlan aparte:
--
--   Personal  → la dotación contratada, con su presupuesto mensual
--   HH Extra  → horas fuera de contrato, con su motivo y su propio costo
--
-- Con la restricción vieja, cargar las dos rompía. Ahora la unicidad incluye la
-- categoría: sigue sin poder repetirse la misma categoría dos veces en el mismo
-- mes, que es lo que de verdad hay que impedir.
-- ============================================================================

alter table public.costos_personal
  drop constraint if exists costos_personal_contrato_id_periodo_key;

-- Índice único parcial en vez de constraint: `categoria_id` puede venir nulo
-- mientras un contrato no tenga sus categorías cargadas, y en Postgres los
-- nulos no chocan entre sí dentro de un UNIQUE normal.
drop index if exists costos_personal_unico_idx;
create unique index costos_personal_unico_idx
  on public.costos_personal (contrato_id, periodo, categoria_id)
  where categoria_id is not null;

drop index if exists costos_personal_sin_categoria_idx;
create unique index costos_personal_sin_categoria_idx
  on public.costos_personal (contrato_id, periodo)
  where categoria_id is null;

comment on index public.costos_personal_unico_idx is
  'Una fila por contrato, mes y categoría: Personal y HH Extra conviven en el mismo mes.';

-- ─── Motivo de las horas extra ──────────────────────────────────────────────
-- La planilla desglosa las HH Extra por causa: reemplazo por vacaciones o
-- licencias, parada de planta, feriado compensado, apoyo oficina. Saber cuánto
-- se fue en cada una es lo que permite discutirlas con el mandante.

alter table public.costos_personal
  add column if not exists motivo text
    check (motivo is null or motivo in (
      'reemplazo', 'parada-planta', 'feriado-compensado', 'apoyo-oficina', 'otro'
    ));

comment on column public.costos_personal.motivo is
  'Solo para líneas de HH Extra. En la dotación base va nulo.';
