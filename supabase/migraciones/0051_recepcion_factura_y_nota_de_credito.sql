-- ============================================================================
-- 0051 — El ciclo de la OC: recepción, facturas parciales y nota de crédito
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0049 (costo en el mes de la OC).
--
-- LO QUE HABÍA. La recepción era un número acumulado por línea, sin fecha de
-- cada entrega ni guía. La factura se marcaba en la línea con `compra_id`: una
-- línea cabía en UNA factura, y facturar una OC se llevaba todas sus líneas.
--
-- LAS REGLAS DE VALAR (05-10-2026):
--   · La factura calza con líneas de la OC, pero puede cubrir solo una parte.
--     Una OC puede tener muchas facturas.
--   · La recepción es obligatoria: es lo que prueba que llegó y lo que habilita
--     la factura. Se registra cada entrega con su guía de despacho.
--   · Si facturan algo que no llegó, se pide Nota de Crédito. A los 5 días de
--     la factura se avisa. Mientras tanto la factura queda RETENIDA: no se paga.
--   · Lo que no llegó ni se facturó, y ya no va a llegar, se cierra.
--   · El costo es del mes de la OC (0049); la NC y el cierre lo bajan.
--   · Una compra sin OC (al contado) se paga directo: nada de esto la toca.
--
-- CÓMO. Cada documento dice CUÁNTO de cada línea cubre, en una tabla de
-- detalle. Las líneas de la OC no se parten. De las cantidades sale todo:
--
--   vigente        = pedida − acreditada − cerrada      (lo que sigue siendo costo)
--   facturada neta = facturada − acreditada
--   sin recibir    = facturada neta − recibida   (> 0 → retener y pedir NC)
--
-- `items_compra.cantidad_recibida` se sigue llenando —ahora sola, desde las
-- recepciones— para que lo que ya la lee (cumplimiento de proveedores, avance
-- de la SOLPED) no cambie. `compra_id` queda sin uso: hoy no hay ninguna línea
-- que lo tenga (verificado: 0 ítems en la base al escribir esto).
-- ============================================================================

-- ─── 1. Cerrar saldo ────────────────────────────────────────────────────────

alter table public.items_compra
  add column if not exists cantidad_cerrada numeric(12, 2) not null default 0
    check (cantidad_cerrada >= 0);

comment on column public.items_compra.cantidad_cerrada is
  'Lo que no llegó ni se facturó y ya no va a llegar. Deja de ser costo.';

-- ─── 2. Los documentos y su detalle ─────────────────────────────────────────
-- Todas llevan `contrato_id`, que se copia solo del documento padre: es lo
-- que permite usar las mismas reglas de acceso que `items_compra`.

create table if not exists public.recepciones (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  orden_id text not null,
  contrato_id text not null,
  fecha date not null default current_date,
  guia_despacho text,
  recibido_por text,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  foreign key (empresa_id, orden_id)
    references public.ordenes_compra_proveedor (empresa_id, id) on delete cascade
);

comment on table public.recepciones is
  'Una entrega del proveedor contra una OC, con su guía de despacho. Es la prueba de que llegó.';

create table if not exists public.recepcion_items (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  recepcion_id uuid not null,
  item_id text not null,
  contrato_id text not null,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  foreign key (empresa_id, recepcion_id) references public.recepciones (empresa_id, id) on delete cascade,
  foreign key (empresa_id, item_id) references public.items_compra (empresa_id, id) on delete cascade
);

/* La factura sigue siendo una fila de `compras` (el documento que se paga);
   esto dice qué parte de cada línea de la OC cubre. */
create table if not exists public.factura_items (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  compra_id text not null,
  item_id text not null,
  contrato_id text not null,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  unique (empresa_id, compra_id, item_id),
  foreign key (empresa_id, compra_id) references public.compras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, item_id) references public.items_compra (empresa_id, id) on delete cascade
);

create table if not exists public.notas_credito (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  /* La factura que corrige. */
  compra_id text not null,
  contrato_id text not null,
  numero text not null check (btrim(numero) <> ''),
  fecha date not null default current_date,
  neto bigint not null check (neto >= 0),
  iva bigint not null default 0 check (iva >= 0),
  total bigint generated always as (neto + iva) stored,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  foreign key (empresa_id, compra_id) references public.compras (empresa_id, id) on delete cascade
);

comment on table public.notas_credito is
  'La NC del proveedor contra una factura que cobró algo que no llegó. Baja lo que se paga y el costo.';

create table if not exists public.nota_credito_items (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  id uuid not null default gen_random_uuid(),
  nota_id uuid not null,
  item_id text not null,
  contrato_id text not null,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null,
  actualizado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id),
  foreign key (empresa_id, nota_id) references public.notas_credito (empresa_id, id) on delete cascade,
  foreign key (empresa_id, item_id) references public.items_compra (empresa_id, id) on delete cascade
);

