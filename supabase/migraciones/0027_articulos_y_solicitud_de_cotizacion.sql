-- ============================================================================
-- Plataforma Valar — Maestro de artículos y solicitud de cotización
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0026.
--
-- DOS PROBLEMAS, UNO DETRÁS DEL OTRO.
--
-- 1. FAENA Y EL PROVEEDOR NO HABLAN EL MISMO IDIOMA. Faena pide "lentes de
--    seguridad oscuros" y el proveedor cotiza "LENTE MAX FENIX IN OUT". Hoy
--    cada solicitud se escribe a mano, así que ese nombre técnico —el único con
--    el que el proveedor sabe qué mandar— se aprende y se pierde en cada
--    compra, y la siguiente solicitud vuelve a decir "lentes oscuros".
--
--    Se resuelve con un maestro de artículos con LOS DOS nombres, más una tabla
--    de equivalencias por proveedor: cómo le llama cada uno y a qué precio lo
--    vendió la última vez. Eso último no es adorno: es lo que hace que el
--    lector de cotizaciones en PDF reconozca el artículo la segunda vez, y lo
--    que permite ver si un precio subió antes de aceptarlo.
--
--    Los códigos son los de sus propias planillas de bodega (EPP-LEN-02,
--    HM-009, OX-004, EQ-ESM45-01), no una numeración nueva: quien busca en
--    bodega y quien busca en la plataforma tienen que encontrar lo mismo.
--
-- 2. NO SE PUEDE PEDIR COTIZACIÓN. La solicitud de cotización que Valar manda
--    hoy es un Excel que se arma a mano (SOLCOT 000001). No hacía falta una
--    tabla nueva para esto: `cotizaciones` con estado 'solicitada' y sin
--    `recibida_en` YA ES la solicitud enviada, y `cotizacion_items` dice qué se
--    le pidió a ese proveedor. Lo que faltaba es que se pudieran crear con
--    SOLO ALGUNOS ítems —no toda la solicitud se compra al mismo— y que la
--    SOLPED pasara a "en cotización" al mandarla, que es cuando de verdad se
--    está esperando una respuesta.
--
-- EL STOCK QUE SE GUARDA ES UNA FOTO, NO UN INVENTARIO. `stock_actual` y
-- `stock_minimo` vienen de la última toma de bodega y sirven para avisar al
-- pedir. Acá no hay movimientos de entrada y salida: decir que hay inventario
-- en vivo cuando nadie descuenta al despachar es peor que no tenerlo.
-- ============================================================================

-- ─── 1. El maestro de artículos ─────────────────────────────────────────────

create table if not exists public.articulos (
  /* El código interno de bodega: "EPP-LEN-02", "HM-009", "OX-004". */
  id text primary key,

  /* Como lo pide faena. Es el nombre con el que alguien lo busca. */
  nombre text not null,

  /* Como lo vende el proveedor: "LENTE MAX FENIX IN OUT". Es el nombre con el
     que se pide, porque es el único que el proveedor entiende sin preguntar. */
  nombre_tecnico text,

  /* Talla, medida, modelo: "XL", "5 mts", "NX-2". Aparte del nombre porque el
     mismo artículo viene en varias y no son artículos distintos. */
  especificacion text,

  unidad text not null default 'un',

  familia text not null default 'insumos'
    check (familia in ('epp', 'herramientas', 'equipos', 'oxicorte', 'insumos', 'servicios')),

  /* La última toma de bodega. Ver la nota de arriba: es una foto. */
  stock_actual numeric(12, 2),
  stock_minimo numeric(12, 2),

  /* A qué categoría de costo suele caer. Se propone al armar la solicitud, para
     que nadie tenga que acordarse. */
  categoria_sugerida_id text references public.categorias_costo (id) on delete set null,

  activo boolean not null default true,
  observaciones text,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null
);

comment on table public.articulos is
  'Qué compra Valar. Los códigos son los de sus planillas de bodega, para que buscar en bodega y buscar acá den lo mismo.';
comment on column public.articulos.nombre is
  'Como lo pide faena: "Lentes de seguridad oscuros".';
