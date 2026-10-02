-- 0034 — Autoría compatible con tablas sin creado_en, como seguridad.
-- Aplicar después de 0033 en Supabase → SQL Editor. Idempotente.
--
-- La primera inserción funciona, pero una actualización falla con:
--   record "new" has no field "creado_en"
-- La 0003 instala marcar_autoria() también en seguridad; esa tabla tiene
-- actualizado_en, creado_por y actualizado_por, pero no creado_en.
-- Se conserva la fecha original solo en las tablas que tienen esa columna.
-- No se cambian permisos, datos de negocio ni el trigger de bitácora de 0033.

create or replace function public.marcar_autoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.actualizado_por := auth.uid();
  else
    new.creado_por := old.creado_por;
    if to_jsonb(old) ? 'creado_en' then
      new.creado_en := old.creado_en;
    end if;
    new.actualizado_por := auth.uid();
  end if;
  return new;
end;
$$;
