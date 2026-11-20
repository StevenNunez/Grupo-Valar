-- ============================================================================
-- 0127 — Autorización de compras por tramo de monto
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0126.
--
-- POR QUÉ. Hasta hoy una OC pasaba de borrador a emitida sin que nadie
-- autorizara el gasto. La 0015 dejó la tabla `reglas_aprobacion` con tramos
-- por rol, pero nada la usaba y en Valar estaba vacía.
--
-- QUÉ CAMBIA.
--   · Cada regla de COMPRA es una firma que se exige según el neto de la OC:
--     desde / hasta (nulo = sin tope), a qué contratos (nulo = todos) y quiénes
--     pueden darla (`reglas_aprobacion_firmantes`, basta UNO de ellos).
--     Ej.: «Administrador de contrato» $0–sin tope (Eduardo) y «Gerencia»
--     desde $500.001 (Ignacio o Francisco): sobre $500.000 firman dos personas.
--   · Se configura en la pantalla Aprobaciones (permiso «Cambiar parámetros»).
--   · La OC no sale de borrador sin todas sus firmas: lo cuida un trigger, no
--     la pantalla. Una firma vale por el monto firmado: si la OC sube, hay que
--     firmar de nuevo. Quien creó la OC no puede autorizarla.
--   · Pedir, autorizar y rechazar pasa por `decidir_compra()`, que deja la
--     firma en `aprobaciones` y avisa (campana + push) a quien corresponde.
--   · SIN REGLAS NO CAMBIA NADA: una empresa que no configure tramos sigue
--     emitiendo como hasta hoy. Así se puede aplicar antes de configurar.
--   · El switch «Autorizar la compra» de Usuarios desaparece: ahora lo dice la
--     pantalla Aprobaciones, que además fija el monto.
--
-- Las solicitudes (SOLPED) no cambian: las sigue aprobando quien tenga el
-- switch «Aprobar solicitudes» para ese contrato.
-- ============================================================================

begin;

-- ─── 1. Las reglas ──────────────────────────────────────────────────────────

alter table public.reglas_aprobacion add column if not exists titulo text;
alter table public.reglas_aprobacion add column if not exists contratos text[];
alter table public.reglas_aprobacion alter column rol drop not null;

comment on column public.reglas_aprobacion.titulo is
  'Cómo se llama la firma en pantalla: «Administrador de contrato», «Gerencia».';
comment on column public.reglas_aprobacion.contratos is
  'A qué contratos aplica. Nulo = a todos (también a Oficina Central).';
comment on column public.reglas_aprobacion.rol is
  'SIN USO desde la 0127 para las compras: quién firma está en reglas_aprobacion_firmantes.';

create table if not exists public.reglas_aprobacion_firmantes (
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  regla_id text not null,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (empresa_id, regla_id, usuario_id),
  foreign key (empresa_id, regla_id)
    references public.reglas_aprobacion (empresa_id, id) on update cascade on delete cascade
);

comment on table public.reglas_aprobacion_firmantes is
  'Quiénes pueden dar cada firma. Basta que firme uno de ellos.';

alter table public.reglas_aprobacion_firmantes enable row level security;

drop policy if exists "firmantes: lectura" on public.reglas_aprobacion_firmantes;
create policy "firmantes: lectura" on public.reglas_aprobacion_firmantes
  for select to authenticated
  using (public.ve_empresa(empresa_id)
         and (public.entra_a('abastecimiento') or public.tiene_permiso('parametros.editar')));

drop policy if exists "firmantes: administra" on public.reglas_aprobacion_firmantes;
create policy "firmantes: administra" on public.reglas_aprobacion_firmantes
  for all to authenticated
  using (empresa_id = public.empresa_actual() and public.tiene_permiso('parametros.editar'))
  with check (empresa_id = public.empresa_actual() and public.tiene_permiso('parametros.editar'));

grant select, insert, update, delete on public.reglas_aprobacion_firmantes to authenticated;

