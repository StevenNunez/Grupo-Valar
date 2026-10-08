-- ============================================================================
-- 0066 — Sueldo líquido, descuento del trabajador y aporte patronal
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0065.
--
-- Pedido del 08-10-2026: la nómina se carga como viene en la liquidación.
--
--   Sueldo bruto, no imponible, descuento del trabajador, imposiciones y
--   aporte patronal. De ahí salen, sin HH extra:
--     líquido     = bruto + no imponible − descuento − imposiciones
--     costo base  = líquido + imposiciones + descuento + aporte patronal
--                 = bruto + no imponible + aporte patronal
--   y después se suman las HH extra y los otros haberes:
--     costo total = costo base + HH extra + otros haberes
--
-- El costo es lo que la empresa desembolsa por su gente: el descuento
-- (pensión de alimentos, seguros, deudas retenidas por ley) se le quita al
-- trabajador, pero la empresa igual lo paga a un tercero. Por eso baja el
-- líquido y no el costo. Lo mismo las imposiciones, que van a la AFP.
--
-- Las imposiciones (AFP, salud, cesantía del trabajador) son lo que hasta
-- ahora se llamaba "leyes sociales": se quedan en la columna leyes_sociales.
-- Como salen del bruto, ya no se suman aparte al costo; lo que la empresa
-- paga encima es el aporte patronal, que es una columna nueva.
--
-- Igual en contratos (costos_personal) y en Oficina Central
-- (nominas_oficina_central): es la misma ficha.
--
-- Al 08-10-2026 solo el demo tiene nóminas cargadas; su única leyes_sociales
-- distinta de cero es la nómina de Oficina Central ($1.500), que baja eso.
-- ============================================================================

alter table public.costos_personal
  add column if not exists descuento_trabajador bigint not null default 0,
  add column if not exists aporte_patronal bigint not null default 0;
alter table public.nominas_oficina_central
  add column if not exists descuento_trabajador numeric(15, 0) not null default 0,
  add column if not exists aporte_patronal numeric(15, 0) not null default 0;

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['costos_personal', 'nominas_oficina_central'] loop
    foreach c in array array['descuento_trabajador', 'aporte_patronal'] loop
      execute format('alter table public.%I drop constraint if exists %I', t, t || '_' || c || '_check');
      execute format('alter table public.%I add constraint %I check (%I >= 0)', t, t || '_' || c || '_check', c);
    end loop;
  end loop;
end;
$$;

comment on column public.costos_personal.leyes_sociales is
  'Imposiciones del trabajador (AFP, salud, cesantía). Salen del sueldo bruto: no se suman aparte al costo.';
comment on column public.nominas_oficina_central.leyes_sociales is
  'Imposiciones del trabajador (AFP, salud, cesantía). Salen del sueldo bruto: no se suman aparte al costo.';
comment on column public.costos_personal.descuento_trabajador is
  'Seguros y descuentos legales (pensión de alimentos, deudas retenidas por ley). No imposiciones ni anticipos. Restan del líquido, no del costo: la empresa igual los paga a un tercero.';
comment on column public.nominas_oficina_central.descuento_trabajador is
  'Seguros y descuentos legales (pensión de alimentos, deudas retenidas por ley). No imposiciones ni anticipos. Restan del líquido, no del costo: la empresa igual los paga a un tercero.';
comment on column public.costos_personal.aporte_patronal is
  'Lo que paga la empresa encima del bruto (SIS, seguro de cesantía del empleador, mutual).';
comment on column public.nominas_oficina_central.aporte_patronal is
  'Lo que paga la empresa encima del bruto (SIS, seguro de cesantía del empleador, mutual).';

/* El costo total con la fórmula nueva. Postgres 17 cambia la expresión de una
   columna generada sin botarla, así contratos_resumen y costos_unificados,
   que la leen, siguen en pie. remuneraciones = bruto + HH extra + no
   imponible + otros haberes (lo arma el trigger cuadrar_haberes). */
alter table public.costos_personal
  alter column costo_total set expression as (remuneraciones + aporte_patronal);
alter table public.nominas_oficina_central
  alter column costo_total set expression as (
    sueldo_bruto + horas_extra_monto + total_no_imponible + otros_haberes + aporte_patronal);

notify pgrst, 'reload schema';
