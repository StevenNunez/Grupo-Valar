-- ============================================================================
-- 0046 — Soporte mira una empresa a la vez, y cambia de una a otra
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- EL PROBLEMA. Desde la 0030, "cruzar empresas" significaba VER TODAS A LA VEZ:
-- `ve_empresa()` dejaba pasar cualquier fila si quien miraba era Soporte. Con
-- Valar vacía y el demo lleno, Soporte entraba a "su" plataforma y solo veía
-- los contratos del demo, mezclados como si fueran de Valar. Lo que creaba sí
-- caía en Valar (sale de `empresa_actual()`), pero lo que veía no. Así es como
-- se edita un dato del demo creyendo que es de Valar, o al revés.
--
-- LO QUE QUEDA. Soporte ve UNA empresa: la de su perfil, igual que cualquiera.
-- Lo que lo distingue es que puede CAMBIARLA, con `cambiar_empresa()` y un
-- selector en la barra superior. Lo que ve y lo que crea son siempre de la
-- misma empresa, y la barra dice cuál es.
--
-- No se reescribe ninguna política: todas preguntan `ve_empresa()`, y basta con
-- que deje de abrir la puerta a todas.
-- ============================================================================

create or replace function public.ve_empresa(objetivo text)
returns boolean
language sql
stable
as $$
  select objetivo = public.empresa_actual();
$$;

comment on function public.ve_empresa(text) is
  'Si la fila es de la empresa en la que está quien consulta. Soporte también '
  've una sola: la que eligió con `cambiar_empresa()`.';

comment on function public.cruza_empresas() is
  'Si quien consulta es Soporte: puede cambiar de empresa y dar el acceso de '
  'Soporte. Desde la 0046 ya NO ve todas a la vez.';

/* Cambiar de empresa. Solo Soporte, solo a una empresa activa. Escribe en el
   perfil porque de ahí sale `empresa_actual()`: lo que ve y lo que crea
   cambian juntos, en el mismo instante. */
create or replace function public.cambiar_empresa(destino text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.cruza_empresas() then
    raise exception 'Solo Soporte puede cambiar de empresa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.empresas e where e.id = destino and e.activa) then
    raise exception 'Esa empresa no existe o no está activa.';
  end if;

  update public.perfiles set empresa_id = destino where id = auth.uid();
  return destino;
end;
$$;

grant execute on function public.cambiar_empresa(text) to authenticated;

notify pgrst, 'reload schema';
