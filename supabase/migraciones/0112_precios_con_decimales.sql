-- ============================================================================
-- 0112 — Precios unitarios con decimales
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Va después de la 0111. Todo corre en una sola transacción: si
-- algo falla, no queda nada a medias.
--
-- POR QUÉ. Hay proveedores que venden con decimales (un precio de $663,87 por
-- unidad). El precio unitario era `bigint` y la cotización fallaba con
-- «invalid input syntax for type bigint: "663.87"».
--
-- QUÉ CAMBIA. Pasan a `numeric(14,4)` (hasta 4 decimales):
--   · cotizacion_items.precio_unitario
--   · items_compra.precio_unitario y precio_lista
--   · articulo_proveedor.ultimo_precio
-- El NETO sigue en pesos enteros: es `round(cantidad * precio_unitario)`, así
-- que el total de una línea nunca lleva decimales y las facturas, el IVA, el
-- costo y los informes siguen cuadrando como siempre.
--
-- CÓMO. `neto` es una columna calculada que depende de `precio_unitario`, y
-- varias vistas dependen de ambas: Postgres no deja cambiar el tipo mientras
-- existan. Por eso la migración (1) anota cada vista que depende de estas
-- tablas —definición, opciones, permisos y comentario—, (2) las suelta,
-- (3) cambia los tipos y rehace las columnas calculadas con su misma fórmula, y
-- (4) recrea las vistas tal cual estaban. No se reescribe ninguna a mano, así
-- que no puede quedar una versión vieja de ninguna.
-- Además, las funciones que recibían líneas con `precio_unitario bigint`
-- (compra directa y reembolsos) pasan a `numeric`.
-- ============================================================================

do $$
declare
  tablas oid[] := array[
    'public.items_compra'::regclass::oid,
    'public.cotizacion_items'::regclass::oid,
    'public.articulo_proveedor'::regclass::oid
  ];
  v record;
  g record;
  f record;
  a record;
  nuevo text;
begin
  /* ── 1. Las vistas que dependen de estas tablas, de la más lejana a la más cercana ── */
  create temp table _vistas_0112 on commit drop as
  with recursive dep(oid, profundidad) as (
    select r.ev_class, 1
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
     where d.classid = 'pg_rewrite'::regclass
       and d.refclassid = 'pg_class'::regclass
       and d.refobjid = any (tablas)
       and r.ev_class <> d.refobjid
    union
    select r.ev_class, dep.profundidad + 1
      from dep
      join pg_depend d on d.refobjid = dep.oid and d.refclassid = 'pg_class'::regclass and d.classid = 'pg_rewrite'::regclass
      join pg_rewrite r on r.oid = d.objid
     where r.ev_class <> dep.oid
  )
  select c.oid as oid,
         n.nspname as esquema,
         c.relname as nombre,
         c.relkind as tipo,
         max(dep.profundidad) as profundidad,
         pg_get_viewdef(c.oid, true) as definicion,
         c.reloptions as opciones,
         c.relacl as permisos,
         obj_description(c.oid, 'pg_class') as comentario,
         pg_get_userbyid(c.relowner) as duenio
    from dep
    join pg_class c on c.oid = dep.oid
    join pg_namespace n on n.oid = c.relnamespace
   group by c.oid, n.nspname, c.relname, c.relkind, c.reloptions, c.relacl, c.relowner;

  if exists (select 1 from _vistas_0112 where tipo <> 'v') then
    raise exception 'Hay una vista materializada que depende de estas tablas; hay que tratarla a mano.';
  end if;

  /* ── 2. Soltarlas, las más lejanas primero ── */
  for v in select * from _vistas_0112 order by profundidad desc loop
    execute format('drop view %I.%I', v.esquema, v.nombre);
  end loop;

  /* ── 3. Las columnas calculadas de las dos tablas de líneas ── */
  create temp table _calculadas_0112 on commit drop as
  select c.oid as tabla,
         c.relname as nombre_tabla,
         at.attname as columna,
         format_type(at.atttypid, at.atttypmod) as tipo,
         pg_get_expr(ad.adbin, ad.adrelid) as formula,
         at.attnotnull as obligatoria,
         at.attnum as orden
    from pg_attribute at
    join pg_class c on c.oid = at.attrelid
    join pg_attrdef ad on ad.adrelid = at.attrelid and ad.adnum = at.attnum
   where at.attrelid in ('public.items_compra'::regclass, 'public.cotizacion_items'::regclass)
     and at.attgenerated = 's'
     and not at.attisdropped;

  for g in select * from _calculadas_0112 order by orden desc loop
    execute format('alter table public.%I drop column %I', g.nombre_tabla, g.columna);
  end loop;

  /* ── 4. Los tipos ── */
  alter table public.cotizacion_items alter column precio_unitario type numeric(14,4);
  alter table public.items_compra alter column precio_unitario type numeric(14,4);
  alter table public.items_compra alter column precio_lista type numeric(14,4);
  alter table public.articulo_proveedor alter column ultimo_precio type numeric(14,4);

  /* ── 5. Las columnas calculadas, con su misma fórmula ── */
  for g in select * from _calculadas_0112 order by orden loop
    execute format('alter table public.%I add column %I %s generated always as (%s) stored',
                   g.nombre_tabla, g.columna, g.tipo, g.formula);
    if g.obligatoria then
      execute format('alter table public.%I alter column %I set not null', g.nombre_tabla, g.columna);
    end if;
  end loop;

  /* ── 6. Las vistas, de la más cercana a la más lejana ── */
  for v in select * from _vistas_0112 order by profundidad asc loop
    execute format(
      'create view %I.%I %s as %s',
      v.esquema, v.nombre,
      case when v.opciones is null then '' else 'with (' || array_to_string(v.opciones, ', ') || ')' end,
      rtrim(v.definicion, '; ' || chr(10))
    );
    execute format('alter view %I.%I owner to %I', v.esquema, v.nombre, v.duenio);
    execute format('revoke all on %I.%I from public, anon, authenticated, service_role', v.esquema, v.nombre);
    for a in
      select (aclexplode(v.permisos)).grantee as quien, (aclexplode(v.permisos)).privilege_type as permiso
    loop
      execute format('grant %s on %I.%I to %s', a.permiso, v.esquema, v.nombre,
                     case when a.quien = 0 then 'public' else quote_ident(pg_get_userbyid(a.quien)) end);
    end loop;
    if v.comentario is not null then
      execute format('comment on view %I.%I is %L', v.esquema, v.nombre, v.comentario);
    end if;
  end loop;

  /* ── 7. Las funciones que recibían líneas con precio entero ── */
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%precio_unitario bigint%'
  loop
    nuevo := replace(pg_get_functiondef(f.oid), 'precio_unitario bigint', 'precio_unitario numeric');
    execute nuevo;
  end loop;
end $$;

comment on column public.cotizacion_items.precio_unitario is
  'Precio por unidad, con hasta 4 decimales. Cero mientras el proveedor no responde: una solicitud enviada nace sin precios. El neto (cantidad × precio) se redondea a pesos enteros.';
comment on column public.items_compra.precio_unitario is
  'Precio por unidad, con hasta 4 decimales. El neto (cantidad × precio) se redondea a pesos enteros.';
