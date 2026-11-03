-- ============================================================================
-- 0109 · Activos: una lista propia en Valar, al día con Pagnol por avisos
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar entero
-- → Run. Idempotente. Va DESPUÉS de la 0108.
--
-- ANTES: cada vez que alguien abría Activos, la plataforma le pedía a Pagnol
-- TODOS los activos (de 100 en 100) y los mezclaba en el navegador con lo que
-- Valar sabe. Con cientos de activos era lento; con más de mil, además,
-- PostgREST corta en 1000 filas sin avisar.
--
-- AHORA: `activos_valar` tiene una fila por cada activo de Pagnol, con una copia
-- mínima de cómo se ve allá (código, nombre, estado, valor y fecha de compra,
-- número de referencia) y lo que Valar agrega (contrato de origen, ubicación,
-- propiedad, valor). La pantalla lee SOLO esta tabla: abre al instante, busca
-- y suma en la base, y trae de a 50.
--
--   · Pagnol sigue siendo la fuente de verdad: la copia nunca se edita en Valar
--     y se corrige sola con los avisos `activo.*` o con «Actualizar desde Pagnol».
--   · `identificado` separa lo que ya se revisó de lo recién llegado de Pagnol.
--   · `activos_sincronizacion` dice cuándo fue la última vez que se puso al día.
-- ============================================================================

-- ── 1. Lo que se copia de Pagnol ────────────────────────────────────────────
alter table public.activos_valar add column if not exists estado text;
alter table public.activos_valar add column if not exists external_ref text;
alter table public.activos_valar add column if not exists valor_pagnol numeric;
alter table public.activos_valar add column if not exists fecha_pagnol date;
alter table public.activos_valar add column if not exists pagnol_actualizado_en timestamptz;
alter table public.activos_valar add column if not exists sincronizado_en timestamptz;
/* Las filas que ya existían las identificó una persona: quedan como identificadas.
   Las que crea la sincronización entran en `false` hasta que alguien las revise. */
alter table public.activos_valar add column if not exists identificado boolean not null default true;

comment on column public.activos_valar.estado is 'Estado en Pagnol (operativo, en_mantencion, extraviado, de_baja). Copia de lectura: manda Pagnol.';
comment on column public.activos_valar.valor_pagnol is 'Valor de compra que Pagnol tiene anotado, neto. Se usa mientras Valar no ponga el suyo (`valor`).';
comment on column public.activos_valar.identificado is 'false = llegó de Pagnol y nadie ha confirmado todavía contrato de origen, ubicación ni propiedad.';
comment on column public.activos_valar.sincronizado_en is 'Cuándo cambió por última vez la copia de Pagnol en esta fila.';

create index if not exists activos_valar_codigo_idx on public.activos_valar (empresa_id, codigo);

-- ── 2. Cuándo se puso al día por última vez ─────────────────────────────────
create table if not exists public.activos_sincronizacion (
  empresa_id text primary key references public.empresas (id),
  ultima_en timestamptz not null default now(),
  completa_en timestamptz
);

alter table public.activos_sincronizacion enable row level security;
drop policy if exists "activos sync: lee" on public.activos_sincronizacion;
create policy "activos sync: lee" on public.activos_sincronizacion for select to authenticated
  using (public.ve_empresa(empresa_id) and public.tiene_permiso('oficina_central.ver'));
grant select on public.activos_sincronizacion to authenticated;

