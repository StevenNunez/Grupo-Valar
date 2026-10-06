-- ============================================================================
-- 0063 — El costo de cada motivo de HH extra, y los finiquitos
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0062.
--
-- Pedido del 06-10-2026: "cuánto gasté este mes en pago de personal" tiene
-- que salir de todo lo que se paga. Dos cosas que faltaban:
--
--   1. HH extra con su costo POR MOTIVO (reemplazos, parada de planta,
--      feriado compensado, apoyo oficina, otras). Antes solo había un costo
--      total. Ahora horas_extra_monto es la suma de los cinco y la calcula la
--      base. Igual en contratos (costos_personal) y en Oficina Central
--      (nominas_oficina_central): es la misma ficha.
--
--   2. Finiquitos: un registro propio por trabajador, en el mes en que se
--      pagan. Con contrato_id = de un contrato (suma a su costo de personal,
--      al Dashboard y al resultado por anexo); sin contrato = Oficina Central.
--      Se respaldan con el finiquito firmado, adjunto con el clip.
--
-- Los datos que ya tenían un costo total de HH extra sin desglose se reparten
-- entre sus motivos en proporción a las horas de cada uno (si no tenían
-- horas, va todo a "otras"). Al día de hoy eso solo pasa en el demo.
-- ============================================================================

-- ─── 1. Costo por motivo de HH extra ────────────────────────────────────────

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['costos_personal', 'nominas_oficina_central'] loop
    foreach c in array array['monto_hh_reemplazo', 'monto_hh_parada_planta', 'monto_hh_feriado_compensado',
                             'monto_hh_apoyo_oficina', 'monto_hh_otras'] loop
      execute format('alter table public.%I add column if not exists %I bigint not null default 0', t, c);
      execute format('alter table public.%I drop constraint if exists %I', t, t || '_' || c || '_check');
      execute format('alter table public.%I add constraint %I check (%I >= 0)', t, t || '_' || c || '_check', c);
    end loop;
  end loop;
end;
$$;

/* Lo que ya estaba: el total sin desglose se reparte por horas. El redondeo
   que sobra va al motivo con más horas, para que la suma calce al peso. */
do $$
declare
  t text;
  r record;
  hh numeric[];
  m bigint[];
  total_hh numeric;
  mayor int;
