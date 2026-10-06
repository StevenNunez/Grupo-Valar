-- ============================================================================
-- 0064 — Otros haberes, con qué es cada uno
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0063.
--
-- Pedido del 06-10-2026: "otros haberes" era un solo monto y no había cómo
-- decir si fue aguinaldo, un bono u otra cosa. Ahora se carga como una lista
-- de concepto y monto (`otros_haberes_detalle`), y `otros_haberes` es su suma,
-- calculada por la base. Igual en contratos y en Oficina Central.
--
-- Formato: [{"concepto": "Aguinaldo fiestas patrias", "monto": 150000}, ...]
-- Si la lista viene vacía se respeta el monto que llegue: así los registros
-- antiguos (solo el total) siguen como estaban.
-- ============================================================================

alter table public.costos_personal
  add column if not exists otros_haberes_detalle jsonb not null default '[]'::jsonb;
alter table public.nominas_oficina_central
  add column if not exists otros_haberes_detalle jsonb not null default '[]'::jsonb;

comment on column public.costos_personal.otros_haberes_detalle is
  'Qué son los otros haberes: [{concepto, monto}]. otros_haberes es su suma.';
comment on column public.nominas_oficina_central.otros_haberes_detalle is
  'Qué son los otros haberes: [{concepto, monto}]. otros_haberes es su suma.';

/* La suma de la lista. Nula si la lista está vacía (entonces manda el monto). */
create or replace function public.suma_otros_haberes(detalle jsonb)
returns bigint
language sql
immutable
as $$
  select case
    when jsonb_typeof(detalle) = 'array' and jsonb_array_length(detalle) > 0
      then (select coalesce(sum(round(coalesce((e ->> 'monto')::numeric, 0))), 0)::bigint
              from jsonb_array_elements(detalle) e)
  end
$$;

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

  -- Otros haberes: la suma de su detalle, si lo trae.
  new.otros_haberes := coalesce(public.suma_otros_haberes(new.otros_haberes_detalle), new.otros_haberes);

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

/* Oficina Central: total_haberes y costo_total son generadas y se calculan
   después de este trigger. */
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
  new.otros_haberes := coalesce(public.suma_otros_haberes(new.otros_haberes_detalle), new.otros_haberes);
  return new;
end;
$$;

notify pgrst, 'reload schema';
