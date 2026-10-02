-- ============================================================================
-- Plataforma Valar — El costo de personal, como está en la planilla
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0024.
--
-- DOS CORRECCIONES, contrastadas contra «Control de gestión integrado - 2026»:
--
-- 1. No se pide "sueldo base + gratificación": se pide el SUELDO BRUTO y ya.
--    Separar base de gratificación obligaba a abrir la nómina y hacer una resta
--    que después nadie usaba para nada.
--
--    Ojo con el nombre: hasta ahora "sueldo bruto" era el TOTAL de haberes.
--    Como en la planilla el sueldo bruto es la remuneración imponible, el total
--    pasa a llamarse TOTAL HABERES. Dejar dos cosas distintas llamadas igual en
--    la misma pantalla es garantía de que alguien cargue una donde va la otra.
--
-- 2. Las HH EXTRA se llevan EN HORAS, abiertas por motivo, y su costo va
--    aparte. Así está en la hoja Miscelaneos:
--
--      Reemplazo por vacaciones o licencias    130 h
--      Parada de planta                        316 h
--      Feriado compensado                      192 h
--      Apoyo oficina                            52 h
--      Otras                                     0 h
--      ──────────────────────────────────────────────
--      Total HH extra                          690 h      ← suma de los motivos
--      Costo total HH extra             $7.814.283        ← se ingresa aparte
--      HH promedio                          $11.325       ← costo ÷ horas
--
--    Las horas y los pesos son cosas distintas y no se derivan una de otra: el
--    valor de la hora cambia mes a mes ($11.325 en junio, $10.369 en julio),
--    así que calcular uno a partir del otro daría cifras que nadie pagó.
--
--    NI EL TOTAL DE HORAS NI EL DE HABERES SE TECLEAN: los suma el trigger. Un
--    total escrito a mano que no cuadra con lo que lo compone es la forma más
--    común de descuadrar una planilla.
--
-- NINGUNA CIFRA CAMBIA: las horas que hoy están cargadas pasan a "otras" —no
-- sabemos su motivo y adivinarlo sería inventar—, el costo queda donde está, y
-- el total de haberes sigue dando exactamente lo mismo.
-- ============================================================================

-- ─── 1. Sueldo bruto ────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'costos_personal'
      and column_name = 'sueldo_base_gratificacion'
  ) then
    alter table public.costos_personal
      rename column sueldo_base_gratificacion to sueldo_bruto;
  end if;
end;
$$;

alter table public.costos_personal
  add column if not exists sueldo_bruto bigint not null default 0
    check (sueldo_bruto >= 0);

comment on column public.costos_personal.sueldo_bruto is
  'La remuneración imponible del mes, como viene en la nómina. No se pide el desglose base/gratificación.';

comment on column public.costos_personal.remuneraciones is
  'Total haberes: sueldo bruto + costo HH extra + no imponible + otros haberes. NO se teclea.';

-- ─── 2. Las HH extra, en horas y por motivo ─────────────────────────────────
-- numeric y no entero: la planilla lleva medias horas.

alter table public.costos_personal
  add column if not exists hh_reemplazo numeric(10, 2) not null default 0
    check (hh_reemplazo >= 0);

alter table public.costos_personal
  add column if not exists hh_parada_planta numeric(10, 2) not null default 0
    check (hh_parada_planta >= 0);

alter table public.costos_personal
  add column if not exists hh_feriado_compensado numeric(10, 2) not null default 0
    check (hh_feriado_compensado >= 0);

alter table public.costos_personal
  add column if not exists hh_apoyo_oficina numeric(10, 2) not null default 0
    check (hh_apoyo_oficina >= 0);

alter table public.costos_personal
  add column if not exists hh_otras numeric(10, 2) not null default 0
    check (hh_otras >= 0);

/* Si una corrida anterior las creó como pesos, se convierten. El `using` es
   explícito para que no falle la conversión de bigint a numeric. */
do $$
declare
  col text;
begin
  foreach col in array array[
    'hh_reemplazo', 'hh_parada_planta', 'hh_feriado_compensado',
    'hh_apoyo_oficina', 'hh_otras'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'costos_personal'
        and column_name = col and data_type <> 'numeric'
    ) then
      execute format(
        'alter table public.costos_personal alter column %I type numeric(10,2) using %I::numeric',
        col, col
      );
    end if;
  end loop;
