-- ============================================================================
-- Plataforma Valar — Corregir nombres de una solicitud sin devolverla a aprobación
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0106.
--
-- EL PROBLEMA: la 0016 devuelve a «en aprobación» (y sube la versión) cualquier
-- solicitud aprobada cuyos ítems cambien. Pero el formulario de edición guarda
-- TODAS las líneas, hayan cambiado o no, así que abastecimiento no podía
-- corregir un nombre mal escrito sin que la solicitud volviera a la fila de
-- aprobación — aunque lo único que cambiara fuera una tilde. Con la 0105,
-- además, eso disparaba un aviso nuevo de «Solicitud por aprobar».
--
-- LA REGLA NUEVA: una firma vale para lo que se firmó, y lo que se firma es la
-- NECESIDAD (qué, cuánto, en qué unidad, de qué categoría). Entonces:
--
--   · agregar o quitar un ítem                         → reabre (como antes)
--   · cambiar cantidad, unidad, categoría o el
--     artículo del catálogo                            → reabre (como antes)
--   · cambiar solo el NOMBRE (descripción), la
--     observación, el orden o el enlace a Pagnol       → NO reabre
--   · guardar sin cambiar nada                         → NO reabre
--
-- El cambio de nombre igual queda en la bitácora de auditoría (trigger
-- `registrar_auditoria` de la tabla), con antes y después.
-- ============================================================================

create or replace function public.reabrir_solped_modificada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cual text := coalesce(new.solped_id, old.solped_id);
  estado_actual text;
begin
  /* Una corrección que no toca la necesidad no reabre nada. `is distinct from`
     para que un null no esconda un cambio. */
  if tg_op = 'UPDATE'
     and new.solped_id is not distinct from old.solped_id
     and new.cantidad is not distinct from old.cantidad
     and new.unidad is not distinct from old.unidad
     and new.categoria_id is not distinct from old.categoria_id
     and new.articulo_id is not distinct from old.articulo_id then
    return new;
  end if;

  select estado into estado_actual from public.solped where id = cual;

  /* Solo importa mientras esté aprobada y todavía no se haya comprado nada.
     Después de que hay órdenes emitidas, cambiar la solicitud es otro problema
     —el de la orden— y devolverla a aprobación no arreglaría nada. */
  if estado_actual in ('aprobada', 'en-cotizacion', 'cotizada') then
    update public.solped
    set estado = 'en-aprobacion',
        version = version + 1
    where id = cual;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.reabrir_solped_modificada() is
  'Devuelve a aprobación una solicitud ya aprobada cuando cambia la necesidad (ítems, cantidad, unidad, categoría o artículo). Corregir un nombre u observación no la reabre.';
