-- ============================================================================
-- 0120 — Crear la OC desde una cotización, y pedir una cotización, de una vez
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0119.
--
-- POR QUÉ. Las dos operaciones se hacían desde el navegador en varios pasos: la
-- cabecera, y después un insert por cada ítem. Si la conexión se cortaba en el
-- ítem 4 de 9, quedaba una OC con un total menor al decidido —y ese es el costo
-- que llega al contrato— o una cotización pedida con la mitad de los ítems.
-- Además, el código interno se calculaba en el navegador (contando las
-- cotizaciones de la solicitud): dos personas a la vez, o una cotización
-- borrada, daban el mismo código y la segunda fallaba.
--
-- AHORA. Cada operación es una sola función: o se guarda todo o no se guarda
-- nada. El código interno se decide adentro, con un candado por solicitud (o
-- por número de OC), así que dos pedidos simultáneos no chocan.
--
-- PERMISOS. Las funciones son `security invoker`: cada insert pasa por las
-- mismas políticas RLS que si se hiciera desde la pantalla. No dan acceso a
-- nada que la persona no tuviera. El ayudante de inserción vive en el esquema
-- `interno`, que la API no publica.
-- ============================================================================

create schema if not exists interno;
grant usage on schema interno to authenticated;

/* Inserta una fila armada como JSON, usando solo las columnas que trae: lo que
   no viene toma el valor por defecto de la tabla (empresa_id, autoría, fechas).
   Con `jsonb_populate_record` a secas, esas columnas quedarían en null. */
create or replace function interno.insertar_fila(tabla text, fila jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  columnas text;
begin
  if tabla not in ('ordenes_compra_proveedor', 'items_compra', 'cotizaciones', 'cotizacion_items') then
    raise exception 'insertar_fila: tabla no permitida (%)', tabla;
  end if;

  select string_agg(quote_ident(k), ', ') into columnas from jsonb_object_keys(fila) as k;

  execute format(
    'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)',
    tabla, columnas
  ) using fila;
end;
$$;

revoke all on function interno.insertar_fila(text, jsonb) from public, anon;
grant execute on function interno.insertar_fila(text, jsonb) to authenticated;

-- ─── OC desde una cotización ────────────────────────────────────────────────
--
-- p_orden   la cabecera, con `id` = el código base (OCP-<contrato>-<6 dígitos>)
-- p_items   las líneas, sin `id` ni `orden_id`; la del flete con "es_flete": true
-- p_solped  la solicitud, que pasa a "en-compra"
--
-- Devuelve el código con que quedó la orden (el base, o el base con -2, -3…
-- si otro número de OC ya lo usaba).

create or replace function public.crear_orden_desde_cotizacion(p_orden jsonb, p_items jsonb, p_solped text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  base text := p_orden->>'id';
  v_id text;
  previa text;
  sufijo integer := 2;
  item jsonb;
  n integer := 0;
begin
  if base is null or coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'La orden no trae ítems.';
  end if;

  -- Dos órdenes con el mismo código base, a la vez: la segunda espera a la primera.
  perform pg_advisory_xact_lock(hashtext('ocp:' || coalesce(public.empresa_actual(), '') || ':' || base));

  select o.id into previa
    from public.ordenes_compra_proveedor o
   where (o.id = base or o.id like base || '-%')
     and o.numero = p_orden->>'numero'
   limit 1;
  if previa is not null then
    raise exception 'Ya existe la orden % (%). Si quedó a medias de un intento anterior, ábrela en Órdenes de compra; si no, usa otro número.',
      p_orden->>'numero', previa;
  end if;

  v_id := base;
  while exists (select 1 from public.ordenes_compra_proveedor where id = v_id) loop
    v_id := base || '-' || sufijo;
    sufijo := sufijo + 1;
  end loop;

  perform interno.insertar_fila('ordenes_compra_proveedor', p_orden || jsonb_build_object('id', v_id));

  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'es_flete')::boolean, false) then
      perform interno.insertar_fila('items_compra',
        (item - 'es_flete') || jsonb_build_object('id', 'IT-' || v_id || '-FLETE', 'orden_id', v_id));
    else
      n := n + 1;
      perform interno.insertar_fila('items_compra',
        (item - 'es_flete') || jsonb_build_object('id', 'IT-' || v_id || '-' || lpad(n::text, 3, '0'), 'orden_id', v_id));
    end if;
  end loop;

  update public.solped set estado = 'en-compra' where id = p_solped;

  return v_id;
end;
$$;

revoke all on function public.crear_orden_desde_cotizacion(jsonb, jsonb, text) from public, anon;
grant execute on function public.crear_orden_desde_cotizacion(jsonb, jsonb, text) to authenticated;

-- ─── Pedir una cotización ───────────────────────────────────────────────────
--
-- p_cotizacion  la cabecera, sin `id` (lleva solped_id, proveedor_id, numero…)
-- p_items       lo que se le pide, sin `id` ni `cotizacion_id`
--
-- Devuelve el código: COT-<solped>-NN, el siguiente al mayor que ya exista
-- (no la cantidad: si se borró una, contar repetía un código).

create or replace function public.pedir_cotizacion(p_cotizacion jsonb, p_items jsonb)
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
    raise exception 'Elige al menos un ítem para pedirle a este proveedor.';
  end if;

  perform pg_advisory_xact_lock(hashtext('cot:' || coalesce(public.empresa_actual(), '') || ':' || v_solped));

  if exists (
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

revoke all on function public.pedir_cotizacion(jsonb, jsonb) from public, anon;
grant execute on function public.pedir_cotizacion(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
