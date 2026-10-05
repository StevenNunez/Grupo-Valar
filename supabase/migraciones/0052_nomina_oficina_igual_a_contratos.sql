-- ============================================================================
-- 0052 — La nómina de Oficina Central, igual que la de los contratos
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Va después de la
-- 0050. Se puede correr de nuevo.
--
-- POR QUÉ: el 05-10-2026 el usuario pidió que "Nueva nómina" en Oficina
-- Central sea el mismo formulario que "Nuevo costo de personal" de los
-- contratos: un registro por mes con los totales de la nómina (dotación, HH,
-- sueldo bruto, HH extra por motivo, no imponible, otros haberes, leyes
-- sociales) y el PDF adjunto. Sin detalle por persona.
--
-- La 0048 había armado el mes como suma de trabajadores. Lo que haya cargado
-- se suma en el mes antes de quitar esa tabla: no se pierde ningún monto (sí
-- el nombre de cada persona, que es justamente lo que ya no se lleva).
-- ============================================================================

alter table public.nominas_oficina_central
  add column if not exists dotacion integer not null default 0 check (dotacion >= 0),
  add column if not exists horas_hombre integer not null default 0 check (horas_hombre >= 0),
  add column if not exists sueldo_bruto numeric(15, 0) not null default 0 check (sueldo_bruto >= 0),
  add column if not exists hh_reemplazo numeric(8, 1) not null default 0 check (hh_reemplazo >= 0),
  add column if not exists hh_parada_planta numeric(8, 1) not null default 0 check (hh_parada_planta >= 0),
  add column if not exists hh_feriado_compensado numeric(8, 1) not null default 0 check (hh_feriado_compensado >= 0),
  add column if not exists hh_apoyo_oficina numeric(8, 1) not null default 0 check (hh_apoyo_oficina >= 0),
  add column if not exists hh_otras numeric(8, 1) not null default 0 check (hh_otras >= 0),
  add column if not exists horas_extra_monto numeric(15, 0) not null default 0 check (horas_extra_monto >= 0),
  add column if not exists total_no_imponible numeric(15, 0) not null default 0 check (total_no_imponible >= 0),
  add column if not exists otros_haberes numeric(15, 0) not null default 0 check (otros_haberes >= 0),
  add column if not exists leyes_sociales numeric(15, 0) not null default 0 check (leyes_sociales >= 0);

alter table public.nominas_oficina_central
  add column if not exists horas_extra_cantidad numeric(9, 1)
    generated always as (hh_reemplazo + hh_parada_planta + hh_feriado_compensado + hh_apoyo_oficina + hh_otras) stored,
  add column if not exists total_haberes numeric(15, 0)
    generated always as (sueldo_bruto + horas_extra_monto + total_no_imponible + otros_haberes) stored,
  add column if not exists costo_total numeric(15, 0)
    generated always as (sueldo_bruto + horas_extra_monto + total_no_imponible + otros_haberes + leyes_sociales) stored;

comment on column public.nominas_oficina_central.sueldo_bruto is
  'Sueldo base + gratificación del mes. Mismos campos y cálculo que costos_personal.';

/* Lo cargado persona por persona pasa a los totales del mes. Solo si la tabla
   todavía existe: al correrla de nuevo ya no está. */
do $$
begin
  if to_regclass('public.nomina_oficina_trabajadores') is not null then
    update public.nominas_oficina_central n
       set dotacion = t.personas,
           sueldo_bruto = t.sueldo_bruto,
           hh_reemplazo = t.hh_reemplazo,
           hh_parada_planta = t.hh_parada_planta,
           hh_feriado_compensado = t.hh_feriado_compensado,
           hh_apoyo_oficina = t.hh_apoyo_oficina,
           hh_otras = t.hh_otras,
           horas_extra_monto = t.horas_extra_monto,
           total_no_imponible = t.total_no_imponible,
           otros_haberes = t.otros_haberes,
           leyes_sociales = t.leyes_sociales
      from (
        select empresa_id, nomina_id, count(*) as personas,
               sum(sueldo_bruto) as sueldo_bruto, sum(hh_reemplazo) as hh_reemplazo,
               sum(hh_parada_planta) as hh_parada_planta, sum(hh_feriado_compensado) as hh_feriado_compensado,
               sum(hh_apoyo_oficina) as hh_apoyo_oficina, sum(hh_otras) as hh_otras,
               sum(horas_extra_monto) as horas_extra_monto, sum(total_no_imponible) as total_no_imponible,
               sum(otros_haberes) as otros_haberes, sum(leyes_sociales) as leyes_sociales
          from public.nomina_oficina_trabajadores
         group by empresa_id, nomina_id
      ) t
     where n.empresa_id = t.empresa_id and n.id = t.nomina_id;

    drop table public.nomina_oficina_trabajadores;
  end if;
end;
$$;

/* `ve_registro` deja de aceptar la tabla que ya no existe: si alguien pidiera
   su historial, el `execute` fallaría en vez de responder "no". */
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

notify pgrst, 'reload schema';
