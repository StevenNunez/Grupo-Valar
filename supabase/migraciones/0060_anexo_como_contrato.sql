-- ============================================================================
-- 0060 — El anexo, como un contrato: fechas, condiciones y adendas
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0059.
--
-- Pedido del 06-10-2026: "un anexo es al final como un contrato nuevo" y "un
-- anexo puede tener otro anexo o adenda". Entonces:
--
--   · inicio: desde cuándo rige (el término ya estaba: nueva_fecha_termino).
--   · condiciones: lo propio de la forma de contratación del contrato
--     (equipos y tarifas, itemizado, hitos, honorario), igual que
--     contratos.condiciones. Opcional; montos netos.
--   · anexo_padre_id: una adenda cuelga de otro anexo DEL MISMO contrato. La
--     numeración sigue siendo una sola por contrato (no hay dos "N°3").
--
-- Lo cargado a una adenda suma al resultado de su anexo principal: eso lo
-- resuelve la pantalla con `anexo_padre_id`; la base guarda el anexo exacto.
-- ============================================================================

alter table public.anexos
  add column if not exists inicio date,
  add column if not exists condiciones jsonb not null default '{}'::jsonb,
  add column if not exists anexo_padre_id text;

comment on column public.anexos.condiciones is
  'Lo propio de la forma de contratación del contrato, para este anexo (mismo formato que contratos.condiciones). Opcional; montos netos.';
comment on column public.anexos.anexo_padre_id is
  'Si es adenda de otro anexo del mismo contrato. Nulo = anexo directo del contrato.';

alter table public.anexos drop constraint if exists anexos_padre_fkey;
alter table public.anexos add constraint anexos_padre_fkey
  foreign key (empresa_id, anexo_padre_id) references public.anexos (empresa_id, id) on delete restrict;

/* La adenda es del mismo contrato que su anexo, y nunca de sí misma ni de
   una adenda suya (sin ciclos). */
create or replace function public.validar_padre_del_anexo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actual text := new.anexo_padre_id;
  vueltas int := 0;
begin
  if new.anexo_padre_id is null then
    return new;
  end if;
  if new.anexo_padre_id = new.id then
    raise exception 'Un anexo no puede ser adenda de sí mismo.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.anexos a
                  where a.empresa_id = new.empresa_id and a.id = new.anexo_padre_id and a.contrato_id = new.contrato_id) then
    raise exception 'La adenda tiene que ser de un anexo del mismo contrato.' using errcode = 'check_violation';
  end if;
  while actual is not null and vueltas < 20 loop
    if actual = new.id then
      raise exception 'Esa relación haría un ciclo entre anexos.' using errcode = 'check_violation';
    end if;
    select a.anexo_padre_id into actual from public.anexos a where a.empresa_id = new.empresa_id and a.id = actual;
    vueltas := vueltas + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists anexos_padre_valido on public.anexos;
create trigger anexos_padre_valido before insert or update of anexo_padre_id, contrato_id on public.anexos
  for each row execute function public.validar_padre_del_anexo();

create index if not exists anexos_padre_idx on public.anexos (empresa_id, anexo_padre_id) where anexo_padre_id is not null;

notify pgrst, 'reload schema';
