-- ════════════════════════════════════════════════════════════════════════════
-- 0130 — Recepción fuera del ciclo normal: "esto ya lo recibí yo"
-- ════════════════════════════════════════════════════════════════════════════
--
-- El ciclo normal: lo comprado llega a Oficina Central, logística (o el
-- pañolero en Pagnol, si la OC está anunciada) lo recibe y de ahí sale a faena.
-- Pero a veces quien pidió la compra la retira él mismo del proveedor o se la
-- entregan directo en faena (pedido del usuario, 25-11-2026, por Jean Camilo
-- Trigo, Jefe de Operaciones). Antes había que pedirle a otro que la anotara
-- ("Retiro Jean de Oficina Central", 19-10-2026) y, si la OC estaba anunciada a
-- Pagnol, Valar ni siquiera ofrecía esas líneas: la orden quedaba esperando.
--
--   · Permiso nuevo `recepcion.directa`: registra la recepción de lo que llegó
--     por fuera del ciclo, también las líneas que Pagnol esperaba.
--   · La recepción queda marcada `fuera_de_ciclo` con su MOTIVO, obligatorio
--     (al menos 10 caracteres): por qué no pasó por logística/pañol.
--   · No entra stock ni activos a un pañol de Pagnol (no pasó por uno). La
--     plataforma le avisa a Pagnol que deje de esperarlo.
--
-- De paso se cierra una holgura: hasta hoy la base dejaba registrar o borrar
-- recepciones a cualquiera con algún permiso de escritura en Abastecimiento
-- (`escribe_en`), por ejemplo solo "Crear solicitudes". La pantalla pedía
-- `recepcion.registrar` o `gestion.editar`; ahora la base pide lo mismo
-- (o `recepcion.directa`, solo para las fuera del ciclo).
--
-- Se puede volver a correr.

begin;

set local search_path = public, extensions;

-- ─── 1. El permiso ──────────────────────────────────────────────────────────

insert into public.permisos (id, titulo, descripcion, grupo, orden, modulo_id, lectura) values
  ('recepcion.directa', 'Recibir fuera del ciclo',
   'Anotar que recibió él mismo lo que pidió (retiro en el proveedor, entrega en faena), con el motivo.',
   'Abastecimiento', 43, 'abastecimiento', false)
on conflict (id) do update
  set titulo = excluded.titulo, descripcion = excluded.descripcion, grupo = excluded.grupo,
      orden = excluded.orden, modulo_id = excluded.modulo_id, lectura = excluded.lectura;

-- Ningún nivel lo trae de fábrica (el Administrador del módulo tiene todo):
-- se prende persona por persona.

-- Jean Camilo Trigo Illanes (Valar): lo pidió el usuario. Si la cuenta no
-- existe o no entra a Abastecimiento, no hace nada.
insert into public.acceso_permisos (usuario_id, modulo_id, permiso_id)
select a.usuario_id, a.modulo_id, 'recepcion.directa'
  from public.accesos a
  join public.perfiles p on p.id = a.usuario_id
 where p.id = 'd022534c-bdc6-43dc-b489-ac0c0046d889'
   and a.modulo_id = 'abastecimiento'
on conflict do nothing;

-- ─── 2. La marca y el motivo ────────────────────────────────────────────────

alter table public.recepciones
  add column if not exists fuera_de_ciclo boolean not null default false,
  add column if not exists motivo_fuera_de_ciclo text;

alter table public.recepciones drop constraint if exists recepciones_motivo_fuera_de_ciclo;
alter table public.recepciones add constraint recepciones_motivo_fuera_de_ciclo
  check (not fuera_de_ciclo or char_length(btrim(coalesce(motivo_fuera_de_ciclo, ''))) >= 10);

comment on column public.recepciones.fuera_de_ciclo is
  'La recibió quien la pidió, por fuera de logística/pañol (0130). No entra stock a Pagnol; Pagnol deja de esperarla.';
comment on column public.recepciones.motivo_fuera_de_ciclo is
  'Por qué no pasó por el ciclo normal. Obligatorio si fuera_de_ciclo.';

-- ─── 3. Registrar ───────────────────────────────────────────────────────────
-- Misma función, dos parámetros más (con valor por defecto). Se borra la de
-- seis para que la llamada con nombres no quede ambigua.

drop function if exists public.registrar_recepcion(text, date, text, text, text, jsonb);