-- ─── 2. Las firmas: se agrega «solicitado» ──────────────────────────────────

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.aprobaciones'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%accion%'
  loop
    execute format('alter table public.aprobaciones drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.aprobaciones
  add constraint aprobaciones_accion_check
  check (accion in ('aprobado', 'rechazado', 'devuelto', 'solicitado'));

/* Las firmas de una compra solo entran por `decidir_compra()`: así nadie se
   salta la regla de quién puede firmar ni el monto. */
drop policy if exists "compra: solo por decidir_compra" on public.aprobaciones;
create policy "compra: solo por decidir_compra" on public.aprobaciones
  as restrictive for insert to authenticated
  with check (documento <> 'compra');

-- ─── 3. Cómo está la autorización de una OC ─────────────────────────────────
-- Interna: no revisa quién pregunta. La envuelven las funciones de abajo.

create or replace function public._autorizacion_compra(p_empresa text, p_orden text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
  v_neto bigint;
  v_pedido timestamptz;
  v_rechazo record;
  v_rechazada boolean;
  r record;
  v_firma record;
  v_reglas jsonb := '[]'::jsonb;
  v_faltan int := 0;
  v_total int := 0;
begin
  select oc.id, oc.contrato_id, oc.creado_por, oc.estado
    into o
    from public.ordenes_compra_proveedor oc
   where oc.empresa_id = p_empresa and oc.id = p_orden;
  if not found then return null; end if;

  select coalesce(sum(round(i.cantidad * i.precio_unitario)), 0)::bigint
    into v_neto
    from public.items_compra i
   where i.empresa_id = p_empresa and i.orden_id = p_orden;

  select max(a.ocurrido_en) into v_pedido
    from public.aprobaciones a
   where a.empresa_id = p_empresa and a.documento = 'compra'
     and a.registro_id = p_orden and a.accion = 'solicitado';

  select a.ocurrido_en, a.usuario_nombre, a.comentario
    into v_rechazo
    from public.aprobaciones a
   where a.empresa_id = p_empresa and a.documento = 'compra'
     and a.registro_id = p_orden and a.accion = 'rechazado'
   order by a.ocurrido_en desc
   limit 1;

  v_rechazada := v_rechazo.ocurrido_en is not null
                 and (v_pedido is null or v_rechazo.ocurrido_en > v_pedido);

  for r in
    select ra.id, coalesce(ra.titulo, ra.id) as titulo, ra.monto_desde, ra.monto_hasta, ra.orden
      from public.reglas_aprobacion ra
     where ra.empresa_id = p_empresa
       and ra.documento = 'compra'
       and ra.activa
       and v_neto >= ra.monto_desde
       and (ra.monto_hasta is null or v_neto <= ra.monto_hasta)
       and (ra.contratos is null or o.contrato_id = any (ra.contratos))
     order by ra.orden, ra.monto_desde, ra.id
  loop
    v_total := v_total + 1;

    -- La firma vale si es de uno de sus firmantes, no de quien creó la OC,
    -- cubre el monto de hoy y es posterior al último rechazo.
    select a.usuario_id, a.usuario_nombre, a.ocurrido_en, a.monto
      into v_firma
      from public.aprobaciones a
      join public.reglas_aprobacion_firmantes f
        on f.empresa_id = p_empresa and f.regla_id = r.id and f.usuario_id = a.usuario_id
     where a.empresa_id = p_empresa and a.documento = 'compra'
       and a.registro_id = p_orden and a.accion = 'aprobado'
       and coalesce(a.monto, 0) >= v_neto
       and a.usuario_id is distinct from o.creado_por
       and (v_rechazo.ocurrido_en is null or a.ocurrido_en > v_rechazo.ocurrido_en)
     order by a.ocurrido_en desc
     limit 1;

    if v_firma.usuario_id is null then v_faltan := v_faltan + 1; end if;

    v_reglas := v_reglas || jsonb_build_object(
      'id', r.id,
      'titulo', r.titulo,
      'desde', r.monto_desde,
      'hasta', r.monto_hasta,
      'firmantes', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.nombre)
          from public.reglas_aprobacion_firmantes f
          join public.perfiles p on p.id = f.usuario_id
         where f.empresa_id = p_empresa and f.regla_id = r.id), '[]'::jsonb),
      'firma', case when v_firma.usuario_id is null then null else jsonb_build_object(
        'usuario_id', v_firma.usuario_id, 'nombre', v_firma.usuario_nombre,
        'en', v_firma.ocurrido_en, 'monto', v_firma.monto) end
    );
  end loop;

  return jsonb_build_object(
    'orden_id', o.id,
    'estado', o.estado,
    'neto', v_neto,
    'creado_por', o.creado_por,
    'requiere', v_total > 0,
    'completa', v_total = 0 or (v_faltan = 0 and not v_rechazada),
    'rechazada', case when v_rechazada then jsonb_build_object(
      'nombre', v_rechazo.usuario_nombre, 'motivo', v_rechazo.comentario, 'en', v_rechazo.ocurrido_en) end,
    'pedida_en', v_pedido,
    'reglas', v_reglas
  );