comment on column public.articulos.nombre_tecnico is
  'Como lo vende el proveedor: "LENTE MAX FENIX IN OUT". Es lo que se imprime en la solicitud de cotización.';
comment on column public.articulos.stock_actual is
  'Última toma de bodega. No es un inventario en vivo: nadie descuenta al despachar.';

create index if not exists articulos_nombre_idx on public.articulos (lower(nombre));
create index if not exists articulos_familia_idx on public.articulos (familia, activo);

-- ─── 2. Cómo le llama cada proveedor ────────────────────────────────────────
-- Un artículo, varios proveedores, un nombre distinto en cada uno. Sin esta
-- tabla, aprender el nombre técnico de uno pisaría el del otro.

create table if not exists public.articulo_proveedor (
  id text primary key,                                   -- "AP-EPP-LEN-02-PRV-0012"
  articulo_id text not null references public.articulos (id) on delete cascade,
  proveedor_id text not null references public.proveedores (id) on delete cascade,

  /* Cómo aparece escrito en SU cotización. Es con lo que el lector de PDF lo
     reconoce la próxima vez sin tener que adivinar por parecido. */
  nombre_proveedor text not null,
  sku text,

  /* Lo último que cobró, y cuándo. Sirve para ver si un precio subió antes de
     aceptarlo, que es la pregunta que nadie alcanza a hacerse al cotizar. */
  ultimo_precio bigint check (ultimo_precio >= 0),
  ultima_fecha date,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (articulo_id, proveedor_id)
);

comment on table public.articulo_proveedor is
  'Equivalencias: cómo le llama cada proveedor al mismo artículo, y a cuánto lo vendió la última vez.';

create index if not exists articulo_proveedor_prov_idx
  on public.articulo_proveedor (proveedor_id);

-- ─── 3. El ítem de la solicitud apunta al maestro ───────────────────────────
-- Opcional a propósito: siempre va a haber una compra rara que no está en el
-- catálogo, y obligar a crear un artículo para pedir un repuesto único es la
-- forma más rápida de que el catálogo se llene de basura.

alter table public.solped_items
  add column if not exists articulo_id text
    references public.articulos (id) on delete set null;

comment on column public.solped_items.articulo_id is
  'Qué artículo del maestro es. Nulo cuando se pidió algo que no está en el catálogo.';

create index if not exists solped_items_articulo_idx on public.solped_items (articulo_id);

-- ─── 4. La solicitud de cotización ──────────────────────────────────────────
-- No hay tabla nueva: una cotización en estado 'solicitada' y sin `recibida_en`
-- ES la solicitud que se le mandó al proveedor, y sus `cotizacion_items` son lo
-- que se le pidió A ÉL. Lo que faltaba es el número con que se identifica.

comment on column public.cotizaciones.numero is
  'Correlativo de la solicitud de cotización: SC-0001. Es lo que se imprime y lo que el proveedor menciona al responder.';
comment on column public.cotizaciones.solicitada_en is
  'Cuándo se le mandó la solicitud. Contra `recibida_en` da el tiempo de respuesta del proveedor.';

/* El precio deja de ser obligatorio en la práctica: una solicitud recién
   enviada tiene todos sus ítems en cero, y eso no es un error sino su estado
   normal mientras el proveedor no responde. La columna ya admitía 0; esto solo
   lo deja escrito para el que lea la tabla. */
comment on column public.cotizacion_items.precio_unitario is
  'Cero mientras el proveedor no responde: una solicitud enviada nace sin precios.';

-- ─── 5. La SOLPED pasa a "en cotización" al mandarla ────────────────────────
-- Estaba en la aplicación. Acá vale siempre, venga de la pantalla, de un script
-- o de una carga a mano: el estado es del dato, no de quien lo tocó.

create or replace function public.marcar_solped_en_cotizacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.solped
  set estado = 'en-cotizacion'
  where id = new.solped_id
    and estado = 'aprobada';
  return new;
end;
$$;

comment on function public.marcar_solped_en_cotizacion() is
  'Mandar una solicitud de cotización deja la SOLPED "en cotización": desde ahí se está esperando a un tercero.';