-- ── 3. Poner al día desde Pagnol (la llama el servidor, nunca el navegador) ──
-- Recibe activos tal como los entrega Pagnol. Agrega los que no estaban (sin
-- identificar) y corrige la copia de los que cambiaron, sin tocar lo que Valar
-- sabe. No hace nada si nada cambió: así la bitácora no se llena de ruido.
create or replace function public.sincronizar_activos_pagnol(
  p_empresa text,
  p_activos jsonb,
  p_completa boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cambiados integer := 0;
  n integer;
begin
  create temporary table if not exists _act_pagnol (
    id uuid, codigo text, nombre text, estado text, ref text,
    valor numeric, fecha date, actualizado timestamptz
  ) on commit drop;
  truncate _act_pagnol;

  insert into _act_pagnol
  select (x ->> 'id')::uuid,
         x ->> 'codigo',
         x ->> 'nombre',
         x ->> 'estado',
         nullif(x ->> 'external_ref', ''),
         nullif(x ->> 'valor_compra', '')::numeric,
         nullif(x ->> 'fecha_compra', '')::date,
         coalesce(nullif(x ->> 'updated_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_activos, '[]'::jsonb)) x
   where x ->> 'id' is not null;

  update public.activos_valar a
     set codigo = d.codigo,
         nombre = d.nombre,
         estado = d.estado,
         external_ref = d.ref,
         valor_pagnol = d.valor,
         fecha_pagnol = d.fecha,
         pagnol_actualizado_en = d.actualizado,
         sincronizado_en = now()
    from _act_pagnol d
   where a.empresa_id = p_empresa
     and a.pagnol_activo_id = d.id
     and (a.codigo, a.nombre, a.estado, a.external_ref, a.valor_pagnol, a.fecha_pagnol, a.pagnol_actualizado_en)
         is distinct from (d.codigo, d.nombre, d.estado, d.ref, d.valor, d.fecha, d.actualizado);
  get diagnostics n = row_count;
  cambiados := cambiados + n;

  /* Los arriendos de Pagnol no suman patrimonio: se sugiere «arrendado» hasta que alguien lo confirme. */
  insert into public.activos_valar (
    empresa_id, pagnol_activo_id, codigo, nombre, estado, external_ref, valor_pagnol,
    fecha_pagnol, pagnol_actualizado_en, sincronizado_en, identificado, propiedad
  )
  select p_empresa, d.id, d.codigo, d.nombre, d.estado, d.ref, d.valor, d.fecha, d.actualizado, now(), false,
         case when d.nombre ~* '^\s*arriendo\M' then 'arrendado' else 'propio' end
    from _act_pagnol d
   where not exists (
     select 1 from public.activos_valar a where a.empresa_id = p_empresa and a.pagnol_activo_id = d.id
   )
  on conflict (empresa_id, pagnol_activo_id) do nothing;
  get diagnostics n = row_count;
  cambiados := cambiados + n;

  insert into public.activos_sincronizacion (empresa_id, ultima_en, completa_en)
  values (p_empresa, now(), case when p_completa then now() end)
  on conflict (empresa_id) do update
    set ultima_en = now(),
        completa_en = case when p_completa then now() else public.activos_sincronizacion.completa_en end;

  return cambiados;
end;
$$;

revoke all on function public.sincronizar_activos_pagnol(text, jsonb, boolean) from public, anon, authenticated;

-- ── 4. La lista que lee la pantalla ─────────────────────────────────────────
-- Una fila por activo de Pagnol y una por cada línea comprada como «activo» que
-- Pagnol todavía no conoce. Con security_invoker: cada persona ve lo que sus
-- permisos le dejan ver.
create or replace view public.activos_vista
with (security_invoker = true) as
select u.*,
       case
         when u.ubicacion is null then 'sin_identificar'
         when u.ubicacion = 'oficina_central' then 'oficina_central'
         else coalesce(u.contrato_ubicacion, 'sin_identificar')
       end as lugar,
       (u.propiedad = 'propio' and coalesce(u.estado, 'operativo') not in ('de_baja', 'extraviado')) as suma_patrimonio
  from (
    /* Activos de Pagnol */
    select a.pagnol_activo_id::text as clave,
           a.pagnol_activo_id as pagnol_id,
           null::text as linea_id,
           a.codigo,
           a.nombre,
           coalesce(a.estado, 'operativo') as estado,
           a.external_ref,
           a.identificado,
           a.propiedad,
           coalesce(a.contrato_origen_id, oc.contrato_id) as origen,
           (a.contrato_origen_id is null and oc.contrato_id is not null) as origen_de_la_orden,
           case when a.identificado then a.ubicacion end as ubicacion,
           case when a.identificado then a.contrato_ubicacion_id end as contrato_ubicacion,
           coalesce(a.valor, a.valor_pagnol) as valor,
           case when a.valor is not null then 'valar' when a.valor_pagnol is not null then 'pagnol' end as valor_de,
           coalesce(a.fecha_compra, a.fecha_pagnol) as fecha,
           coalesce(a.observaciones, '') as observaciones,
           a.sincronizado_en
      from public.activos_valar a
      left join public.ordenes_compra_proveedor oc
        on oc.empresa_id = a.empresa_id
       and oc.id = substring(a.external_ref from '^valar:oc:([^:]+):item:')
     where a.pagnol_activo_id is not null

    union all

    /* Comprados como «activo» y todavía sin ficha en Pagnol (0100) */
    select 'linea:' || l.id::text,
           null::uuid,
           l.id::text,
           'Compra a ' || coalesce(l.tercero, 'proveedor'),
           coalesce(nullif(l.detalle, ''), 'Activo comprado'),
           'operativo',
           null::text,
           (a.id is not null),
           coalesce(a.propiedad, 'propio'),
           coalesce(a.contrato_origen_id, l.contrato_id),
           (a.contrato_origen_id is null),
           /* Un activo gastado en un contrato ya es de la empresa: parte en Oficina Central (0099). */
           coalesce(a.ubicacion, 'oficina_central'),
           a.contrato_ubicacion_id,
           coalesce(a.valor, l.neto),
           case when a.valor is not null then 'valar' else 'compra' end,
           coalesce(a.fecha_compra, l.fecha),
           coalesce(a.observaciones, ''),
           null::timestamptz
      from public.costos_unificados l
      left join public.activos_valar a
        on a.empresa_id = public.empresa_actual() and a.linea_id = l.id::text
     where l.es_activo
       and not exists (
         select 1 from public.activos_valar p
          where p.empresa_id = public.empresa_actual()
            and p.external_ref is not null
            and position(':item:' || l.id::text || ':' in p.external_ref || ':') > 0
       )
  ) u;

grant select on public.activos_vista to authenticated;

-- ── 5. Las cifras de arriba, calculadas en la base sobre TODOS los activos ──
create or replace function public.resumen_activos()
returns jsonb
language sql
stable
set search_path = public
as $$
  with v as (select * from public.activos_vista)
  select jsonb_build_object(
    'total', (select count(*) from v),
    'propios', (select count(*) from v where suma_patrimonio),
    'arrendados', (select count(*) from v where propiedad = 'arrendado'),
    'del_cliente', (select count(*) from v where propiedad = 'del_cliente'),
    'patrimonio', (select coalesce(sum(valor), 0) from v where suma_patrimonio and valor > 0),
    'con_valor', (select count(*) from v where suma_patrimonio and valor > 0),
    'sin_valor', (select count(*) from v where suma_patrimonio and coalesce(valor, 0) = 0),
    'costo_arriendos', (select coalesce(sum(valor), 0) from v where propiedad = 'arrendado'),
    'por_identificar', (select count(*) from v where not identificado),
    'ultima_sync', (select max(ultima_en) from public.activos_sincronizacion),
    'completa_sync', (select max(completa_en) from public.activos_sincronizacion),
    'lugares', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', lugar, 'cantidad', cantidad, 'valor', valor))
        from (
          select lugar, count(*) as cantidad,
                 coalesce(sum(valor) filter (where suma_patrimonio), 0) as valor
            from v group by lugar
        ) t), '[]'::jsonb),
    'origenes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', origen, 'cantidad', cantidad, 'valor', valor,
               'en_oficina', en_oficina, 'en_su_contrato', en_su_contrato,
               'en_otro', en_otro, 'sin_ubicar', sin_ubicar))
        from (
          select origen, count(*) as cantidad,
                 coalesce(sum(valor) filter (where suma_patrimonio), 0) as valor,
                 count(*) filter (where ubicacion = 'oficina_central') as en_oficina,
                 count(*) filter (where ubicacion = 'contrato' and contrato_ubicacion = origen) as en_su_contrato,
                 count(*) filter (where ubicacion = 'contrato' and contrato_ubicacion is distinct from origen) as en_otro,
                 count(*) filter (where ubicacion is null) as sin_ubicar
            from v where origen is not null group by origen
        ) t), '[]'::jsonb)
  );
$$;

grant execute on function public.resumen_activos() to authenticated;

notify pgrst, 'reload schema';