create index if not exists recepciones_orden_idx on public.recepciones (empresa_id, orden_id);
create index if not exists recepcion_items_item_idx on public.recepcion_items (empresa_id, item_id);
create index if not exists factura_items_item_idx on public.factura_items (empresa_id, item_id);
create index if not exists notas_credito_compra_idx on public.notas_credito (empresa_id, compra_id);
create index if not exists nota_credito_items_item_idx on public.nota_credito_items (empresa_id, item_id);

-- ─── 3. El contrato se copia del padre ──────────────────────────────────────
-- BEFORE: corre antes de que RLS revise la fila, así que la regla de acceso ya
-- ve el contrato correcto. Lo que mande la app en `contrato_id` se ignora.

create or replace function public.copiar_contrato_del_padre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'recepciones' then
    select o.contrato_id into new.contrato_id
      from public.ordenes_compra_proveedor o
     where o.empresa_id = new.empresa_id and o.id = new.orden_id;
  elsif tg_table_name = 'notas_credito' then
    select c.contrato_id into new.contrato_id
      from public.compras c
     where c.empresa_id = new.empresa_id and c.id = new.compra_id;
  else
    select i.contrato_id into new.contrato_id
      from public.items_compra i
     where i.empresa_id = new.empresa_id and i.id = new.item_id;
  end if;
  return new;
end;
$$;

-- ─── 4. Cuánto de cada línea: la base de todo lo demás ─────────────────────

create or replace view public.items_avance
with (security_invoker = true) as
  select
    i.empresa_id,
    i.id,
    i.orden_id,
    i.contrato_id,
    i.cantidad,
    i.precio_unitario,
    i.iva,
    i.cantidad_recibida as recibida,
    coalesce(f.cantidad, 0) as facturada,
    coalesce(acred.cantidad, 0) as acreditada,
    i.cantidad_cerrada as cerrada,
    i.cantidad - coalesce(acred.cantidad, 0) - i.cantidad_cerrada as vigente,
    coalesce(f.cantidad, 0) - coalesce(acred.cantidad, 0) as facturada_neta,
    greatest(coalesce(f.cantidad, 0) - coalesce(acred.cantidad, 0) - i.cantidad_recibida, 0) as sin_recibir,
    greatest(i.cantidad_recibida - (coalesce(f.cantidad, 0) - coalesce(acred.cantidad, 0)), 0) as recibida_sin_facturar,
    greatest(i.cantidad - coalesce(acred.cantidad, 0) - i.cantidad_cerrada - i.cantidad_recibida, 0) as por_recibir
  from public.items_compra i
  left join lateral (
    select sum(fi.cantidad) as cantidad from public.factura_items fi
     where fi.empresa_id = i.empresa_id and fi.item_id = i.id
  ) f on true
  left join lateral (
    select sum(ni.cantidad) as cantidad from public.nota_credito_items ni
     where ni.empresa_id = i.empresa_id and ni.item_id = i.id
  ) acred on true;

comment on view public.items_avance is
  'Por línea de OC: pedido, recibido, facturado, acreditado (NC) y cerrado. De acá sale el estado de la OC, el costo y la retención del pago.';

grant select on public.items_avance to authenticated;

-- ─── 5. Las cantidades no pueden contradecirse ──────────────────────────────