drop trigger if exists cotizaciones_mueven_solped on public.cotizaciones;
create trigger cotizaciones_mueven_solped
  after insert on public.cotizaciones
  for each row execute function public.marcar_solped_en_cotizacion();

-- ─── 6. Respaldos y bitácora ────────────────────────────────────────────────
-- La ficha técnica de un artículo y la cotización firmada son respaldos como
-- cualquier otro. Sin sumarlas acá, adjuntarlas falla por la restricción.

alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'facturas', 'ordenes_compra', 'compras',
    'servicios', 'costos_personal', 'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos', 'articulos'
  )
);

/* El maestro entra a la bitácora por el camino de siempre: se suma a la lista y
   se vuelven a enganchar los triggers. Cambiar el nombre técnico de un artículo
   cambia lo que se le pide al proveedor, así que tiene que quedar quién lo hizo.

   `articulo_proveedor` queda FUERA a propósito: se actualiza sola cada vez que
   llega una cotización, y auditarla sería llenar la bitácora de ruido que nadie
   va a leer. */
create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos',
    'proveedores', 'solped', 'solped_items', 'cotizaciones', 'cotizacion_items',
    'anexos', 'campos_contrato', 'articulos'
  ];
$$;

do $$
declare
  t text;
begin
  foreach t in array public.tablas_auditadas() loop
    execute format(
      'alter table public.%I
         add column if not exists creado_por uuid references auth.users (id) on delete set null', t);
    execute format(
      'alter table public.%I
         add column if not exists actualizado_por uuid references auth.users (id) on delete set null', t);

    -- El de autoría corre ANTES, para que el de bitácora ya vea los valores.
    execute format('drop trigger if exists %I_autoria on public.%I', t, t);
    execute format(
      'create trigger %I_autoria before insert or update on public.%I
         for each row execute function public.marcar_autoria()', t, t);

    execute format('drop trigger if exists %I_auditoria on public.%I', t, t);
    execute format(
      'create trigger %I_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end;
$$;

-- ─── 7. RLS ─────────────────────────────────────────────────────────────────

alter table public.articulos enable row level security;
alter table public.articulo_proveedor enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['articulos', 'articulo_proveedor'] loop
    execute format('drop policy if exists "%s: lectura autenticada" on public.%I', t, t);
    execute format(
      'create policy "%s: lectura autenticada" on public.%I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s: escribe gestion" on public.%I', t, t);
    execute format(
      'create policy "%s: escribe gestion" on public.%I
         for all to authenticated
         using (public.puede_editar()) with check (public.puede_editar())', t, t);
  end loop;
end;
$$;

-- ─── 8. El catálogo, listo para buscar ──────────────────────────────────────
-- Una fila por artículo con lo que se necesita para elegirlo al pedir: sus dos
-- nombres, si está bajo el mínimo, y a cuántos proveedores se le ha comprado.

drop view if exists public.catalogo_articulos;
create view public.catalogo_articulos
with (security_invoker = true) as
  select
    a.*,
    /* El nombre con el que conviene pedirlo: el técnico si se aprendió, y si
       no, el de faena. */
    coalesce(nullif(btrim(a.nombre_tecnico), ''), a.nombre) as nombre_para_pedir,
    (a.stock_minimo is not null
      and a.stock_actual is not null
      and a.stock_actual <= a.stock_minimo) as bajo_minimo,
    coalesce(p.proveedores, 0)::int as proveedores,
    p.mejor_precio,
    p.ultima_compra
  from public.articulos a
  left join lateral (
    select
      count(*) as proveedores,
      min(ap.ultimo_precio) filter (where ap.ultimo_precio > 0) as mejor_precio,
      max(ap.ultima_fecha) as ultima_compra
    from public.articulo_proveedor ap
    where ap.articulo_id = a.id
  ) p on true;

comment on view public.catalogo_articulos is
  'El maestro listo para elegir al pedir: los dos nombres, si está bajo el mínimo y a quién se le ha comprado.';

grant select on public.catalogo_articulos to authenticated;

notify pgrst, 'reload schema';
