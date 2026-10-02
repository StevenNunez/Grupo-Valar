-- ============================================================================
-- Plataforma Valar — La SOLPED se queda con su propio número
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0017.
--
-- POR QUÉ: la 0015 le puso a la solicitud la numeración del mandante —SA, GR,
-- RQM, V°B° NA-LITIO— copiándola del formato en papel. El usuario lo corrigió:
-- el número de requerimiento ya es el número de la SOLPED, y el SA identifica
-- un servicio del mandante, no un pedido de materiales. Mezclarlos obliga a
-- teclear dos veces lo mismo y a decidir cuál manda cuando no coinciden.
--
-- Si mañana hace falta amarrar una compra a un servicio del mandante, el lugar
-- es el contrato o el estado de pago, no la solicitud de materiales.
--
-- Las columnas se eliminan, no se dejan sin usar: una columna vacía que nadie
-- llena termina llenándose sola de datos inventados.
-- ============================================================================

-- Las vistas dependen de `sa`, así que hay que soltarlas antes de tocar la
-- tabla y volver a crearlas después. `cascade` no hace falta: son estas dos.

drop view if exists public.expediente_solped;
drop view if exists public.solped_resumen;

alter table public.solped drop column if exists sa;
alter table public.solped drop column if exists numero_gr;
alter table public.solped drop column if exists numero_rqm;
alter table public.solped drop column if exists vb_na_litio;

-- ─── Se rehacen las dos vistas, iguales pero sin esas columnas ──────────────

create view public.solped_resumen
with (security_invoker = true) as
  select
    s.id,
    s.numero,
    s.contrato_id,
    c.nombre as contrato,
    s.solicitante_nombre,
    s.solicitante_cargo,
    s.area,
    s.fecha_emision,
    s.fecha_requerida,
    s.tipo_gasto,
    s.prioridad,
    s.estado,
    count(i.id)::int as items,
    coalesce(sum(i.cantidad), 0)::numeric as cantidad_pedida,
    coalesce(sum(ic.cantidad), 0)::numeric as cantidad_comprada,
    coalesce(sum(ic.cantidad_recibida), 0)::numeric as cantidad_recibida,
    coalesce(sum(ic.neto), 0)::bigint as comprado_neto,
    (current_date - s.fecha_emision)::int as dias_abierta
  from public.solped s
  join public.contratos c on c.id = s.contrato_id
  left join public.solped_items i on i.solped_id = s.id
  left join public.items_compra ic on ic.solped_item_id = i.id
  group by s.id, c.nombre;

comment on view public.solped_resumen is
  'Una fila por SOLPED con su avance deducido de los ítems comprados y recibidos.';

grant select on public.solped_resumen to authenticated;

create view public.expediente_solped
with (security_invoker = true) as
  with avance as (
    select
      a.solped_id,
      count(*)::int as items,
      count(*) filter (where a.estado = 'pendiente')::int as items_pendientes,
      count(*) filter (where a.estado = 'cotizado')::int as items_cotizados,
      count(*) filter (where a.estado in ('comprado', 'comprado-parcial'))::int as items_comprados,
      count(*) filter (where a.estado = 'recibido')::int as items_recibidos,
      coalesce(sum(a.cantidad_pedida), 0)::numeric as cantidad_pedida,
      coalesce(sum(a.cantidad_comprada), 0)::numeric as cantidad_comprada,
      coalesce(sum(a.cantidad_recibida), 0)::numeric as cantidad_recibida,
      coalesce(sum(a.comprado_neto), 0)::bigint as comprado_neto
    from public.solped_items_avance a
    group by a.solped_id
  ),
  cotiz as (
    select
      c.solped_id,
      count(*)::int as cotizaciones,
      count(*) filter (where c.recibida_en is not null)::int as cotizaciones_recibidas,
      min(cc.costo_puesto) filter (where c.recibida_en is not null)::bigint as mejor_costo,
      max(cc.costo_puesto) filter (where c.recibida_en is not null)::bigint as peor_costo,
      max(cc.costo_puesto) filter (where c.seleccionada)::bigint as costo_elegido
    from public.cotizaciones c
    join public.comparativo_cotizaciones cc on cc.id = c.id
    group by c.solped_id
  ),
  ordenes as (
    select
      o.solped_id,
      count(*)::int as ordenes,
      count(*) filter (where o.estado in ('emitida', 'parcial'))::int as ordenes_abiertas
    from public.ordenes_compra_proveedor o
    where o.solped_id is not null
    group by o.solped_id
  ),
  firmas as (
    select
      ap.registro_id,
      count(*) filter (where ap.accion = 'aprobado')::int as aprobaciones,
      max(ap.ocurrido_en) as ultima_firma
    from public.aprobaciones ap
    where ap.documento = 'solped'
    group by ap.registro_id
  )
  select
    s.id,
    s.numero,
    s.version,
    s.contrato_id,
    c.nombre as contrato,
    s.solicitante_nombre,
    s.solicitante_cargo,
    s.area,
    s.tipo_gasto,
    s.prioridad,
    s.estado,
    s.fecha_emision,
    s.fecha_requerida,
    (current_date - s.fecha_emision)::int as dias_abierta,
    coalesce(a.items, 0) as items,
    coalesce(a.items_pendientes, 0) as items_pendientes,
    coalesce(a.items_cotizados, 0) as items_cotizados,
    coalesce(a.items_comprados, 0) as items_comprados,
    coalesce(a.items_recibidos, 0) as items_recibidos,
    coalesce(a.cantidad_pedida, 0) as cantidad_pedida,
    coalesce(a.cantidad_comprada, 0) as cantidad_comprada,
    coalesce(a.cantidad_recibida, 0) as cantidad_recibida,
    coalesce(a.comprado_neto, 0) as comprado_neto,
    coalesce(k.cotizaciones, 0) as cotizaciones,
    coalesce(k.cotizaciones_recibidas, 0) as cotizaciones_recibidas,
    k.mejor_costo,
    k.peor_costo,
    k.costo_elegido,
    case
      when k.costo_elegido is not null and k.mejor_costo is not null
      then (k.mejor_costo - k.costo_elegido)::bigint
    end as diferencia_vs_mejor,
    coalesce(o.ordenes, 0) as ordenes,
    coalesce(o.ordenes_abiertas, 0) as ordenes_abiertas,
    coalesce(f.aprobaciones, 0) as aprobaciones,
    f.ultima_firma
  from public.solped s
  join public.contratos c on c.id = s.contrato_id
  left join avance a on a.solped_id = s.id
  left join cotiz k on k.solped_id = s.id
  left join ordenes o on o.solped_id = s.id
  left join firmas f on f.registro_id = s.id;

comment on view public.expediente_solped is
  'El ciclo completo de una solicitud en una fila: pedido, cotizado, comprado, recibido y firmado.';

grant select on public.expediente_solped to authenticated;

notify pgrst, 'reload schema';