end;
$$;

comment on column public.costos_personal.hh_reemplazo is
  'Horas extra por reemplazo de vacaciones o licencias.';
comment on column public.costos_personal.hh_parada_planta is
  'Horas extra por parada de planta.';
comment on column public.costos_personal.hh_feriado_compensado is
  'Horas extra por feriado compensado.';
comment on column public.costos_personal.hh_apoyo_oficina is
  'Horas extra por apoyo a oficina.';
comment on column public.costos_personal.hh_otras is
  'El resto de las horas extra del mes. Existe para que el total siempre pueda cuadrar con la planilla.';

comment on column public.costos_personal.horas_extra_cantidad is
  'Total HH extra del mes, en horas. NO se teclea: es la suma de los cinco motivos.';
comment on column public.costos_personal.horas_extra_monto is
  'Costo total de las HH extra, en pesos. Se ingresa: el valor de la hora cambia mes a mes.';
comment on column public.costos_personal.otros_haberes is
  'Haberes que no son sueldo, ni HH extra, ni no imponible. Existe para que el total cuadre con la nómina.';

-- Las horas ya cargadas pasan a "otras": no sabemos por qué motivo se hicieron,
-- y repartirlas entre los cinco sería inventarlo.
update public.costos_personal
set hh_otras = horas_extra_cantidad
where horas_extra_cantidad > 0
  and hh_reemplazo = 0
  and hh_parada_planta = 0
  and hh_feriado_compensado = 0
  and hh_apoyo_oficina = 0
  and hh_otras = 0;

-- ─── Deshacer el intento anterior, si alcanzó a correr ──────────────────────
-- Una versión previa leyó mal la instrucción y trató estos conceptos como bonos
-- en pesos, aparte de las horas extra. Si esas columnas existen, lo que tengan
-- vuelve a donde corresponde y se sueltan.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'costos_personal'
      and column_name = 'parada_planta'
  ) then
    -- Eran pesos: se suman al costo de las HH extra, no a las horas.
    update public.costos_personal
    set horas_extra_monto = horas_extra_monto + parada_planta
    where parada_planta > 0;
    alter table public.costos_personal drop column parada_planta;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'costos_personal'
      and column_name = 'bono_feriado'
  ) then
    update public.costos_personal
    set horas_extra_monto = horas_extra_monto + bono_feriado
    where bono_feriado > 0;
    alter table public.costos_personal drop column bono_feriado;
  end if;

  -- Los aguinaldos no son HH extra: vuelven a `otros_haberes`, donde vivían.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'costos_personal'
      and column_name = 'aguinaldos'
  ) then
    update public.costos_personal
    set otros_haberes = otros_haberes + aguinaldos
    where aguinaldos > 0;
    alter table public.costos_personal drop column aguinaldos;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'costos_personal'
      and column_name = 'bonos'
  ) then
    alter table public.costos_personal drop column bonos;
  end if;
end;
$$;

-- ─── El trigger, con las dos sumas ──────────────────────────────────────────

create or replace function public.cuadrar_haberes()
returns trigger
language plpgsql
as $$
begin
  -- Las horas extra del mes son la suma de sus motivos.
  new.horas_extra_cantidad :=
    new.hh_reemplazo
    + new.hh_parada_planta
    + new.hh_feriado_compensado
    + new.hh_apoyo_oficina
    + new.hh_otras;

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

comment on function public.cuadrar_haberes() is
  'Las HH extra son la suma de sus motivos en horas, y el total de haberes la suma del bruto, el costo de las HH extra, el no imponible y los otros haberes. Siempre.';

drop trigger if exists costos_personal_haberes on public.costos_personal;
create trigger costos_personal_haberes
  before insert or update on public.costos_personal
  for each row execute function public.cuadrar_haberes();

/* Se recalculan las filas que ya estaban: el trigger corre solo en insert y
   update, y sin esto los totales quedarían con el valor viejo. Las partes son
   las mismas, así que ninguna cifra se mueve. */
update public.costos_personal set actualizado_en = actualizado_en;

notify pgrst, 'reload schema';