end;
$$;

revoke all on function public._autorizacion_compra(text, text) from public, anon, authenticated;

/* Para la pantalla: el estado de una OC y qué puede hacer quien pregunta. */
create or replace function public.autorizacion_de_orden(p_orden text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_yo uuid := auth.uid();
  v_contrato text;
begin
  if not public.ve_registro('ordenes_compra_proveedor', p_orden) then
    raise exception 'No se encontró la orden, o tu acceso no la alcanza.';
  end if;
  v := public._autorizacion_compra(public.empresa_actual(), p_orden);
  if v is null then return null; end if;

  select contrato_id into v_contrato
    from public.ordenes_compra_proveedor
   where empresa_id = public.empresa_actual() and id = p_orden;

  return v || jsonb_build_object(
    'puedo_firmar', (v->>'estado') = 'borrador'
                    and (v->>'creado_por') is distinct from v_yo::text
                    and exists (
                      select 1 from jsonb_array_elements(v->'reglas') x
                       where x->'firma' = 'null'::jsonb
                         and exists (select 1 from jsonb_array_elements(x->'firmantes') f
                                      where f->>'id' = v_yo::text)),
    'puedo_rechazar', (v->>'estado') = 'borrador'
                    and (v->>'creado_por') is distinct from v_yo::text
                    and exists (
                      select 1 from jsonb_array_elements(v->'reglas') x,
                                    jsonb_array_elements(x->'firmantes') f
                       where f->>'id' = v_yo::text),
    'puedo_pedir', (v->>'estado') = 'borrador'
                   and (v->>'requiere')::boolean
                   and not (v->>'completa')::boolean
                   and public.puede('ordenes.emitir', v_contrato),
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
               'accion', a.accion, 'nombre', a.usuario_nombre, 'cargo', a.usuario_cargo,
               'monto', a.monto, 'comentario', a.comentario, 'en', a.ocurrido_en)
             order by a.ocurrido_en desc)
        from public.aprobaciones a
       where a.empresa_id = public.empresa_actual() and a.documento = 'compra'
         and a.registro_id = p_orden), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.autorizacion_de_orden(text) to authenticated;

