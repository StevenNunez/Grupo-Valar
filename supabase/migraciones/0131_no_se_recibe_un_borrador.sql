-- ════════════════════════════════════════════════════════════════════════════
-- 0131 — No se recibe contra una orden en borrador o anulada
-- ════════════════════════════════════════════════════════════════════════════
--
-- Al probar la 0130 en el demo (25-11-2026), la base aceptó una recepción
-- contra OC22-001130, que está en BORRADOR. Nunca lo impidió, tampoco para la
-- recepción normal: la pantalla de Órdenes no ofrece recibir un borrador, pero
-- «Ya lo recibí yo» desde la solicitud muestra las órdenes de la solicitud y
-- conviene que la regla viva en la base. Lo que ya se recibió no se toca.
--
-- Misma función que la 0130 (misma firma), con el control del estado.
-- Se puede volver a correr.

create or replace function public.registrar_recepcion(
  p_orden_id text,
  p_fecha date,
  p_guia text,
  p_recibido_por text,
  p_observaciones text,
  p_lineas jsonb,
  p_fuera_de_ciclo boolean default false,
  p_motivo text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  nueva uuid;
  contrato text;
  estado_orden text;
  numero_orden text;
begin
  if not exists (select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric) where x.cantidad > 0) then
    raise exception 'Anota cuánto llegó de al menos una línea.' using errcode = 'check_violation';
  end if;

  select o.contrato_id, o.estado, o.numero into contrato, estado_orden, numero_orden
    from public.ordenes_compra_proveedor o
   where o.empresa_id = public.empresa_actual() and o.id = p_orden_id;
  if not found then
    raise exception 'No se encontró la orden %.', p_orden_id;
  end if;
  -- Un borrador todavía no es una compra (falta autorizarlo y mandarlo), y una anulada ya no lo es.
  if estado_orden = 'borrador' then
    raise exception 'La orden % está en borrador: todavía no se le compra al proveedor, no hay nada que recibir.', numero_orden using errcode = 'check_violation';
  elsif estado_orden = 'anulada' then
    raise exception 'La orden % está anulada: no se puede recibir.', numero_orden using errcode = 'check_violation';
  end if;

  if coalesce(p_fuera_de_ciclo, false) then
    if char_length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Cuenta por qué se recibe por fuera del ciclo normal (al menos 10 caracteres).' using errcode = 'check_violation';
    end if;
    if not (public.puede('recepcion.directa', contrato) or public.puede('recepcion.registrar', contrato) or public.puede('gestion.editar', contrato)) then
      raise exception 'No tienes permiso para recibir fuera del ciclo en este contrato.' using errcode = 'insufficient_privilege';
    end if;
  elsif not (public.puede('recepcion.registrar', contrato) or public.puede('gestion.editar', contrato)) then
    raise exception 'No tienes permiso para registrar recepciones en este contrato.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.recepciones (orden_id, contrato_id, fecha, guia_despacho, recibido_por, observaciones, fuera_de_ciclo, motivo_fuera_de_ciclo)
  values (p_orden_id, '', coalesce(p_fecha, current_date), nullif(btrim(p_guia), ''),
          nullif(btrim(p_recibido_por), ''), nullif(btrim(p_observaciones), ''),
          coalesce(p_fuera_de_ciclo, false),
          case when coalesce(p_fuera_de_ciclo, false) then btrim(p_motivo) end)
  returning id into nueva;

  insert into public.recepcion_items (recepcion_id, item_id, contrato_id, cantidad)
  select nueva, x.item_id, '', x.cantidad
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0;

  return nueva;
end;
$$;


notify pgrst, 'reload schema';
