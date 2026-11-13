-- ============================================================================
-- 0121 — Registrar una cotización recibida de una vez, e índices que faltaban
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0120.
--
-- 1) REGISTRAR UNA COTIZACIÓN QUE LLEGÓ SIN HABERLA PEDIDO POR LA PLATAFORMA
--    (el proveedor la mandó por correo o se trajo de la calle). Era el mismo
--    problema que la 0120 arregló al pedir: la cabecera y después un insert por
--    ítem desde el navegador, con el código contando cotizaciones. Ahora va en
--    una transacción y el código lo decide la base.
--    A diferencia de `pedir_cotizacion`, no rechaza un proveedor que ya tiene
--    otra cotización en la solicitud: registrar una segunda es válido.
--
-- 2) ÍNDICES. Postgres no indexa solo las llaves foráneas. Estas cuatro se
--    usan para buscar (las facturas de una OC, los ítems de una recepción o de
--    una nota de crédito, las OC de una solicitud) y no tenían índice: cada
--    búsqueda recorría la tabla entera, y además borrar una OC o una recepción
--    revisaba fila por fila sus dependientes.
-- ============================================================================

-- ─── 1. El código y los ítems, compartidos por pedir y registrar ────────────

create or replace function interno.crear_cotizacion(p_cotizacion jsonb, p_items jsonb, p_proveedor_unico boolean)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_solped text := p_cotizacion->>'solped_id';
  prefijo text;
  siguiente integer;
  v_id text;
  item jsonb;
  n integer := 0;
begin
  if v_solped is null or coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Elige al menos un ítem para esta cotización.';
  end if;

  perform pg_advisory_xact_lock(hashtext('cot:' || coalesce(public.empresa_actual(), '') || ':' || v_solped));

  if p_proveedor_unico and exists (
    select 1 from public.cotizaciones c
     where c.solped_id = v_solped and c.proveedor_id = p_cotizacion->>'proveedor_id'
  ) then
    raise exception 'Ya se le pidió cotización a este proveedor para esta solicitud.';
  end if;

  prefijo := 'COT-' || v_solped || '-';
  select coalesce(max(substring(c.id from length(prefijo) + 1)::integer), 0) + 1
    into siguiente
    from public.cotizaciones c
   where c.solped_id = v_solped
     and c.id like prefijo || '%'
     and substring(c.id from length(prefijo) + 1) ~ '^\d+$';
  v_id := prefijo || lpad(siguiente::text, 2, '0');

  perform interno.insertar_fila('cotizaciones', p_cotizacion || jsonb_build_object('id', v_id));

  for item in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    perform interno.insertar_fila('cotizacion_items',
      item || jsonb_build_object('id', v_id || '-' || lpad(n::text, 3, '0'), 'cotizacion_id', v_id));
  end loop;

  return v_id;
end;
$$;

revoke all on function interno.crear_cotizacion(jsonb, jsonb, boolean) from public, anon;
grant execute on function interno.crear_cotizacion(jsonb, jsonb, boolean) to authenticated;

/* Pedir: igual que en la 0120, ahora sobre el ayudante común. */
create or replace function public.pedir_cotizacion(p_cotizacion jsonb, p_items jsonb)
returns text
language sql
security invoker
set search_path = public
as $$
  select interno.crear_cotizacion(p_cotizacion, p_items, true);
$$;

/* Registrar una que llegó por fuera. */
create or replace function public.registrar_cotizacion(p_cotizacion jsonb, p_items jsonb)
returns text
language sql
security invoker
set search_path = public
as $$
  select interno.crear_cotizacion(p_cotizacion, p_items, false);
$$;

revoke all on function public.pedir_cotizacion(jsonb, jsonb) from public, anon;
grant execute on function public.pedir_cotizacion(jsonb, jsonb) to authenticated;
revoke all on function public.registrar_cotizacion(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_cotizacion(jsonb, jsonb) to authenticated;

-- ─── 2. Índices en llaves foráneas que se usan para buscar ──────────────────

create index if not exists compras_orden_idx
  on public.compras (empresa_id, orden_id) where orden_id is not null;

create index if not exists recepcion_items_recepcion_idx
  on public.recepcion_items (empresa_id, recepcion_id);

create index if not exists nota_credito_items_nota_idx
  on public.nota_credito_items (empresa_id, nota_id);

create index if not exists ordenes_compra_proveedor_solped_idx
  on public.ordenes_compra_proveedor (empresa_id, solped_id) where solped_id is not null;

create index if not exists ordenes_compra_proveedor_cotizacion_idx
  on public.ordenes_compra_proveedor (empresa_id, cotizacion_id) where cotizacion_id is not null;

notify pgrst, 'reload schema';