begin
  foreach t in array array['costos_personal', 'nominas_oficina_central'] loop
    for r in execute format(
      'select empresa_id, id, horas_extra_monto,
              hh_reemplazo, hh_parada_planta, hh_feriado_compensado, hh_apoyo_oficina, hh_otras
         from public.%I
        where horas_extra_monto > 0
          and monto_hh_reemplazo + monto_hh_parada_planta + monto_hh_feriado_compensado
              + monto_hh_apoyo_oficina + monto_hh_otras = 0', t)
    loop
      hh := array[r.hh_reemplazo, r.hh_parada_planta, r.hh_feriado_compensado, r.hh_apoyo_oficina, r.hh_otras];
      total_hh := hh[1] + hh[2] + hh[3] + hh[4] + hh[5];
      if total_hh <= 0 then
        m := array[0, 0, 0, 0, r.horas_extra_monto]::bigint[];
      else
        m := array[
          floor(r.horas_extra_monto * hh[1] / total_hh), floor(r.horas_extra_monto * hh[2] / total_hh),
          floor(r.horas_extra_monto * hh[3] / total_hh), floor(r.horas_extra_monto * hh[4] / total_hh),
          floor(r.horas_extra_monto * hh[5] / total_hh)]::bigint[];
        mayor := 1;
        for i in 2..5 loop
          if hh[i] > hh[mayor] then mayor := i; end if;
        end loop;
        m[mayor] := m[mayor] + (r.horas_extra_monto - (m[1] + m[2] + m[3] + m[4] + m[5]));
      end if;
      execute format(
        'update public.%I set monto_hh_reemplazo = $1, monto_hh_parada_planta = $2, monto_hh_feriado_compensado = $3,
                monto_hh_apoyo_oficina = $4, monto_hh_otras = $5
          where empresa_id = $6 and id = $7', t)
        using m[1], m[2], m[3], m[4], m[5], r.empresa_id, r.id;
    end loop;
  end loop;
end;
$$;

/* El costo total de HH extra pasa a ser la suma de los motivos. Si los cinco
   vienen en cero se respeta lo que llegue: así la pantalla anterior (la que
   escribía solo el total) no borra el costo mientras se publica la nueva. */
create or replace function public.cuadrar_haberes()
returns trigger
language plpgsql
as $$
declare
  por_motivo bigint := new.monto_hh_reemplazo + new.monto_hh_parada_planta + new.monto_hh_feriado_compensado
                       + new.monto_hh_apoyo_oficina + new.monto_hh_otras;
begin
  -- Las horas extra del mes son la suma de sus motivos, y su costo también.
  new.horas_extra_cantidad :=
    new.hh_reemplazo
    + new.hh_parada_planta
    + new.hh_feriado_compensado
    + new.hh_apoyo_oficina
    + new.hh_otras;
  if por_motivo > 0 then
    new.horas_extra_monto := por_motivo;
  end if;

  -- El total de haberes, la suma de todo lo que se pagó. El costo de las HH
  -- extra entra íntegro: como los sueldos, no es afecto a IVA.
  new.remuneraciones :=
    new.sueldo_bruto
    + new.horas_extra_monto
    + new.total_no_imponible
    + new.otros_haberes;

  return new;
end;
$$;

/* Oficina Central: total_haberes y costo_total son columnas generadas, que la
   base calcula después de este trigger; acá solo se suma el costo por motivo. */
create or replace function public.sumar_costo_hh_extra()
returns trigger
language plpgsql
as $$
declare
  por_motivo bigint := new.monto_hh_reemplazo + new.monto_hh_parada_planta + new.monto_hh_feriado_compensado
                       + new.monto_hh_apoyo_oficina + new.monto_hh_otras;
begin
  if por_motivo > 0 then
    new.horas_extra_monto := por_motivo;
  end if;
  return new;
end;
$$;

drop trigger if exists nominas_oficina_central_hh_extra on public.nominas_oficina_central;
create trigger nominas_oficina_central_hh_extra before insert or update on public.nominas_oficina_central
  for each row execute function public.sumar_costo_hh_extra();

-- ─── 2. Finiquitos ──────────────────────────────────────────────────────────

create table if not exists public.finiquitos (
  empresa_id text not null default public.empresa_actual() references public.empresas(id),
  id text not null default ('FQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  -- Nulo = personal de Oficina Central.
  contrato_id text,
  anexo_id text,
  categoria_id text,
  -- El mes en que se paga: es el mes en que cuenta como costo.
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  fecha_pago date,
  trabajador text not null check (btrim(trabajador) <> ''),
  rut text,
  cargo text,
  causal text check (causal is null or causal in (
    'renuncia', 'mutuo_acuerdo', 'vencimiento_plazo', 'termino_obra',
    'necesidades_empresa', 'despido_otra_causal', 'otro')),
  indemnizacion_anios bigint not null default 0 check (indemnizacion_anios >= 0),
  indemnizacion_aviso bigint not null default 0 check (indemnizacion_aviso >= 0),
  feriado_proporcional bigint not null default 0 check (feriado_proporcional >= 0),
  otros_montos bigint not null default 0 check (otros_montos >= 0),
  total bigint generated always as (indemnizacion_anios + indemnizacion_aviso + feriado_proporcional + otros_montos) stored,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id),
  constraint finiquitos_contrato_fkey foreign key (empresa_id, contrato_id)
    references public.contratos (empresa_id, id) on delete restrict,
  constraint finiquitos_anexo_fkey foreign key (empresa_id, anexo_id)
    references public.anexos (empresa_id, id) on delete set null (anexo_id),
  constraint finiquitos_categoria_fkey foreign key (empresa_id, categoria_id)
    references public.categorias_costo (empresa_id, id) on delete set null (categoria_id),
  constraint finiquitos_anexo_con_contrato check (anexo_id is null or contrato_id is not null)
);

comment on table public.finiquitos is
  'Finiquitos pagados, uno por trabajador, en el mes en que se pagan. Con contrato: suma al costo de personal del contrato. Sin contrato: Oficina Central.';
comment on column public.finiquitos.otros_montos is
  'Remuneraciones pendientes, bonos u otros conceptos del finiquito que no son indemnización ni feriado.';

create index if not exists finiquitos_contrato_idx on public.finiquitos (empresa_id, contrato_id, periodo);

drop trigger if exists finiquitos_autoria on public.finiquitos;
create trigger finiquitos_autoria before insert or update on public.finiquitos
  for each row execute function public.marcar_autoria();
drop trigger if exists finiquitos_actualizado on public.finiquitos;
create trigger finiquitos_actualizado before update on public.finiquitos
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists finiquitos_anexo_valido on public.finiquitos;
create trigger finiquitos_anexo_valido before insert or update of anexo_id, contrato_id on public.finiquitos
  for each row execute function public.validar_anexo_del_contrato();
drop trigger if exists finiquitos_auditoria on public.finiquitos;
create trigger finiquitos_auditoria after insert or update or delete on public.finiquitos
  for each row execute function public.registrar_auditoria();

/* Los mismos permisos que la nómina de cada lado: el de un contrato, como su
   Personal; el de Oficina Central, como la nómina de Oficina Central. */
alter table public.finiquitos enable row level security;

drop policy if exists "finiquitos: lee" on public.finiquitos;
create policy "finiquitos: lee" on public.finiquitos for select to authenticated using (
  public.ve_empresa(empresa_id) and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.ver')
    else public.puede('personal.ver', contrato_id)
  end);

drop policy if exists "finiquitos: crea" on public.finiquitos;
create policy "finiquitos: crea" on public.finiquitos for insert to authenticated with check (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.editar')
    else public.puede('personal.editar', contrato_id)
  end);

drop policy if exists "finiquitos: cambia" on public.finiquitos;
create policy "finiquitos: cambia" on public.finiquitos for update to authenticated using (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.editar')
    else public.puede('personal.editar', contrato_id)
  end) with check (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.editar')
    else public.puede('personal.editar', contrato_id)
  end);

drop policy if exists "finiquitos: borra" on public.finiquitos;
create policy "finiquitos: borra" on public.finiquitos for delete to authenticated using (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('personal.editar')
    else public.puede('personal.editar', contrato_id)
  end);

grant select, insert, update, delete on public.finiquitos to authenticated;

/* Historial y respaldo (el finiquito firmado) se ven si se ve el registro. */
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
    'nominas_oficina_central',
    'recepciones', 'recepcion_items', 'factura_items', 'notas_credito', 'nota_credito_items',
    'finiquitos'
  ])) then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id::text = $1)', tabla)
     into visto
    using registro;
  return visto;
