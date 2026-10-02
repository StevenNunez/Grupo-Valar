-- ============================================================================
-- 0033 — La bitácora anota la empresa de la FILA, no la de quien la toca
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de 0032.
--
-- POR QUÉ. La 0030 le puso a `auditoria.empresa_id` el valor por defecto
-- `empresa_actual()`, que sale de la sesión. El trigger nunca manda la
-- columna, así que se queda con ese valor. Dos defectos:
--
-- 1. Sin sesión, `empresa_actual()` es nulo. Todo lo que entra con la clave de
--    servicio —`npm run sembrar`, `npm run vaciar`, la Edge Function— choca
--    con el NOT NULL de la bitácora y el cambio entero se cae:
--    «null value in column "empresa_id" of relation "auditoria"».
--
-- 2. Con sesión, la entrada queda en la empresa de QUIEN edita. El soporte
--    cruza empresas: si corrige un contrato del demo, esa línea de historia
--    queda en la bitácora de Valar, y el demo pierde su rastro.
--
-- La fila auditada ya sabe de qué empresa es. Se usa eso, y la sesión queda
-- solo como respaldo. El resto de la función es idéntico a la 0003.
-- ============================================================================

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fila jsonb;
  anterior jsonb;
  diferencias jsonb;
  accion text;
  quien uuid := auth.uid();
  nombre text;
  correo text;
  clave text;
  -- Columnas de servicio: cambian en cada edición y ensuciarían el diff.
  ignoradas text[] := array['actualizado_en', 'actualizado_por', 'creado_en', 'creado_por'];
begin
  select p.nombre into nombre from public.perfiles p where p.id = quien;
  select u.email into correo from auth.users u where u.id = quien;

  if tg_op = 'DELETE' then
    accion := 'eliminado';
    fila := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    accion := 'creado';
    fila := to_jsonb(new);
  else
    accion := 'modificado';
    fila := to_jsonb(new);
    anterior := to_jsonb(old);

    diferencias := '{}'::jsonb;
    for clave in select jsonb_object_keys(fila) loop
      if not (clave = any(ignoradas))
         and (fila -> clave) is distinct from (anterior -> clave) then
        diferencias := diferencias || jsonb_build_object(
          clave,
          jsonb_build_object('antes', anterior -> clave, 'despues', fila -> clave)
        );
      end if;
    end loop;

    -- Un UPDATE que no cambió nada real no merece una línea en la bitácora.
    if diferencias = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.auditoria (
    empresa_id, tabla, registro_id, accion, usuario_id, usuario_nombre,
    usuario_correo, cambios, datos
  )
  values (
    coalesce(fila ->> 'empresa_id', public.empresa_actual()),
    tg_table_name,
    coalesce(fila ->> 'id', '(sin id)'),
    accion,
    quien,
    nombre,
    correo,
    diferencias,
    case when accion = 'modificado' then null else fila end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