/* Para la lista de órdenes: cómo va cada borrador que se está mirando. */
create or replace function public.autorizacion_de_ordenes(p_ordenes text[])
returns table (orden_id text, requiere boolean, completa boolean, rechazada boolean, pedida boolean, me_toca boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text;
  v jsonb;
  v_yo text := auth.uid()::text;
begin
  foreach v_id in array coalesce(p_ordenes, '{}') loop
    continue when not public.ve_registro('ordenes_compra_proveedor', v_id);
    v := public._autorizacion_compra(public.empresa_actual(), v_id);
    continue when v is null or (v->>'estado') <> 'borrador';
    orden_id := v_id;
    requiere := (v->>'requiere')::boolean;
    completa := (v->>'completa')::boolean;
    rechazada := (v->'rechazada') <> 'null'::jsonb;
    pedida := (v->>'pedida_en') is not null;
    me_toca := not completa and not rechazada
               and (v->>'creado_por') is distinct from v_yo
               and exists (
                 select 1 from jsonb_array_elements(v->'reglas') x
                  where x->'firma' = 'null'::jsonb
                    and exists (select 1 from jsonb_array_elements(x->'firmantes') f
                                 where f->>'id' = v_yo));
    return next;
  end loop;
end;
$$;

grant execute on function public.autorizacion_de_ordenes(text[]) to authenticated;

-- ─── 4. Pedir, autorizar, rechazar ──────────────────────────────────────────

create or replace function public._pesos(n bigint)
returns text
language sql
immutable
as $$ select '$' || replace(to_char(coalesce(n, 0), 'FM999,999,999,999'), ',', '.'); $$;

create or replace function public.decidir_compra(p_orden text, p_accion text, p_comentario text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa text := public.empresa_actual();
  v_yo uuid := auth.uid();
  v jsonb;
  o record;
  yo record;
  v_comentario text := nullif(trim(coalesce(p_comentario, '')), '');
  v_avisar uuid[];
  v_titulo text;
  v_url text;
begin
  if v_yo is null then raise exception 'Falta la sesión.'; end if;
  if p_accion not in ('solicitado', 'aprobado', 'rechazado') then
    raise exception 'Acción desconocida: %.', p_accion;
  end if;
  if not public.ve_registro('ordenes_compra_proveedor', p_orden) then
    raise exception 'No se encontró la orden, o tu acceso no la alcanza.';
  end if;

  select oc.id, oc.numero, oc.proveedor, oc.contrato_id, oc.creado_por, oc.estado
    into o
    from public.ordenes_compra_proveedor oc
   where oc.empresa_id = v_empresa and oc.id = p_orden;
  if o.estado <> 'borrador' then
    raise exception 'La orden % ya no está en borrador: la autorización se pide antes de emitirla.', o.numero;
  end if;

  v := public._autorizacion_compra(v_empresa, p_orden);
  if not (v->>'requiere')::boolean then
    raise exception 'Esta orden no necesita autorización: ningún tramo de Aprobaciones la alcanza.';
  end if;

  select p.nombre, p.cargo, p.rol into yo from public.perfiles p where p.id = v_yo;
  v_url := '/abastecimiento/ordenes/?autorizar=' || p_orden;
  v_titulo := o.numero || ' · ' || coalesce(o.proveedor, '') || ' · ' || public._pesos((v->>'neto')::bigint) || ' neto';

  if p_accion = 'solicitado' then
    if not public.puede('ordenes.emitir', o.contrato_id) then
      raise exception 'Tu acceso no permite pedir la autorización de esta orden.';
    end if;
    if (v->>'completa')::boolean then
      raise exception 'La orden ya tiene todas sus firmas: se puede emitir.';
    end if;
  elsif o.creado_por = v_yo then
    raise exception 'Quien creó la orden no puede autorizarla: tiene que firmarla otra persona.';
  elsif p_accion = 'aprobado' then
    if not exists (
      select 1 from jsonb_array_elements(v->'reglas') x
       where x->'firma' = 'null'::jsonb
         and exists (select 1 from jsonb_array_elements(x->'firmantes') f where f->>'id' = v_yo::text)
    ) then
      raise exception 'Tu firma no es la que falta en esta orden (o ya firmaste).';
    end if;
  else -- rechazado
    if v_comentario is null then raise exception 'Para rechazar, escribe el motivo.'; end if;
    if not exists (
      select 1 from jsonb_array_elements(v->'reglas') x, jsonb_array_elements(x->'firmantes') f
       where f->>'id' = v_yo::text
    ) then
      raise exception 'No estás entre quienes autorizan esta orden.';
    end if;
  end if;

  insert into public.aprobaciones
    (empresa_id, documento, registro_id, monto, accion, usuario_id, usuario_nombre, usuario_cargo, usuario_rol, comentario)
  values
    (v_empresa, 'compra', p_orden, (v->>'neto')::bigint, p_accion, v_yo, yo.nombre, yo.cargo, yo.rol, v_comentario);

  v := public._autorizacion_compra(v_empresa, p_orden);

  -- Los avisos. Nunca deben frenar la firma.
  begin
    if p_accion = 'solicitado' then
      select array_agg(distinct (f->>'id')::uuid) into v_avisar
        from jsonb_array_elements(v->'reglas') x, jsonb_array_elements(x->'firmantes') f
       where x->'firma' = 'null'::jsonb and (f->>'id')::uuid <> v_yo
         and (f->>'id')::uuid is distinct from o.creado_por;
      perform public.avisar_a(v_avisar, v_empresa, 'compra.por_autorizar',
        'Compra por autorizar: ' || v_titulo,
        'La pide ' || coalesce(yo.nombre, 'Abastecimiento') || coalesce('. «' || v_comentario || '»', '') || '.',
        v_url, p_orden, false);
    else
      -- Al que la creó y a quien la pidió.
      select array_agg(distinct u) into v_avisar
        from (
          select o.creado_por as u
          union
          select a.usuario_id from public.aprobaciones a
           where a.empresa_id = v_empresa and a.documento = 'compra'
             and a.registro_id = p_orden and a.accion = 'solicitado'
        ) s
       where u is not null and u <> v_yo;
      if p_accion = 'rechazado' then
        perform public.avisar_a(v_avisar, v_empresa, 'compra.rechazada',
          'Compra rechazada: ' || v_titulo,
          coalesce(yo.nombre, '') || ': «' || v_comentario || '»', v_url, p_orden, true);
      elsif (v->>'completa')::boolean then
        perform public.avisar_a(v_avisar, v_empresa, 'compra.autorizada',
          'Compra autorizada: ' || v_titulo,
          'Ya tiene todas sus firmas (la última, de ' || coalesce(yo.nombre, '') || '). Ya se puede emitir y enviar.',
          v_url, p_orden, false);
      else
        -- Falta otra firma: se le avisa a quien la tiene que dar.
        select array_agg(distinct (f->>'id')::uuid) into v_avisar
          from jsonb_array_elements(v->'reglas') x, jsonb_array_elements(x->'firmantes') f
         where x->'firma' = 'null'::jsonb and (f->>'id')::uuid <> v_yo
           and (f->>'id')::uuid is distinct from o.creado_por;
        perform public.avisar_a(v_avisar, v_empresa, 'compra.por_autorizar',
          'Compra por autorizar: ' || v_titulo,
          'Ya firmó ' || coalesce(yo.nombre, '') || '. Falta la tuya.', v_url, p_orden, false);
      end if;
    end if;
  exception when others then
    raise warning 'decidir_compra (avisos): %', sqlerrm;
  end;

  return public.autorizacion_de_orden(p_orden);
end;
$$;

grant execute on function public.decidir_compra(text, text, text) to authenticated;

-- ─── 5. El candado ──────────────────────────────────────────────────────────
-- Una OC no sale de borrador sin sus firmas. Los procesos del servidor (scripts,
-- webhooks, sin sesión) no pasan por acá: no hay persona que firme.

create or replace function public._faltan_firmas_texto(v jsonb)
returns text
language sql
immutable
as $$
  select string_agg(
           (x->>'titulo') || coalesce(' (' || (
             select string_agg(f->>'nombre', ' o ' order by f->>'nombre')
               from jsonb_array_elements(x->'firmantes') f) || ')', ''),
           ', ')
    from jsonb_array_elements(v->'reglas') x
   where x->'firma' = 'null'::jsonb;
$$;

create or replace function public.exigir_autorizacion_de_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null then return new; end if;
  if new.estado in ('borrador', 'anulada') then return new; end if;
  if tg_op = 'UPDATE' and old.estado is distinct from 'borrador' then return new; end if;

  v := public._autorizacion_compra(new.empresa_id, new.id);
  -- Recién creada todavía no tiene ítems: se mira con neto 0.
  if v is null then
    if exists (select 1 from public.reglas_aprobacion ra
                where ra.empresa_id = new.empresa_id and ra.documento = 'compra' and ra.activa
                  and ra.monto_desde = 0
                  and (ra.contratos is null or new.contrato_id = any (ra.contratos))) then
      raise exception 'Una orden nueva parte en borrador: guárdala así, pide la autorización y emítela cuando tenga sus firmas.';
    end if;
    return new;
  end if;
  if (v->>'completa')::boolean then return new; end if;

  if (v->'rechazada') <> 'null'::jsonb then
    raise exception 'Esta compra fue rechazada por % («%»). Corrígela y vuelve a pedir la autorización.',
      v->'rechazada'->>'nombre', v->'rechazada'->>'motivo';
  end if;
  raise exception 'Esta compra (% neto) necesita autorización antes de emitirse. Falta la firma de: %. Pídela con el botón «Autorización» de la lista de órdenes.',
    public._pesos((v->>'neto')::bigint), coalesce(public._faltan_firmas_texto(v), '—');
end;
$$;

drop trigger if exists exigir_autorizacion_de_compra on public.ordenes_compra_proveedor;
create trigger exigir_autorizacion_de_compra
  before insert or update of estado on public.ordenes_compra_proveedor
  for each row execute function public.exigir_autorizacion_de_compra();

/* Subirle el monto a una OC ya autorizada y emitida necesita firmar de nuevo.
   Las emitidas sin pasar por autorización (las de antes, o sin reglas) no se tocan. */
create or replace function public.exigir_autorizacion_al_subir_monto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v jsonb;
begin
  if auth.uid() is null or new.orden_id is null then return new; end if;
  select estado into v_estado from public.ordenes_compra_proveedor
   where empresa_id = new.empresa_id and id = new.orden_id;
  if v_estado is null or v_estado in ('borrador', 'anulada') then return new; end if;
  if not exists (select 1 from public.aprobaciones a
                  where a.empresa_id = new.empresa_id and a.documento = 'compra'
                    and a.registro_id = new.orden_id and a.accion = 'aprobado') then
    return new;
  end if;
  v := public._autorizacion_compra(new.empresa_id, new.orden_id);
  if v is not null and not (v->>'completa')::boolean then
    raise exception 'Esta orden se autorizó por un monto menor (ahora suma % neto). Para subirlo, pásala a borrador y vuelve a pedir la autorización.',
      public._pesos((v->>'neto')::bigint);
  end if;
  return new;
end;
$$;

drop trigger if exists exigir_autorizacion_al_subir_monto on public.items_compra;
create trigger exigir_autorizacion_al_subir_monto
  after insert or update of cantidad, precio_unitario on public.items_compra
  for each row execute function public.exigir_autorizacion_al_subir_monto();

-- ─── 6. Guardar una regla desde la pantalla ─────────────────────────────────

create or replace function public.guardar_regla_compra(
  p_id text, p_titulo text, p_desde bigint, p_hasta bigint, p_contratos text[],
  p_firmantes uuid[], p_activa boolean, p_orden smallint
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa text := public.empresa_actual();
  v_id text := coalesce(nullif(trim(coalesce(p_id, '')), ''), 'RA-' || substr(md5(random()::text), 1, 10));
begin
  if not public.tiene_permiso('parametros.editar') then
    raise exception 'Solo quien puede cambiar parámetros configura las aprobaciones.';
  end if;
  if nullif(trim(coalesce(p_titulo, '')), '') is null then raise exception 'La firma necesita un nombre.'; end if;
  if coalesce(p_desde, 0) < 0 then raise exception 'El monto «desde» no puede ser negativo.'; end if;
  if p_hasta is not null and p_hasta < coalesce(p_desde, 0) then
    raise exception 'El monto «hasta» es menor que el «desde».';
  end if;
  if p_activa and coalesce(cardinality(p_firmantes), 0) = 0 then
    raise exception 'Elige al menos una persona que firme. Sin firmantes, ninguna orden de ese tramo podría emitirse.';
  end if;
  if p_contratos is not null and cardinality(p_contratos) = 0 then
    raise exception 'Elige al menos un contrato, o todos.';
  end if;
  if exists (select 1 from unnest(coalesce(p_firmantes, '{}')) u
              where not exists (select 1 from public.perfiles p where p.id = u and p.empresa_id = v_empresa)) then
    raise exception 'Una de las personas elegidas no es de esta empresa.';
  end if;

  insert into public.reglas_aprobacion (empresa_id, id, documento, monto_desde, monto_hasta, rol, titulo, contratos, activa, orden)
  values (v_empresa, v_id, 'compra', coalesce(p_desde, 0), p_hasta, null, trim(p_titulo), p_contratos, coalesce(p_activa, true), coalesce(p_orden, 1))
  on conflict (empresa_id, id) do update
    set monto_desde = excluded.monto_desde,
        monto_hasta = excluded.monto_hasta,
        titulo = excluded.titulo,
        contratos = excluded.contratos,
        activa = excluded.activa,
        orden = excluded.orden;

  delete from public.reglas_aprobacion_firmantes f
   where f.empresa_id = v_empresa and f.regla_id = v_id
     and not f.usuario_id = any (coalesce(p_firmantes, '{}'));
  insert into public.reglas_aprobacion_firmantes (empresa_id, regla_id, usuario_id)
  select v_empresa, v_id, u from unnest(coalesce(p_firmantes, '{}')) u
  on conflict do nothing;

  return v_id;
end;
$$;

grant execute on function public.guardar_regla_compra(text, text, bigint, bigint, text[], uuid[], boolean, smallint) to authenticated;

create or replace function public.borrar_regla_compra(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tiene_permiso('parametros.editar') then
    raise exception 'Solo quien puede cambiar parámetros configura las aprobaciones.';
  end if;
  delete from public.reglas_aprobacion
   where empresa_id = public.empresa_actual() and id = p_id and documento = 'compra';
end;
$$;

grant execute on function public.borrar_regla_compra(text) to authenticated;

-- ─── 7. El switch viejo se va ───────────────────────────────────────────────
-- «Autorizar la compra» no decía cuánto ni de qué contrato. Lo reemplaza la
-- pantalla Aprobaciones. Al borrarlo se van solos los switches que lo daban.

delete from public.permisos where id = 'compra.autorizar';

-- Las reglas por rol de la 0015 (si alguna quedó) no tienen firmantes: se apagan
-- para que no bloqueen ninguna orden.
update public.reglas_aprobacion ra
   set activa = false
 where ra.documento = 'compra' and ra.activa
   and not exists (select 1 from public.reglas_aprobacion_firmantes f
                    where f.empresa_id = ra.empresa_id and f.regla_id = ra.id);

commit;

notify pgrst, 'reload schema';
