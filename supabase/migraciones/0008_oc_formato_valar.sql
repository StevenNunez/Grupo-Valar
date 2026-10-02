-- ============================================================================
-- Plataforma Valar — La OC con el formato que Valar ya usa
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0007.
--
-- Sale de leer las 114 órdenes reales (OC22-001015 a OC22-001128). La OC que
-- emite la plataforma tiene que poder imprimirse igual a la que el proveedor
-- ya conoce, así que faltaban los datos del proveedor y las tres firmas.
-- ============================================================================

-- ─── Datos del proveedor que van impresos ───────────────────────────────────

alter table public.ordenes_compra_proveedor
  add column if not exists direccion_proveedor text;
alter table public.ordenes_compra_proveedor
  add column if not exists ciudad_proveedor text;
alter table public.ordenes_compra_proveedor
  add column if not exists comuna_proveedor text;
alter table public.ordenes_compra_proveedor
  add column if not exists telefono_contacto text;

-- ─── Las tres personas de la OC ─────────────────────────────────────────────
-- En el formato de Valar son campos distintos y cada uno responde por lo suyo:
-- quién la pidió, quién retira la mercadería y quién la autoriza.

alter table public.ordenes_compra_proveedor
  add column if not exists solicitado_por text;
alter table public.ordenes_compra_proveedor
  add column if not exists retira text;
alter table public.ordenes_compra_proveedor
  add column if not exists autorizado_por text;

/* El proyecto tal como se imprime: "PROYECTO RQ4050 (Salar de Atacama)". Va
   aparte del contrato porque el mandante lo identifica con su propio código, y
   es ese el que el proveedor tiene que ver. */
alter table public.ordenes_compra_proveedor
  add column if not exists proyecto text;

-- ─── El correlativo ─────────────────────────────────────────────────────────
/*
  El número lo escribe quien emite la OC —así se puede respetar una numeración
  que ya viene de antes o corregir un salto—, pero la plataforma le propone el
  siguiente de la serie para que no haya que ir a buscar cuál fue el último.

  Formato en uso: OC22-001128. El prefijo se conserva y solo avanza la parte
  numérica, manteniendo el relleno de ceros.
*/
create or replace function public.siguiente_numero_oc()
returns text
language plpgsql
stable
as $$
declare
  ultimo text;
  prefijo text;
  correlativo text;
begin
  select numero into ultimo
  from public.ordenes_compra_proveedor
  where numero ~ '^[A-Za-z]+[0-9]*-[0-9]+$'
  order by
    -- Ordena por el número, no por el texto: "OC22-9" no puede ganarle a
    -- "OC22-001128" solo porque "9" > "0" en orden alfabético.
    (regexp_replace(numero, '^.*-', ''))::bigint desc
  limit 1;

  if ultimo is null then
    return 'OC22-001129';
  end if;

  prefijo := substring(ultimo from '^(.*-)');
  correlativo := regexp_replace(ultimo, '^.*-', '');

  return prefijo || lpad(
    ((correlativo)::bigint + 1)::text,
    length(correlativo),
    '0'
  );
end;
$$;

comment on function public.siguiente_numero_oc is
  'Propone el número siguiente de la serie. Es una sugerencia: el campo se puede editar.';

-- ─── La cantidad recibida no puede pasarse de la pedida ─────────────────────
-- Recibir 12 de 10 unidades es un error de tipeo, no un dato.

alter table public.items_compra
  drop constraint if exists items_recibida_no_supera_pedida;
alter table public.items_compra
  add constraint items_recibida_no_supera_pedida
    check (cantidad_recibida <= cantidad);