end;
$$;

alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'facturas', 'ordenes_compra', 'compras',
    'servicios', 'costos_personal', 'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos', 'articulos',
    'nominas_oficina_central', 'recepciones', 'notas_credito', 'finiquitos'
  )
);

-- ─── 3. Los finiquitos de un contrato suman a su costo ──────────────────────
-- Mismas columnas y tipos en las dos vistas: `create or replace` alcanza.

create or replace view public.contratos_resumen
with (security_invoker = true) as
SELECT c.id,
    c.nombre,
    c.cliente,
    c.faena,
    c.avance,
        CASE
            WHEN c.moneda = 'UF'::text AND c.monto_uf IS NOT NULL AND uf_hoy() IS NOT NULL THEN round(c.monto_uf * uf_hoy())::bigint
            ELSE c.presupuesto
        END AS presupuesto,
    c.estado,
    c.termino,
    COALESCE(co.ordinario, 0::numeric)::bigint AS costo_compras,
    COALESCE(sv.ordinario, 0::numeric)::bigint AS costo_servicios,
    COALESCE(pe.personal, 0::numeric)::bigint AS costo_personal,
    (COALESCE(co.reembolsable, 0::numeric) + COALESCE(sv.reembolsable, 0::numeric))::bigint AS costo_reembolsable,
    (COALESCE(co.ordinario, 0::numeric) + COALESCE(sv.ordinario, 0::numeric) + COALESCE(pe.personal, 0::numeric))::bigint AS costo_real,
    COALESCE(fa.facturado, 0::numeric)::bigint AS facturado
   FROM contratos c
     LEFT JOIN ( SELECT compras.contrato_id,
            sum(compras.neto) FILTER (WHERE compras.tipo = 'ordinario'::text) AS ordinario,
            sum(compras.neto) FILTER (WHERE compras.tipo = 'reembolsable'::text) AS reembolsable
           FROM compras
          GROUP BY compras.contrato_id) co ON co.contrato_id = c.id
     LEFT JOIN ( SELECT servicios.contrato_id,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'ordinario'::text) AS ordinario,
            sum(servicios.neto) FILTER (WHERE servicios.tipo = 'reembolsable'::text) AS reembolsable
           FROM servicios
          GROUP BY servicios.contrato_id) sv ON sv.contrato_id = c.id
     LEFT JOIN ( SELECT x.contrato_id,
            sum(x.monto) AS personal
           FROM ( SELECT costos_personal.contrato_id, costos_personal.costo_total AS monto
                   FROM costos_personal
                UNION ALL
                 SELECT finiquitos.contrato_id, finiquitos.total AS monto
                   FROM finiquitos
                  WHERE finiquitos.contrato_id IS NOT NULL) x
          GROUP BY x.contrato_id) pe ON pe.contrato_id = c.id
     LEFT JOIN ( SELECT facturas.contrato_id,
            sum(facturas.neto) AS facturado
           FROM facturas
          GROUP BY facturas.contrato_id) fa ON fa.contrato_id = c.id;

