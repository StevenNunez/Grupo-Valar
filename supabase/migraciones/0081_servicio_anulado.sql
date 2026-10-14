-- ════════════════════════════════════════════════════════════════════════════
-- 0081 — Un servicio también se puede anular
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las compras aceptan `anulada` desde 0026; los servicios no, aunque la vista
-- de costo ya las ignora desde 0077. Se iguala: pendiente, pagada o anulada.

alter table public.servicios drop constraint if exists servicios_estado_pago_check;
alter table public.servicios add constraint servicios_estado_pago_check
  check (estado_pago in ('pendiente', 'pagada', 'anulada'));