create or replace function public.registrar_recepcion(
  p_orden_id text,
  p_fecha date,
  p_guia text,
  p_recibido_por text,
  p_observaciones text,
  p_lineas jsonb,
  p_fuera_de_ciclo boolean default false,
  p_motivo text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  nueva uuid;
  contrato text;
begin
  if not exists (select 1 from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric) where x.cantidad > 0) then
    raise exception 'Anota cuánto llegó de al menos una línea.' using errcode = 'check_violation';
  end if;

  select o.contrato_id into contrato
    from public.ordenes_compra_proveedor o
   where o.empresa_id = public.empresa_actual() and o.id = p_orden_id;
  if not found then
    raise exception 'No se encontró la orden %.', p_orden_id;
  end if;

  if coalesce(p_fuera_de_ciclo, false) then
    if char_length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Cuenta por qué se recibe por fuera del ciclo normal (al menos 10 caracteres).' using errcode = 'check_violation';
    end if;
    if not (public.puede('recepcion.directa', contrato) or public.puede('recepcion.registrar', contrato) or public.puede('gestion.editar', contrato)) then
      raise exception 'No tienes permiso para recibir fuera del ciclo en este contrato.' using errcode = 'insufficient_privilege';
    end if;
  elsif not (public.puede('recepcion.registrar', contrato) or public.puede('gestion.editar', contrato)) then
    raise exception 'No tienes permiso para registrar recepciones en este contrato.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.recepciones (orden_id, contrato_id, fecha, guia_despacho, recibido_por, observaciones, fuera_de_ciclo, motivo_fuera_de_ciclo)
  values (p_orden_id, '', coalesce(p_fecha, current_date), nullif(btrim(p_guia), ''),
          nullif(btrim(p_recibido_por), ''), nullif(btrim(p_observaciones), ''),
          coalesce(p_fuera_de_ciclo, false),
          case when coalesce(p_fuera_de_ciclo, false) then btrim(p_motivo) end)
  returning id into nueva;

  insert into public.recepcion_items (recepcion_id, item_id, contrato_id, cantidad)
  select nueva, x.item_id, '', x.cantidad
    from jsonb_to_recordset(p_lineas) as x(item_id text, cantidad numeric)
   where x.cantidad > 0;

  return nueva;
end;
$$;

grant execute on function public.registrar_recepcion(text, date, text, text, text, jsonb, boolean, text) to authenticated;

-- ─── 4. Quién escribe recepciones ───────────────────────────────────────────
-- La lectura no cambia. Escribir: lo mismo que pide la pantalla. Con
-- `recepcion.directa` solo las propias fuera del ciclo (y sus líneas).
-- Escritas ya en la forma de la 0125 (una vez por consulta).

drop policy if exists "ciclo oc: crea" on public.recepciones;
drop policy if exists "ciclo oc: cambia" on public.recepciones;
drop policy if exists "ciclo oc: borra" on public.recepciones;
drop policy if exists "recepciones: crea" on public.recepciones;
drop policy if exists "recepciones: cambia" on public.recepciones;
drop policy if exists "recepciones: borra" on public.recepciones;

create policy "recepciones: crea" on public.recepciones for insert to authenticated
  with check (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (fuera_de_ciclo and ((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[])))
    ));

create policy "recepciones: cambia" on public.recepciones for update to authenticated
  using (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (fuera_de_ciclo and ((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[])))
    ))
  with check (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (fuera_de_ciclo and ((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[])))
    ));

create policy "recepciones: borra" on public.recepciones for delete to authenticated
  using (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (fuera_de_ciclo and ((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[])))
    ));

/* Las líneas: lo mismo; con `recepcion.directa`, solo las de una recepción
   fuera del ciclo. */
create or replace function public.recepcion_es_fuera_de_ciclo(p_empresa text, p_recepcion uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.fuera_de_ciclo from public.recepciones r
                    where r.empresa_id = p_empresa and r.id = p_recepcion), false);
$$;
revoke all on function public.recepcion_es_fuera_de_ciclo(text, uuid) from public;
grant execute on function public.recepcion_es_fuera_de_ciclo(text, uuid) to authenticated;

drop policy if exists "ciclo oc: crea" on public.recepcion_items;
drop policy if exists "ciclo oc: cambia" on public.recepcion_items;
drop policy if exists "ciclo oc: borra" on public.recepcion_items;
drop policy if exists "recepcion items: crea" on public.recepcion_items;
drop policy if exists "recepcion items: cambia" on public.recepcion_items;
drop policy if exists "recepcion items: borra" on public.recepcion_items;

create policy "recepcion items: crea" on public.recepcion_items for insert to authenticated
  with check (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[]))
          and public.recepcion_es_fuera_de_ciclo(empresa_id, recepcion_id))
    ));

create policy "recepcion items: cambia" on public.recepcion_items for update to authenticated
  using (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[]))
          and public.recepcion_es_fuera_de_ciclo(empresa_id, recepcion_id))
    ))
  with check (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[]))
          and public.recepcion_es_fuera_de_ciclo(empresa_id, recepcion_id))
    ));

create policy "recepcion items: borra" on public.recepcion_items for delete to authenticated
  using (
    empresa_id = (select public.empresa_actual()) and (
      ((select public.puede_en_todos('gestion.editar')) or contrato_id = any ((select public.contratos_con_permiso('gestion.editar'))::text[]))
      or ((select public.puede_en_todos('recepcion.registrar')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.registrar'))::text[]))
      or (((select public.puede_en_todos('recepcion.directa')) or contrato_id = any ((select public.contratos_con_permiso('recepcion.directa'))::text[]))
          and public.recepcion_es_fuera_de_ciclo(empresa_id, recepcion_id))
    ));

commit;

notify pgrst, 'reload schema';

-- Para comprobar después:
--   select id, titulo from public.permisos where id = 'recepcion.directa';
--   select policyname, cmd from pg_policies where tablename in ('recepciones', 'recepcion_items') order by 1;
