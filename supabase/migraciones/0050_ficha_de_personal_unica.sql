-- ============================================================================
-- 0050 — Una sola ficha de personal: Oficina Central igual que los contratos
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Va DESPUÉS de la
-- 0048. Se puede correr de nuevo: cada paso mira si ya se hizo.
--
-- POR QUÉ: el pedido del 05-10-2026 fue que el ingreso de personal se llene con
-- la misma ficha en los contratos y en Oficina Central, porque es la misma
-- información de la nómina. La 0048 había hecho una versión corta para la
-- oficina (horas extra en un solo número, sin "otros haberes") y con nombres
-- propios. Ahora las columnas se llaman y se calculan igual que en
-- `costos_personal`:
--
--   sueldo_base   → sueldo_bruto        (sueldo base + gratificación)
--   no_imponible  → total_no_imponible
--   + hh_reemplazo, hh_parada_planta, hh_feriado_compensado, hh_apoyo_oficina,
--     hh_otras (las horas extra por motivo) y otros_haberes
--   horas_extra_cantidad pasa a ser la suma de los cinco motivos
--   total_haberes ahora incluye otros_haberes
--
-- LO QUE YA ESTÉ CARGADO no se pierde: las horas extra que se escribieron en un
-- solo número pasan a "Otras", que es exactamente lo que eran.
-- ============================================================================

do $$
begin
  -- Los nombres de la ficha de contratos.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'nomina_oficina_trabajadores'
                and column_name = 'sueldo_base') then
    alter table public.nomina_oficina_trabajadores rename column sueldo_base to sueldo_bruto;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'nomina_oficina_trabajadores'
                and column_name = 'no_imponible') then
    alter table public.nomina_oficina_trabajadores rename column no_imponible to total_no_imponible;
  end if;
end;
$$;

alter table public.nomina_oficina_trabajadores
  add column if not exists hh_reemplazo numeric(8, 1) not null default 0 check (hh_reemplazo >= 0),
  add column if not exists hh_parada_planta numeric(8, 1) not null default 0 check (hh_parada_planta >= 0),
  add column if not exists hh_feriado_compensado numeric(8, 1) not null default 0 check (hh_feriado_compensado >= 0),
  add column if not exists hh_apoyo_oficina numeric(8, 1) not null default 0 check (hh_apoyo_oficina >= 0),
  add column if not exists hh_otras numeric(8, 1) not null default 0 check (hh_otras >= 0),
  add column if not exists otros_haberes numeric(15, 0) not null default 0 check (otros_haberes >= 0);

/* Las horas extra escritas como un solo número pasan a "Otras", y la columna
   vuelve como suma de los motivos. Solo si todavía es una columna común. */
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'nomina_oficina_trabajadores'
                and column_name = 'horas_extra_cantidad' and is_generated = 'NEVER') then
    update public.nomina_oficina_trabajadores
       set hh_otras = horas_extra_cantidad
     where horas_extra_cantidad > 0 and hh_otras = 0;
    alter table public.nomina_oficina_trabajadores drop column horas_extra_cantidad;
  end if;
end;
$$;

alter table public.nomina_oficina_trabajadores
  add column if not exists horas_extra_cantidad numeric(9, 1)
    generated always as (hh_reemplazo + hh_parada_planta + hh_feriado_compensado + hh_apoyo_oficina + hh_otras) stored;

/* Los totales se rehacen para sumar "otros haberes", igual que en contratos.
   Una columna generada no se puede cambiar: se bota y se vuelve a crear. Solo
   se hace si la fórmula todavía no incluye otros_haberes. */
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'nomina_oficina_trabajadores'
                    and column_name = 'total_haberes' and generation_expression like '%otros_haberes%') then
    alter table public.nomina_oficina_trabajadores drop column if exists costo_total;
    alter table public.nomina_oficina_trabajadores drop column if exists total_haberes;
    alter table public.nomina_oficina_trabajadores
      add column total_haberes numeric(15, 0)
        generated always as (sueldo_bruto + horas_extra_monto + total_no_imponible + otros_haberes) stored;
    alter table public.nomina_oficina_trabajadores
      add column costo_total numeric(15, 0)
        generated always as (sueldo_bruto + horas_extra_monto + total_no_imponible + otros_haberes + leyes_sociales) stored;
  end if;
end;
$$;

comment on column public.nomina_oficina_trabajadores.sueldo_bruto is
  'Sueldo base + gratificación: la remuneración imponible del mes. Mismo nombre que en costos_personal.';

notify pgrst, 'reload schema';