create or replace view public.costos_unificados
with (security_invoker = true) as
SELECT d.id,
    d.contrato_id,
    d.categoria_id,
    d.categoria,
    d.familia,
    d.fecha,
    d.periodo,
    COALESCE(d.factura_proveedor, d.orden_proveedor, 'Sin proveedor'::text) AS tercero,
    d.descripcion AS detalle,
    d.tipo,
    d.neto,
    d.iva,
    d.total,
    COALESCE(d.estado_pago, 'pendiente'::text) AS estado_pago,
    d.anexo_id
   FROM items_detalle d
UNION ALL
 SELECT c.id,
    c.contrato_id,
    c.categoria_id,
    COALESCE(cat.nombre, 'Sin categoría'::text) AS categoria,
    COALESCE(cat.familia, 'compras'::text) AS familia,
    c.fecha,
    COALESCE(c.periodo_control, date_trunc('month'::text, c.fecha::timestamp with time zone)::date) AS periodo,
    c.proveedor AS tercero,
    c.detalle,
    c.tipo,
    c.neto,
    c.iva,
    c.total,
    c.estado_pago,
    c.anexo_id
   FROM compras c
     LEFT JOIN categorias_costo cat ON cat.empresa_id = c.empresa_id AND cat.id = c.categoria_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM items_compra i
          WHERE i.empresa_id = c.empresa_id AND i.compra_id = c.id)) AND NOT (EXISTS ( SELECT 1
           FROM factura_items fi
          WHERE fi.empresa_id = c.empresa_id AND fi.compra_id = c.id))
UNION ALL
 SELECT s.id,
    s.contrato_id,
    s.categoria_id,
    COALESCE(cat.nombre, 'Servicios'::text) AS categoria,
    COALESCE(cat.familia, 'servicios'::text) AS familia,
    s.fecha,
    date_trunc('month'::text, s.fecha::timestamp with time zone)::date AS periodo,
    s.contratista AS tercero,
    s.detalle,
    s.tipo,
    s.neto,
    s.iva,
    s.total,
    s.estado_pago,
    s.anexo_id
   FROM servicios s
     LEFT JOIN categorias_costo cat ON cat.empresa_id = s.empresa_id AND cat.id = s.categoria_id
UNION ALL
 SELECT p.id,
    p.contrato_id,
    p.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    p.periodo AS fecha,
    p.periodo,
    p.faena AS tercero,
    'Remuneraciones y leyes sociales'::text AS detalle,
    'ordinario'::text AS tipo,
    p.costo_total AS neto,
    0::bigint AS iva,
    p.costo_total AS total,
    'pagada'::text AS estado_pago,
    p.anexo_id
   FROM costos_personal p
     LEFT JOIN categorias_costo cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
UNION ALL
 SELECT f.id,
    f.contrato_id,
    f.categoria_id,
    COALESCE(cat.nombre, 'Personal'::text) AS categoria,
    COALESCE(cat.familia, 'personal'::text) AS familia,
    COALESCE(f.fecha_pago, f.periodo) AS fecha,
    f.periodo,
    f.trabajador AS tercero,
    'Finiquito'::text AS detalle,
    'ordinario'::text AS tipo,
    f.total AS neto,
    0::bigint AS iva,
    f.total AS total,
    'pagada'::text AS estado_pago,
    f.anexo_id
   FROM finiquitos f
     LEFT JOIN categorias_costo cat ON cat.empresa_id = f.empresa_id AND cat.id = f.categoria_id
  WHERE f.contrato_id IS NOT NULL;

notify pgrst, 'reload schema';