create or replace function public.validar_cantidades_item(p_empresa text, p_item text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  select * into a from public.items_avance where empresa_id = p_empresa and id = p_item;
  if not found then
    return;
  end if;
  if a.recibida > a.cantidad then
    raise exception 'Se está recibiendo más de lo pedido en la línea % (pedido %, recibido %).',
      p_item, a.cantidad, a.recibida using errcode = 'check_violation';
  end if;
  if a.facturada > a.cantidad then
    raise exception 'Se está facturando más de lo pedido en la línea % (pedido %, facturado %).',
      p_item, a.cantidad, a.facturada using errcode = 'check_violation';
  end if;
  if a.acreditada > a.facturada then
    raise exception 'La nota de crédito acredita más de lo facturado en la línea %.', p_item
      using errcode = 'check_violation';
  end if;
  if a.vigente < greatest(a.recibida, a.facturada_neta) then
    raise exception 'No se puede cerrar o acreditar lo que ya llegó o sigue facturado en la línea %.', p_item
      using errcode = 'check_violation';
  end if;
end;
$$;

/* La recepción se suma en la línea: cantidad, estado, última fecha y quién. */
create or replace function public.sincronizar_recepcion_item(p_empresa text, p_item text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recibida numeric;
  ultima date;
  quien text;
  pedida numeric;
begin
  select coalesce(sum(ri.cantidad), 0), max(r.fecha)
    into recibida, ultima
    from public.recepcion_items ri
    join public.recepciones r on r.empresa_id = ri.empresa_id and r.id = ri.recepcion_id
   where ri.empresa_id = p_empresa and ri.item_id = p_item;

  select r.recibido_por into quien
    from public.recepcion_items ri
    join public.recepciones r on r.empresa_id = ri.empresa_id and r.id = ri.recepcion_id
   where ri.empresa_id = p_empresa and ri.item_id = p_item
   order by r.fecha desc, r.creado_en desc
   limit 1;

  select i.cantidad - i.cantidad_cerrada into pedida
    from public.items_compra i where i.empresa_id = p_empresa and i.id = p_item;

  update public.items_compra
     set cantidad_recibida = recibida,
         estado_recepcion = case
           when recibida <= 0 then 'pendiente'
           when recibida >= pedida then 'recibido'
           else 'parcial'
         end,
         fecha_recepcion = ultima,
         recibido_por = quien
   where empresa_id = p_empresa and id = p_item;
end;
$$;

/* El estado de la OC, ahora por cantidades. La lógica es la de siempre
   —recibida, parcial, cerrada— pero "facturada" significa facturada neta de NC
   y lo cerrado no se espera. */
create or replace function public.recalcular_orden(p_empresa text, p_orden text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  estado_actual text;
  lineas int;
  recibidas int;
  facturadas int;
  con_algo int;
begin
  if p_orden is null then
    return;
  end if;

  select estado into estado_actual
    from public.ordenes_compra_proveedor where empresa_id = p_empresa and id = p_orden;

  -- Un borrador o una orden anulada no cambian de estado por sus líneas.
  if estado_actual is null or estado_actual in ('borrador', 'anulada') then
    return;
  end if;

  select
    count(*) filter (where vigente > 0),
    count(*) filter (where vigente > 0 and recibida >= vigente),
    count(*) filter (where vigente > 0 and facturada_neta >= vigente),
    count(*) filter (where recibida > 0)
  into lineas, recibidas, facturadas, con_algo
  from public.items_avance where empresa_id = p_empresa and orden_id = p_orden;

  update public.ordenes_compra_proveedor
     set estado = case
           when lineas = 0 and con_algo = 0 then 'emitida'
           when recibidas = lineas and facturadas = lineas then 'cerrada'
           when recibidas = lineas then 'recibida'
           when con_algo > 0 then 'parcial'
           else 'emitida'
         end
   where empresa_id = p_empresa and id = p_orden
     and estado is distinct from case
           when lineas = 0 and con_algo = 0 then 'emitida'
           when recibidas = lineas and facturadas = lineas then 'cerrada'
           when recibidas = lineas then 'recibida'
           when con_algo > 0 then 'parcial'
           else 'emitida'
         end;
end;
$$;

-- El trigger que ya existe en items_compra pasa a usar la cuenta nueva.
create or replace function public.recalcular_estado_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validar_cantidades_item(coalesce(new.empresa_id, old.empresa_id), coalesce(new.id, old.id));
  perform public.recalcular_orden(coalesce(new.empresa_id, old.empresa_id), coalesce(new.orden_id, old.orden_id));
  return coalesce(new, old);
end;
$$;

/* Un cambio en cualquier detalle: se suma, se valida y se recalcula la OC. */
create or replace function public.detalle_de_item_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fila record;
  orden text;
begin
  for fila in
    select distinct x.empresa_id, x.item_id
      from (select new.empresa_id, new.item_id where tg_op <> 'DELETE'
            union all
            select old.empresa_id, old.item_id where tg_op <> 'INSERT') x
  loop
    if tg_table_name = 'recepcion_items' then
      -- Actualiza la línea; su trigger valida y recalcula la OC.
      perform public.sincronizar_recepcion_item(fila.empresa_id, fila.item_id);
    else
      perform public.validar_cantidades_item(fila.empresa_id, fila.item_id);
      select i.orden_id into orden from public.items_compra i
       where i.empresa_id = fila.empresa_id and i.id = fila.item_id;
      perform public.recalcular_orden(fila.empresa_id, orden);
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;

/* Cambiar la fecha o quién recibió en la cabecera también cambia la línea. */
create or replace function public.recepcion_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fila record;
begin
  for fila in
    select ri.empresa_id, ri.item_id from public.recepcion_items ri
     where ri.empresa_id = new.empresa_id and ri.recepcion_id = new.id
  loop
    perform public.sincronizar_recepcion_item(fila.empresa_id, fila.item_id);
  end loop;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['recepciones', 'recepcion_items', 'factura_items', 'notas_credito', 'nota_credito_items'] loop
    execute format('drop trigger if exists %I_contrato on public.%I', t, t);
    execute format(
      'create trigger %I_contrato before insert or update on public.%I
         for each row execute function public.copiar_contrato_del_padre()', t, t);

    execute format('drop trigger if exists %I_actualizado on public.%I', t, t);
    execute format(
      'create trigger %I_actualizado before update on public.%I
         for each row execute function public.tocar_actualizado_en()', t, t);

    execute format('drop trigger if exists %I_autoria on public.%I', t, t);
    execute format(
      'create trigger %I_autoria before insert or update on public.%I
         for each row execute function public.marcar_autoria()', t, t);

    execute format('drop trigger if exists %I_auditoria on public.%I', t, t);
    execute format(
      'create trigger %I_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t, t);
  end loop;

  foreach t in array array['recepcion_items', 'factura_items', 'nota_credito_items'] loop
    execute format('drop trigger if exists %I_cuenta on public.%I', t, t);
    execute format(
      'create trigger %I_cuenta after insert or update or delete on public.%I
         for each row execute function public.detalle_de_item_cambio()', t, t);
  end loop;
end;
$$;

drop trigger if exists recepciones_cambio on public.recepciones;
create trigger recepciones_cambio
  after update of fecha, recibido_por on public.recepciones
  for each row execute function public.recepcion_cambio();

-- ─── 6. Acceso: las mismas reglas que las líneas de la OC ───────────────────

do $$
declare
  t text;
  lee text := $q$public.ve_empresa(empresa_id) and (public.puede('egresos.ver', contrato_id) or public.puede('ordenes.ver', contrato_id) or public.puede('pagos.ver', contrato_id))$q$;
  escribe text := $q$empresa_id = public.empresa_actual() and (public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id))$q$;
begin
  foreach t in array array['recepciones', 'recepcion_items', 'factura_items', 'notas_credito', 'nota_credito_items'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "ciclo oc: lee" on public.%I', t);
    execute format('create policy "ciclo oc: lee" on public.%I for select to authenticated using (%s)', t, lee);
    execute format('drop policy if exists "ciclo oc: crea" on public.%I', t);
    execute format('create policy "ciclo oc: crea" on public.%I for insert to authenticated with check (%s)', t, escribe);
    execute format('drop policy if exists "ciclo oc: cambia" on public.%I', t);
    execute format('create policy "ciclo oc: cambia" on public.%I for update to authenticated using (%s) with check (%s)', t, escribe, escribe);
    execute format('drop policy if exists "ciclo oc: borra" on public.%I', t);
    execute format('create policy "ciclo oc: borra" on public.%I for delete to authenticated using (%s)', t, escribe);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ─── 7. Registrar cada documento entero, o nada ─────────────────────────────
-- SECURITY INVOKER (el de por defecto): corren con las reglas de quien llama.
-- Son funciones y no varias llamadas desde la app para que una factura no
-- quede a medias si se corta la conexión entre la cabecera y sus líneas.
-- `p_lineas` = [{"item_id": "...", "cantidad": 3}, …]

create or replace function public.registrar_recepcion(
  p_orden_id text,
  p_fecha date,
  p_guia text,
  p_recibido_por text,
  p_observaciones text,
  p_lineas jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  nueva uuid;
begin
  if not exists (select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric) where x.cantidad > 0) then
    raise exception 'Anota cuánto llegó de al menos una línea.' using errcode = 'check_violation';
  end if;

  insert into public.recepciones (orden_id, contrato_id, fecha, guia_despacho, recibido_por, observaciones)
  values (p_orden_id, '', coalesce(p_fecha, current_date), nullif(btrim(p_guia), ''),
          nullif(btrim(p_recibido_por), ''), nullif(btrim(p_observaciones), ''))
  returning id into nueva;

  insert into public.recepcion_items (recepcion_id, item_id, contrato_id, cantidad)
  select nueva, x.item_id, '', x.cantidad
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0;

  return nueva;
end;
$$;

create or replace function public.registrar_factura_oc(
  p_id text,
  p_orden_id text,
  p_documento text,
  p_fecha_factura date,
  p_vencimiento date,
  p_neto bigint,
  p_iva bigint,
  p_lineas jsonb
)
returns text
language plpgsql
set search_path = public
as $$
declare
  o record;
  primera record;
begin
  select * into o from public.ordenes_compra_proveedor
   where empresa_id = public.empresa_actual() and id = p_orden_id;
  if not found then
    raise exception 'No se encontró la orden %.', p_orden_id;
  end if;
  if btrim(coalesce(p_documento, '')) = '' then
    raise exception 'Falta el número de la factura.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric) where x.cantidad > 0) then
    raise exception 'Marca qué líneas de la orden cubre la factura.' using errcode = 'check_violation';
  end if;

  -- La categoría y el tipo son de las líneas; el documento lleva los de la primera.
  select i.categoria_id, i.tipo into primera
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
    join public.items_compra i on i.empresa_id = o.empresa_id and i.id = x.item_id
   where x.cantidad > 0
   limit 1;

  insert into public.compras (
    id, contrato_id, proveedor_id, proveedor, documento, detalle, categoria_id, tipo,
    neto, iva, fecha, periodo_control, fecha_factura, fecha_vencimiento, orden_id, estado_pago
  ) values (
    p_id, o.contrato_id, o.proveedor_id, o.proveedor, btrim(p_documento),
    format('Factura %s · %s', btrim(p_documento), o.numero),
    primera.categoria_id, coalesce(primera.tipo, 'ordinario'),
    p_neto, coalesce(p_iva, 0),
    date_trunc('month', p_fecha_factura)::date, date_trunc('month', p_fecha_factura)::date,
    p_fecha_factura, p_vencimiento, o.id, 'pendiente'
  );

  insert into public.factura_items (compra_id, item_id, contrato_id, cantidad)
  select p_id, x.item_id, '', x.cantidad
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0;

  return p_id;
end;
$$;

create or replace function public.registrar_nota_credito(
  p_compra_id text,
  p_numero text,
  p_fecha date,
  p_neto bigint,
  p_iva bigint,
  p_observaciones text,
  p_lineas jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  nueva uuid;
  ajena text;
begin
  if not exists (select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric) where x.cantidad > 0) then
    raise exception 'Marca qué líneas acredita la nota de crédito.' using errcode = 'check_violation';
  end if;

  -- Solo se acredita lo que esa factura cobró.
  select x.item_id into ajena
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0
     and not exists (select 1 from public.factura_items fi
                      where fi.empresa_id = public.empresa_actual()
                        and fi.compra_id = p_compra_id and fi.item_id = x.item_id
                        and fi.cantidad >= x.cantidad)
   limit 1;
  if ajena is not null then
    raise exception 'La línea % no está en esa factura, o se acredita más de lo que cobró.', ajena
      using errcode = 'check_violation';
  end if;

  insert into public.notas_credito (compra_id, contrato_id, numero, fecha, neto, iva, observaciones)
  values (p_compra_id, '', btrim(p_numero), coalesce(p_fecha, current_date), p_neto, coalesce(p_iva, 0),
          nullif(btrim(p_observaciones), ''))
  returning id into nueva;

  insert into public.nota_credito_items (nota_id, item_id, contrato_id, cantidad)
  select nueva, x.item_id, '', x.cantidad
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0;

  return nueva;
end;
$$;

grant execute on function public.registrar_recepcion(text, date, text, text, text, jsonb) to authenticated;
grant execute on function public.registrar_factura_oc(text, text, text, date, date, bigint, bigint, jsonb) to authenticated;
grant execute on function public.registrar_nota_credito(text, text, date, bigint, bigint, text, jsonb) to authenticated;

-- ─── 8. Las vistas, por cantidades ──────────────────────────────────────────
-- `create or replace` exige las mismas columnas en el mismo orden; las nuevas
-- van al final. Así no hay que descolgar las vistas que dependen de estas.

/* El costo de la línea es lo VIGENTE: la NC y el cierre lo bajan. */
create or replace view public.items_detalle
with (security_invoker = true) as
  select
    i.id,
    i.contrato_id,
    i.orden_id,
    i.compra_id,
    i.categoria_id,
    coalesce(cat.nombre, 'Sin categoría') as categoria,
    coalesce(cat.familia, 'compras') as familia,
    o.numero as orden_numero,
    o.proveedor as orden_proveedor,
    fac.proveedor as factura_proveedor,
    fac.documentos as factura_numero,
    fac.estado_pago,
    fac.fecha_pago,
    case
      when o.id is not null then o.fecha_emision
      else coalesce(fac.fecha, i.fecha_recepcion)
    end as fecha,
    case
      when o.id is not null then date_trunc('month', o.fecha_emision)::date
      else coalesce(fac.periodo_control, date_trunc('month', coalesce(fac.fecha, i.fecha_recepcion))::date)
    end as periodo,
    i.descripcion,
    a.vigente::numeric(12, 2) as cantidad,
    i.unidad,
    i.precio_unitario,
    round(a.vigente * i.precio_unitario)::bigint as neto,
    case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end as iva,
    round(a.vigente * i.precio_unitario)::bigint
      + case when i.cantidad > 0 then round(i.iva * a.vigente / i.cantidad)::bigint else 0::bigint end as total,
    i.tipo,
    i.estado_recepcion,
    i.cantidad_recibida,
    i.fecha_recepcion,
    case
      when a.vigente > 0 and a.facturada_neta >= a.vigente and fac.estado_pago = 'pagada' then 'pagado'
      when a.vigente > 0 and a.facturada_neta >= a.vigente then 'facturado'
      when a.recibida >= a.vigente and a.recibida > 0 then 'recibido'
      when a.recibida > 0 then 'parcial'
      else 'pendiente'
    end as etapa
  from public.items_compra i
  join public.items_avance a on a.empresa_id = i.empresa_id and a.id = i.id
  left join public.categorias_costo cat on cat.empresa_id = i.empresa_id and cat.id = i.categoria_id
  left join public.ordenes_compra_proveedor o on o.empresa_id = i.empresa_id and o.id = i.orden_id
  left join lateral (
    select
      string_agg(distinct c.documento, ', ') as documentos,
      max(c.proveedor) as proveedor,
      -- "pagada" solo si todas las facturas de la línea lo están.
      case when bool_and(c.estado_pago = 'pagada') then 'pagada' else min(c.estado_pago) end as estado_pago,
      max(c.fecha_pago) as fecha_pago,
      min(c.fecha) as fecha,
      min(c.periodo_control) as periodo_control
    from public.factura_items fi
    join public.compras c on c.empresa_id = fi.empresa_id and c.id = fi.compra_id
    where fi.empresa_id = i.empresa_id and fi.item_id = i.id
    having count(*) > 0
  ) fac on true;

/* Una factura que cubre líneas no es costo por sí misma: el costo ya está en
   las líneas. Antes se miraba solo `compra_id`; ahora también el detalle. */
create or replace view public.costos_unificados
with (security_invoker = true) as
  select d.id, d.contrato_id, d.categoria_id, d.categoria, d.familia, d.fecha, d.periodo,
         coalesce(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor') as tercero,
         d.descripcion as detalle, d.tipo, d.neto, d.iva, d.total,
         coalesce(d.estado_pago, 'pendiente') as estado_pago
    from public.items_detalle d
  union all
  select c.id, c.contrato_id, c.categoria_id,
         coalesce(cat.nombre, 'Sin categoría'), coalesce(cat.familia, 'compras'),
         c.fecha, coalesce(c.periodo_control, date_trunc('month', c.fecha)::date),
         c.proveedor, c.detalle, c.tipo, c.neto, c.iva, c.total, c.estado_pago
    from public.compras c
    left join public.categorias_costo cat on cat.empresa_id = c.empresa_id and cat.id = c.categoria_id
   where not exists (select 1 from public.items_compra i where i.empresa_id = c.empresa_id and i.compra_id = c.id)
     and not exists (select 1 from public.factura_items fi where fi.empresa_id = c.empresa_id and fi.compra_id = c.id)
  union all
  select s.id, s.contrato_id, s.categoria_id,
         coalesce(cat.nombre, 'Servicios'), coalesce(cat.familia, 'servicios'),
         s.fecha, date_trunc('month', s.fecha)::date,
         s.contratista, s.detalle, s.tipo, s.neto, s.iva, s.total, s.estado_pago
    from public.servicios s
    left join public.categorias_costo cat on cat.empresa_id = s.empresa_id and cat.id = s.categoria_id
  union all
  select p.id, p.contrato_id, p.categoria_id,
         coalesce(cat.nombre, 'Personal'), coalesce(cat.familia, 'personal'),
         p.periodo, p.periodo, p.faena, 'Remuneraciones y leyes sociales', 'ordinario',
         p.costo_total, 0::bigint, p.costo_total, 'pagada'
    from public.costos_personal p
    left join public.categorias_costo cat on cat.empresa_id = p.empresa_id and cat.id = p.categoria_id;

/* La OC con su avance en pesos. `neto` es lo vigente (lo que es costo) y
   `facturado`, lo facturado neto de NC; las columnas nuevas van al final. */
create or replace view public.ordenes_proveedor_resumen
with (security_invoker = true) as
  select
    o.id, o.contrato_id, o.numero, o.proveedor, o.rut_proveedor, o.contacto, o.correo_contacto,
    o.fecha_emision, o.fecha_requerida, o.lugar_entrega, o.condiciones_pago, o.estado, o.observaciones,
    o.creado_en, o.actualizado_en, o.creado_por, o.actualizado_por, o.direccion_proveedor,
    o.ciudad_proveedor, o.comuna_proveedor, o.telefono_contacto, o.solicitado_por, o.retira,
    o.autorizado_por, o.proyecto, o.emisor_nombre, o.emisor_correo, o.emisor_telefono, o.solped_id,
    o.proveedor_id, o.fecha_comprometida, o.fecha_confirmacion, o.cotizacion_id,
    coalesce(count(a.id) filter (where a.vigente > 0), 0)::int as items,
    coalesce(count(a.id) filter (where a.vigente > 0 and a.recibida >= a.vigente), 0)::int as items_recibidos,
    coalesce(count(a.id) filter (where a.vigente > 0 and a.facturada_neta >= a.vigente), 0)::int as items_facturados,
    coalesce(sum(round(a.vigente * a.precio_unitario)), 0)::bigint as neto,
    coalesce(sum(round(a.vigente * a.precio_unitario)
      + case when a.cantidad > 0 then round(a.iva * a.vigente / a.cantidad) else 0 end), 0)::bigint as total,
    coalesce(sum(round(a.vigente * a.precio_unitario)) filter (where i.tipo = 'reembolsable'), 0)::bigint as reembolsable,
    coalesce(sum(round(a.facturada_neta * a.precio_unitario)), 0)::bigint as facturado,
    -- Nuevas (0051)
    coalesce(sum(round(least(a.recibida, a.vigente) * a.precio_unitario)), 0)::bigint as recibido,
    coalesce(sum(round(a.sin_recibir * a.precio_unitario)), 0)::bigint as sin_recibir,
    coalesce(sum(round(a.recibida_sin_facturar * a.precio_unitario)), 0)::bigint as recibido_sin_facturar,
    coalesce(sum(round(a.acreditada * a.precio_unitario)), 0)::bigint as acreditado,
    coalesce(sum(round(a.cerrada * a.precio_unitario)), 0)::bigint as cerrado,
    coalesce(sum(round(a.por_recibir * a.precio_unitario)), 0)::bigint as por_recibir,
    coalesce((
      select sum(c.neto) from public.compras c
       where c.empresa_id = o.empresa_id and c.orden_id = o.id and c.estado_pago = 'pagada'
    ), 0)::bigint as pagado,
    coalesce((
      select count(*) from public.compras c
       where c.empresa_id = o.empresa_id and c.orden_id = o.id and c.estado_pago <> 'anulada'
    ), 0)::int as facturas,
    -- Facturaron algo que no llegó y ya pasaron 5 días: hay que pedir la NC.
    exists (
      select 1 from public.compras c
       where c.empresa_id = o.empresa_id and c.orden_id = o.id
         and c.estado_pago not in ('pagada', 'anulada')
         and c.fecha_factura <= current_date - 5
         and exists (
           select 1 from public.factura_items fi
             join public.items_avance x on x.empresa_id = fi.empresa_id and x.id = fi.item_id
            where fi.empresa_id = c.empresa_id and fi.compra_id = c.id and x.sin_recibir > 0)
    ) as solicitar_nc
  from public.ordenes_compra_proveedor o
  left join public.items_compra i on i.empresa_id = o.empresa_id and i.orden_id = o.id
  left join public.items_avance a on a.empresa_id = i.empresa_id and a.id = i.id
  group by o.empresa_id, o.id;

/* Lo que se le debe a cada proveedor. Una factura de OC se paga neta de sus NC
   y queda RETENIDA mientras cobre algo que no ha llegado. Las columnas nuevas
   van al final: `flujo_de_pagos` cuelga de esta y no se toca. */
create or replace view public.cuentas_por_pagar
with (security_invoker = true) as
with p as (
  select * from public.parametros_pago where id
),
nc as (
  select n.empresa_id, n.compra_id, sum(n.neto)::bigint as neto, sum(n.iva)::bigint as iva
    from public.notas_credito n
   group by n.empresa_id, n.compra_id
),
/* Cuánto de cada factura cobra cosas que no llegaron. Si una línea está en
   dos facturas, lo que falta se le carga a cada una hasta lo que cobró. */
retenido as (
  select fi.empresa_id, fi.compra_id,
         sum(round(least(fi.cantidad, a.sin_recibir) * a.precio_unitario))::bigint as sin_recibir
    from public.factura_items fi
    join public.items_avance a on a.empresa_id = fi.empresa_id and a.id = fi.item_id
   where a.sin_recibir > 0
   group by fi.empresa_id, fi.compra_id
),
lineas as (
  select
    'F:' || c.id as id,
    'factura'::text as origen,
    c.id as compra_id,
    c.orden_id,
    o.numero as orden_numero,
    c.contrato_id,
    ct.nombre as contrato,
    coalesce(c.proveedor_id, o.proveedor_id) as proveedor_id,
    coalesce(pr.razon_social, c.proveedor) as proveedor,
    pr.rut,
    coalesce(pr.estado_cuenta, 'por_validar') as estado_cuenta,
    pr.banco,
    pr.numero_cuenta,
    c.detalle,
    c.documento,
    c.fecha_factura,
    c.fecha as periodo,
    c.neto - coalesce(nc.neto, 0) as neto,
    c.iva - coalesce(nc.iva, 0) as iva,
    c.total - coalesce(nc.neto, 0) - coalesce(nc.iva, 0) as total,
    coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p)) as plazo_dias,
    coalesce(c.fecha_vencimiento,
             c.fecha_factura + coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p))::integer) as vencimiento,
    c.fecha_pago_programada,
    c.fecha_pago,
    c.estado_pago,
    case when c.documento is null then greatest(current_date - c.fecha, 0) end as dias_sin_facturar,
    coalesce(r.sin_recibir, 0)::bigint as sin_recibir,
    coalesce(nc.neto, 0)::bigint as nota_credito
  from public.compras c
  join public.contratos ct on ct.empresa_id = c.empresa_id and ct.id = c.contrato_id
  left join public.ordenes_compra_proveedor o on o.empresa_id = c.empresa_id and o.id = c.orden_id
  left join public.proveedores pr on pr.empresa_id = c.empresa_id and pr.id = coalesce(c.proveedor_id, o.proveedor_id)
  left join nc on nc.empresa_id = c.empresa_id and nc.compra_id = c.id
  left join retenido r on r.empresa_id = c.empresa_id and r.compra_id = c.id
  where c.estado_pago <> 'pagada' or c.fecha_pago >= current_date - 60

  union all

  select
    'O:' || o.id,
    'orden'::text,
    null::text,
    o.id,
    o.numero,
    o.contrato_id,
    ct.nombre,
    o.proveedor_id,
    coalesce(pr.razon_social, o.proveedor),
    coalesce(pr.rut, o.rut_proveedor),
    coalesce(pr.estado_cuenta, 'por_validar'),
    pr.banco,
    pr.numero_cuenta,
    'Saldo sin facturar de la orden',
    null::text,
    null::date,
    o.fecha_emision,
    r.neto - r.facturado,
    0::bigint,
    r.neto - r.facturado,
    coalesce(nullif(pr.dias_credito, 0), (select plazo_pago_dias from p)),
    null::date,
    null::date,
    null::date,
    'pendiente'::text,
    greatest(current_date - o.fecha_emision, 0),
    0::bigint,
    0::bigint
  from public.ordenes_compra_proveedor o
  join public.ordenes_proveedor_resumen r on r.id = o.id and r.contrato_id = o.contrato_id
  join public.contratos ct on ct.empresa_id = o.empresa_id and ct.id = o.contrato_id
  left join public.proveedores pr on pr.empresa_id = o.empresa_id and pr.id = o.proveedor_id
  where o.estado in ('emitida', 'parcial', 'recibida')
    and r.neto > r.facturado
)
select
  l.id, l.origen, l.compra_id, l.orden_id, l.orden_numero, l.contrato_id, l.contrato,
  l.proveedor_id, l.proveedor, l.rut, l.estado_cuenta, l.banco, l.numero_cuenta, l.detalle,
  l.documento, l.fecha_factura, l.periodo, l.neto, l.iva, l.total, l.plazo_dias, l.vencimiento,
  l.fecha_pago_programada, l.fecha_pago, l.estado_pago, l.dias_sin_facturar,
  (l.vencimiento - current_date) as dias_para_vencer,
  case
    when l.estado_pago = 'pagada'   then 'pagado'
    when l.estado_pago = 'retenida' then 'retenido'
    when l.estado_pago = 'anulada'  then 'anulado'
    when l.documento is null        then 'no_facturado'
    -- Cobra algo que no llegó: no se paga hasta que llegue o venga la NC.
    when l.sin_recibir > 0          then 'retenido'
    when l.vencimiento is null      then 'pendiente'
    when l.vencimiento < current_date then 'vencido'
    when l.vencimiento <= current_date + (select dias_alerta_vencimiento from p) then 'por_vencer'
    else 'pendiente'
  end as estado_documento,
  case
    when l.documento is not null then 'ok'
    when l.estado_pago = 'pagada' then 'pagado_sin_factura'
    when l.dias_sin_facturar > (select dias_maximos_sin_factura from p) then 'factura_atrasada'
    else 'falta_factura'
  end as alerta_documental,
  (l.documento is not null and l.estado_pago = 'pendiente' and l.sin_recibir = 0) as apto_para_pago,
  (date_trunc('week', l.fecha_pago_programada)::date) as semana_pago,
  -- Nuevas (0051)
  l.sin_recibir,
  l.nota_credito,
  (l.sin_recibir > 0 and l.fecha_factura <= current_date - 5) as solicitar_nc
from lineas l;

-- ─── 9. Historial y respaldos de los documentos nuevos ──────────────────────

create or replace function public.ve_registro(tabla text, registro text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  visto boolean;
begin
  if not (tabla = any (public.tablas_auditadas() || array[
    'egresos_oficina_central', 'ordenes_compra_proveedor', 'items_compra',
    'nominas_oficina_central', 'nomina_oficina_trabajadores',
    'recepciones', 'recepcion_items', 'factura_items', 'notas_credito', 'nota_credito_items'
  ])) then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id::text = $1)', tabla)
     into visto
    using registro;
  return visto;
end;
$$;

/* La guía de despacho y la NC se adjuntan como cualquier respaldo. */
alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'facturas', 'ordenes_compra', 'compras',
    'servicios', 'costos_personal', 'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos', 'articulos',
    'nominas_oficina_central', 'recepciones', 'notas_credito'
  )
);

notify pgrst, 'reload schema';
