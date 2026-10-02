-- ============================================================================
-- Plataforma Valar — El costo de personal se desglosa como la nómina de pagos
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0019.
--
-- POR QUÉ: `costos_personal` guardaba un solo número de remuneraciones. La
-- nómina de pagos, que es el documento que respalda esa cifra, viene abierta:
--
--   Sueldo base + gratificación
--   Horas extraordinarias, en pesos y en cantidad de horas
--   Total no imponible (colación, movilización, viáticos)
--   Sueldo bruto = total haberes
--
-- Con un solo número no se puede contrastar la carga contra la nómina, ni
-- responder "cuánto de este mes fueron horas extra", que es la pregunta que se
-- discute con el mandante.
--
-- EL BRUTO NO SE TECLEA: lo calcula un trigger sumando las partes. Un total
-- escrito a mano que no cuadra con lo que lo compone es la forma más común de
-- descuadrar una planilla, y acá el total es el que alimenta el margen.
--
-- CUIDADO CON LO YA CARGADO: hay tres meses de datos reales donde solo existe
-- el total. Antes de encender el trigger, ese total se copia al sueldo base;
-- así ninguna cifra cambia y el desglose queda para lo que se cargue de ahora
-- en adelante.
-- ============================================================================

-- ─── Las partes de la nómina ────────────────────────────────────────────────

alter table public.costos_personal
  add column if not exists sueldo_base_gratificacion bigint not null default 0
    check (sueldo_base_gratificacion >= 0);

alter table public.costos_personal
  add column if not exists horas_extra_monto bigint not null default 0
    check (horas_extra_monto >= 0);

alter table public.costos_personal
  add column if not exists horas_extra_cantidad numeric(10, 2) not null default 0
    check (horas_extra_cantidad >= 0);

alter table public.costos_personal
  add column if not exists total_no_imponible bigint not null default 0
    check (total_no_imponible >= 0);

/* Bonos y asignaciones que no caen en las columnas anteriores. Existe para que
   el bruto SIEMPRE pueda cuadrar con la nómina: sin esta columna, una nómina
   con un bono de producción obligaría a inflar el sueldo base para que el total
   diera, y ahí se pierde el desglose. */
alter table public.costos_personal
  add column if not exists otros_haberes bigint not null default 0
    check (otros_haberes >= 0);

comment on column public.costos_personal.sueldo_base_gratificacion is
  'Sueldo base más gratificación legal, como viene en la nómina.';
comment on column public.costos_personal.horas_extra_monto is
  'Lo pagado en horas extraordinarias, en pesos.';
comment on column public.costos_personal.horas_extra_cantidad is
  'Cuántas horas extraordinarias fueron. Sin esto, el monto no se puede comparar entre meses.';
comment on column public.costos_personal.total_no_imponible is
  'Colación, movilización y viáticos: haberes que no cotizan.';
comment on column public.costos_personal.horas_hombre is
  'HH ordinarias del mes. Las extraordinarias van en horas_extra_cantidad.';
comment on column public.costos_personal.remuneraciones is
  'Sueldo bruto (total haberes). NO se teclea: lo calcula el trigger sumando las partes.';

-- ─── Lo ya cargado conserva su cifra ────────────────────────────────────────
-- Tres meses de datos reales tienen solo el total. Se copia al sueldo base: no
-- sabemos el desglose de esos meses, y ponerlo entero en la primera columna es
-- la única forma honesta de que la suma siga dando lo mismo.

update public.costos_personal
set sueldo_base_gratificacion = remuneraciones
where remuneraciones > 0
  and sueldo_base_gratificacion = 0
  and horas_extra_monto = 0
  and total_no_imponible = 0
  and otros_haberes = 0;

-- ─── El bruto se calcula ────────────────────────────────────────────────────
-- Trigger y no columna generada a propósito: `remuneraciones` alimenta
-- `costo_total`, que a su vez alimenta `costos_unificados`, `resumen_mensual` y
-- `costos_por_categoria`. Convertirla en generada obligaría a bajar y volver a
-- levantar esa cadena entera de vistas para ganar lo mismo que hace esto.

create or replace function public.cuadrar_haberes()
returns trigger
language plpgsql
as $$
begin
  new.remuneraciones :=
    new.sueldo_base_gratificacion
    + new.horas_extra_monto
    + new.total_no_imponible
    + new.otros_haberes;
  return new;
end;
$$;

comment on function public.cuadrar_haberes() is
  'El sueldo bruto es la suma de sus partes, siempre. Corre antes de cada insert y update.';

drop trigger if exists costos_personal_haberes on public.costos_personal;
create trigger costos_personal_haberes
  before insert or update on public.costos_personal
  for each row execute function public.cuadrar_haberes();

-- ─── La nómina de pagos es el respaldo ──────────────────────────────────────
-- `costos_personal` ya estaba en la lista de tablas que admiten adjuntos, así
-- que la nómina se sube desde el clip de la fila. Queda dicho acá porque es el
-- documento que respalda estas cifras y no un adjunto cualquiera.

comment on table public.costos_personal is
  'Costo de mano de obra por contrato, mes y categoría. Se respalda con la nómina de pagos, que se adjunta a la fila.';

notify pgrst, 'reload schema';
