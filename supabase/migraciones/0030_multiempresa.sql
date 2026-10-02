-- ============================================================================
-- 0030 — Varias empresas en la misma base
--
-- POR QUÉ. Hasta acá la plataforma tenía un solo mundo: todo el que entraba
-- veía los mismos contratos. La cuenta demo —con la que se prueba— es `admin`,
-- así que podía editar y borrar los datos reales, y de hecho lo hizo. Esto
-- separa los mundos de verdad: cada empresa ve lo suyo y nada más.
--
-- LA DECISIÓN DE FONDO: LA LLAVE PRIMARIA PASA A SER `(empresa_id, id)`.
--
-- 20 tablas usan ids de texto que escribe una persona: 'C-MISC', '001',
-- 'EP-MISC-01', 'OC22-001128'. El demo y Valar van a querer los dos un
-- contrato '001'. Con `id` como llave global, el segundo no se puede crear.
--
-- La alternativa —prefijar los ids con la empresa— cambia lo que la gente
-- teclea y lee en un documento impreso. No se hizo.
--
-- Con la llave compuesta se gana algo que el RLS solo no da: **una fila no
-- puede apuntar al padre de otra empresa**, porque la foránea también lleva
-- `empresa_id`. No es una política que se pueda olvidar: es la estructura.
--
-- EL RLS SE AGREGA, NO SE REESCRIBE. Las políticas de la 0029 —quién puede
-- leer, quién puede editar— quedan intactas. Encima se pone una política
-- `restrictive` por tabla, que Postgres combina con AND: hay que pasar las dos.
-- Reescribir cien políticas a mano para meterles un `and empresa_id = ...` era
-- la forma segura de que a una se le olvidara.
--
-- `on delete set null` NECESITA POSTGRES 15+. Hay 46 foráneas con esa regla, y
-- sobre una llave compuesta anularía también `empresa_id`, que es NOT NULL.
-- La forma `set null (columna)` anula solo la columna del negocio. Este
-- proyecto corre Postgres 17.6.
--
-- LAS VISTAS NO CAMBIAN, PERO HAY QUE DESCOLGARLAS. Las 22 se crearon con
-- `security_invoker = true`, así que corren con el RLS de quien consulta y
-- heredan el filtro por empresa solas: ni una línea de su SQL cambia.
--
-- El problema es otro. Diez de ellas agrupan por el id de su tabla
-- (`group by c.id`), y para permitir eso Postgres registra una dependencia
-- DURA contra la llave primaria. Tirar la llave con la vista arriba da
-- «cannot drop constraint ... because other objects depend on it». Y de esas
-- diez cuelgan otras, así que el alcance real es casi todo el catálogo.
--
-- Por eso el bloque 6 se guarda las 22 con su definición, sus opciones y sus
-- permisos, las descuelga, hace la cirugía y las repone — todo adentro del
-- mismo bloque, sin tablas auxiliares que tengan que sobrevivir de una
-- sentencia a la siguiente. Se lee de `pg_get_viewdef` en vez de pegar el SQL
-- acá: así no depende de que yo haya adivinado cuáles eran, y si alguna no
-- vuelve, la migración falla nombrándola y diciendo POR QUÉ, en vez de dejar
-- la aplicación sin la mitad de sus pantallas.
--
-- ANTES DE CORRER: las tablas tienen que estar vacías (`npm run vaciar`). La
-- migración lo comprueba y se detiene si no. No hay relleno de `empresa_id`
-- para filas viejas a propósito: adivinar de quién es un dato es peor que
-- pedir que se vuelva a cargar.
-- ============================================================================

-- ─── 0. El portón: no correr esto sobre datos ───────────────────────────────

-- Tienen que estar vacías TODAS las que reciben `empresa_id`, no solo las
-- grandes: la columna entra como NOT NULL y su valor por defecto sale de la
-- sesión, que en el editor de SQL es nula. Una sola fila en cualquiera de las
-- 26 hace fallar el ALTER, y hacerlo fallar acá —con el nombre de la tabla—
-- es mucho mejor que a mitad del bloque 5. La bitácora cuenta: son 948 filas
-- que no estaban en la primera versión de esta lista.

do $$
declare
  t text;
  cuantas bigint;
  culpables text := '';
begin
  foreach t in array array[
    'anexos', 'articulo_proveedor', 'articulos', 'campos_contrato',
    'categorias_costo', 'compras', 'contratos', 'costos_personal',
    'cotizacion_items', 'cotizaciones', 'estados_pago', 'facturas',
    'items_compra', 'ordenes_compra', 'ordenes_compra_proveedor',
    'proveedores', 'reglas_aprobacion', 'servicios', 'solped', 'solped_items',
    'adjuntos', 'aprobaciones', 'auditoria', 'invitaciones',
    'parametros_pago', 'seguridad'
  ] loop
    execute format('select count(*) from public.%I', t) into cuantas;
    if cuantas > 0 then
      culpables := culpables || format('%s (%s)  ', t, cuantas);
    end if;
  end loop;

  if culpables <> '' then
    raise exception
      'Estas tablas todavía tienen datos: %. Corre "npm run vaciar -- --si" antes de aplicar la 0030.',
      culpables;
  end if;
end;
$$;

-- ─── 1. Las empresas ────────────────────────────────────────────────────────

create table if not exists public.empresas (
  id text primary key,                                   -- 'valar', 'demo'
  nombre text not null,
  rut text,
  -- La de pruebas se marca: la interfaz puede avisar "estás en el demo" y
  -- ningún correo de verdad debería salir desde acá.
  es_demo boolean not null default false,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.empresas is
  'Los inquilinos. Cada fila de negocio pertenece a uno y no se mezclan.';

insert into public.empresas (id, nombre, rut, es_demo) values
  ('valar', 'Constructora Valar SpA', '76.437.201-0', false),
  ('demo',  'Empresa de Prueba',      null,           true)
on conflict (id) do nothing;

alter table public.empresas enable row level security;

drop policy if exists "empresas: lectura" on public.empresas;
create policy "empresas: lectura" on public.empresas
  for select to authenticated using (true);

drop policy if exists "empresas: administra quien puede" on public.empresas;
create policy "empresas: administra quien puede" on public.empresas
  for all to authenticated
  using (public.tiene_permiso('parametros.editar'))
  with check (public.tiene_permiso('parametros.editar'));

-- ─── 2. A qué empresa pertenece cada persona ────────────────────────────────

alter table public.perfiles
  add column if not exists empresa_id text references public.empresas (id);

comment on column public.perfiles.empresa_id is
  'La empresa de esta persona. TODOS tienen una, el soporte incluido: es la '
  'que se usa al crear algo. Cruzar empresas para MIRAR es otra cosa y la '
  'decide `roles.cruza_empresas`.';

-- ─── 3. Quién cruza empresas ────────────────────────────────────────────────
--
-- Es un atributo del ROL, no una lista de correos en el código: igual que los
-- permisos de la 0029, se cambia con un update y no con un despliegue.

alter table public.roles
  add column if not exists cruza_empresas boolean not null default false;

comment on column public.roles.cruza_empresas is
  'Ve y edita los datos de cualquier empresa. Es el único agujero en el '
  'aislamiento: dárselo a muy poca gente. Todo queda en la bitácora igual.';

update public.roles set cruza_empresas = true where id = 'soporte';

-- ─── 4. Las funciones que responden "¿de quién es esto?" ────────────────────

create or replace function public.empresa_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.perfiles where id = auth.uid();
$$;

comment on function public.empresa_actual() is
  'La empresa de quien está consultando. Nula sin sesión: por eso los scripts '
  'que entran con la clave de servicio tienen que mandar `empresa_id` a mano.';

create or replace function public.cruza_empresas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.cruza_empresas
       from public.perfiles p
       join public.roles r on r.id = p.rol
      where p.id = auth.uid()),
    false);
$$;

create or replace function public.ve_empresa(objetivo text)
returns boolean
language sql
stable
as $$
  select objetivo = public.empresa_actual() or public.cruza_empresas();
$$;

grant execute on function public.empresa_actual() to authenticated;
grant execute on function public.cruza_empresas() to authenticated;
grant execute on function public.ve_empresa(text) to authenticated;

-- ─── 5. La columna, en todas las tablas de negocio ──────────────────────────
--
-- El valor por defecto sale de la sesión, así que la aplicación nunca manda
-- `empresa_id`: sigue haciendo `insert {...}` como hasta ahora y la fila cae
-- en la empresa correcta sola.

do $$
declare
  t text;
begin
  foreach t in array array[
    -- id de texto: además les cambia la llave primaria más abajo
    'anexos', 'articulo_proveedor', 'articulos', 'campos_contrato',
    'categorias_costo', 'compras', 'contratos', 'costos_personal',
    'cotizacion_items', 'cotizaciones', 'estados_pago', 'facturas',
    'items_compra', 'ordenes_compra', 'ordenes_compra_proveedor',
    'proveedores', 'reglas_aprobacion', 'servicios', 'solped', 'solped_items',
    -- id propio (uuid o correlativo): la llave se queda como está
    'adjuntos', 'aprobaciones', 'auditoria', 'invitaciones',
    -- las de una sola fila: la llave pasa a ser la empresa
    'parametros_pago', 'seguridad'
  ] loop
    execute format(
      'alter table public.%I add column if not exists empresa_id text not null
         default public.empresa_actual() references public.empresas (id)', t);
    execute format('create index if not exists %I on public.%I (empresa_id)',
                   t || '_empresa_idx', t);
  end loop;
end;
$$;

-- ─── 6. Vistas y llaves, TODO EN UN SOLO BLOQUE ─────────────────────────────
--
-- POR QUÉ UN SOLO BLOQUE, que es la corrección más importante de esta versión.
--
-- La versión anterior guardaba las vistas en dos tablas auxiliares
-- (`public._vistas_respaldo` y `_vistas_permisos`), hacía la cirugía y las
-- reponía leyéndolas de vuelta. En la consola de Supabase eso falló con
-- «relation "public._vistas_respaldo" does not exist»: la tabla se creaba en
-- una sentencia y ya no estaba en la siguiente. No importa por qué lo hace la
-- consola —depender de que una tabla sobreviva entre sentencias era la
-- fragilidad—, así que el estado intermedio ya no sale de este bloque: vive en
-- una tabla temporal creada y consumida acá adentro.
--
-- De regalo, el bloque es atómico: o pasa entero o no pasa nada. No hay forma
-- de quedarse con las vistas tiradas y las llaves a medio cambiar.
--
-- EL ORDEN, y cada paso está donde está por una razón:
--
--   a. Guardar las 22 vistas con su definición, sus opciones y sus permisos.
--   b. Tirarlas. Diez agrupan por el id de su tabla y Postgres registra una
--      dependencia DURA contra la llave primaria: sin descolgarlas, el cambio
--      de llave da «cannot drop constraint ... because other objects depend».
--   c. Anotar las foráneas con su regla de borrado y tirarlas.
--   d. Rehacer las llaves primarias como (empresa_id, id).
--   e. Rehacer las foráneas, ahora compuestas.
--   f. Reponer las vistas.

do $$
declare
  tablas_texto text[] := array[
    'anexos', 'articulo_proveedor', 'articulos', 'campos_contrato',
    'categorias_costo', 'compras', 'contratos', 'costos_personal',
    'cotizacion_items', 'cotizaciones', 'estados_pago', 'facturas',
    'items_compra', 'ordenes_compra', 'ordenes_compra_proveedor',
    'proveedores', 'reglas_aprobacion', 'servicios', 'solped', 'solped_items'
  ];
  t text;
  f record;
  v record;
  p record;
  regla text;
  parche text;
  columnas_pk smallint;
  progreso boolean;
  cuantas int;
  faltan int;
  pendientes text;
  con_parche text;
  sueltas text;
begin
  -- Si ya se aplicó, no hay nada que hacer. Sin esta salida la segunda corrida
  -- REVIENTA: las foráneas ya son compuestas, el `array_length = 1` no las
  -- encuentra, no se tiran, y el `drop constraint` de la llave primaria falla
  -- porque siguen colgando. Es la trampa de la 0026: una migración que solo
  -- funciona la primera vez no es idempotente.
  select array_length(con.conkey, 1) into columnas_pk
    from pg_constraint con
   where con.conrelid = 'public.contratos'::regclass and con.contype = 'p';

  if columnas_pk = 2 then
    raise notice 'Las llaves ya son compuestas. Nada que hacer.';
    return;
  end if;

  -- ── a. Las vistas, guardadas ──────────────────────────────────────────────
  --
  -- Se guardan TODAS, no solo las diez que agrupan: el `drop ... cascade` se
  -- lleva por delante las que cuelgan de esas, y una lista escrita a mano se
  -- queda corta. Con las 22 guardadas da lo mismo cuántas arrastre.
  --
  -- `reloptions` es donde vive `security_invoker=true`. Si no se guardara, las
  -- vistas volverían corriendo con los permisos de su dueño en vez de los de
  -- quien consulta, y el aislamiento por empresa sería un adorno: cualquiera
  -- vería los datos de todos a través de `resumen_mensual`. Es la línea más
  -- importante del bloque.

  create temporary table vistas_guardadas on commit drop as
  select
    c.relname::text                                    as nombre,
    pg_get_viewdef(c.oid, true)                        as definicion,
    coalesce(array_to_string(c.reloptions, ', '), '')  as opciones,
    false                                              as recreada,
    false                                              as parcheada,
    ''::text                                           as ultimo_error
  from pg_class c
  where c.relkind = 'v'
    and c.relnamespace = 'public'::regnamespace;

  create temporary table permisos_guardados on commit drop as
  select
    table_name::text      as nombre,
    grantee::text         as quien,
    privilege_type::text  as permiso
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select nombre from vistas_guardadas);

  select count(*) into cuantas from vistas_guardadas;
  if cuantas = 0 then
    raise exception 'No se guardó ninguna vista. Algo anda mal: no sigas.';
  end if;
  raise notice 'Guardadas % vistas.', cuantas;

  -- ── b. Las vistas, descolgadas ────────────────────────────────────────────
  for v in select nombre from vistas_guardadas loop
    execute format('drop view if exists public.%I cascade', v.nombre);
  end loop;

  -- ── c. Las foráneas, anotadas y tiradas ───────────────────────────────────
  --
  -- Se leen de `pg_constraint` en vez de escribirlas a mano: son 37 y la base
  -- es la que sabe cuáles hay, no yo.

  create temporary table fk_guardadas on commit drop as
  select
    hija.relname::text                       as tabla_hija,
    att.attname::text                        as columna,
    padre.relname::text                      as tabla_padre,
    con.confdeltype                          as al_borrar,
    con.conname::text                        as nombre
  from pg_constraint con
  join pg_class  hija  on hija.oid  = con.conrelid
  join pg_class  padre on padre.oid = con.confrelid
  join pg_attribute att on att.attrelid = con.conrelid
                       and att.attnum = con.conkey[1]
  where con.contype = 'f'
    and padre.relnamespace = 'public'::regnamespace
    and padre.relname = any(tablas_texto)
    and array_length(con.conkey, 1) = 1;

  for f in select * from fk_guardadas loop
    execute format('alter table public.%I drop constraint %I', f.tabla_hija, f.nombre);
  end loop;

  -- ── d. Las llaves primarias ───────────────────────────────────────────────
  foreach t in array tablas_texto loop
    execute format('alter table public.%I drop constraint %I', t, t || '_pkey');
    execute format('alter table public.%I add primary key (empresa_id, id)', t);
  end loop;

  /* Las de una sola fila. LA COLUMNA `id` SE QUEDA, y es más limpio que
     borrarla: usan `id boolean primary key default true check (id)` para
     forzar una fila única. El primer intento fue tirarla y dejar la llave en
     `empresa_id`, y rompió `cuentas_por_pagar`, que hace
     `select * from parametros_pago where id`. Con la llave en
     `(empresa_id, id)` el `check` sigue trabajando —hay exactamente una fila
     POR EMPRESA— y ninguna consulta que use `where id` se entera de nada. */
  alter table public.parametros_pago drop constraint if exists parametros_pago_pkey;
  alter table public.parametros_pago add primary key (empresa_id, id);

  alter table public.seguridad drop constraint if exists seguridad_pkey;
  alter table public.seguridad add primary key (empresa_id, id);

  -- ── e. Las foráneas, ahora compuestas ─────────────────────────────────────
  --
  -- `set null (columna)` anula solo la del negocio: `empresa_id` es NOT NULL y
  -- anularla haría fallar cada borrado. Lo usan 46 foráneas. Necesita
  -- Postgres 15 o mayor; este proyecto corre 17.6.
  for f in select * from fk_guardadas loop
    regla := case f.al_borrar
      when 'c' then 'on delete cascade'
      when 'n' then format('on delete set null (%I)', f.columna)
      when 'r' then 'on delete restrict'
      when 'd' then format('on delete set default (%I)', f.columna)
      else 'on delete no action'
    end;

    execute format(
      'alter table public.%I add constraint %I
         foreign key (empresa_id, %I) references public.%I (empresa_id, id) %s',
      f.tabla_hija, f.nombre, f.columna, f.tabla_padre, regla);
  end loop;

  -- ── f. Las vistas, de vuelta ──────────────────────────────────────────────
  --
  -- El orden importa —hay vistas construidas sobre otras vistas— y sacarlo de
  -- `pg_depend` es más trabajo que intentarlo: se recorre la lista una y otra
  -- vez, y en cada vuelta entran las que ya tienen sus cimientos. Cuando una
  -- vuelta completa no logra ninguna, se acabó.

  loop
    progreso := false;

    for v in select * from vistas_guardadas where not recreada loop
      -- Tal cual estaba. Es lo que funciona para 15 de las 22.
      begin
        execute format(
          'create view public.%I %s as %s',
          v.nombre,
          case when v.opciones <> '' then format('with (%s)', v.opciones) else '' end,
          v.definicion);
        update vistas_guardadas set recreada = true where nombre = v.nombre;
        progreso := true;
        continue;
      exception when others then
        update vistas_guardadas set ultimo_error = sqlerrm where nombre = v.nombre;
      end;

      /* Con el `group by` corregido.

         Cuatro vistas agrupan por `<alias>.id` y seleccionan el resto de las
         columnas de esa tabla. Eso se podía porque `id` era la llave primaria:
         Postgres reconoce la dependencia funcional SOLO contra la llave
         completa. Ahora la llave es `(empresa_id, id)` y el `group by` quedó
         corto.

         No es un arreglo para que compile: agrupar por `id` a secas FUSIONARÍA
         dos órdenes de empresas distintas que compartan el número. Agregar
         `empresa_id` es lo correcto, y dentro de una empresa produce
         exactamente los mismos grupos que antes.

         Se intenta SOLO sobre las que ya fallaron, así el resto no se toca. Y
         si el texto resultante no es SQL válido, Postgres lo rechaza y el
         error sale abajo: no hay forma de que pase algo roto en silencio. */
      parche := regexp_replace(
        v.definicion,
        '(GROUP BY\s+)([a-z_][a-z_0-9]*)\.id\M',
        '\1\2.empresa_id, \2.id',
        'gi');

      if parche = v.definicion then
        continue;   -- no había nada que corregir: su problema es otro
      end if;

      begin
        execute format(
          'create view public.%I %s as %s',
          v.nombre,
          case when v.opciones <> '' then format('with (%s)', v.opciones) else '' end,
          parche);
        update vistas_guardadas
           set recreada = true, parcheada = true, definicion = parche
         where nombre = v.nombre;
        progreso := true;
      exception when others then
        update vistas_guardadas set ultimo_error = sqlerrm where nombre = v.nombre;
      end;
    end loop;

    exit when not progreso;
  end loop;

  select count(*), string_agg(format('%s (%s)', nombre, ultimo_error), E'\n  ')
    into faltan, pendientes
    from vistas_guardadas where not recreada;

  if faltan > 0 then
    raise exception E'No se pudieron recrear % vista(s):\n  %', faltan, pendientes;
  end if;

  -- Los permisos, como estaban. `PUBLIC` no es un rol con nombre y no se puede
  -- citar con %I: va aparte.
  for p in select * from permisos_guardados loop
    if p.quien = 'PUBLIC' then
      execute format('grant %s on public.%I to public', p.permiso, p.nombre);
    else
      execute format('grant %s on public.%I to %I', p.permiso, p.nombre, p.quien);
    end if;
  end loop;

  -- Si alguna quedó sin `security_invoker`, el aislamiento por empresa no
  -- sirve para nada en esa vista. Mejor detenerse.
  select string_agg(g.nombre, ', ')
    into sueltas
    from vistas_guardadas g
    join pg_class c on c.relname = g.nombre
                   and c.relnamespace = 'public'::regnamespace
                   and c.relkind = 'v'
   where g.opciones like '%security_invoker%'
     and not coalesce(array_to_string(c.reloptions, ',') like '%security_invoker%', false);

  if sueltas is not null then
    raise exception 'Estas vistas perdieron security_invoker al recrearse: %', sueltas;
  end if;

  select string_agg(nombre, ', ') into con_parche
    from vistas_guardadas where parcheada;

  if con_parche is not null then
    raise notice 'Con el group by corregido: %', con_parche;
  end if;

  raise notice 'Repuestas las % vistas. Llaves y foráneas listas.', cuantas;
end;
$$;

-- ─── 7. El cerco, como política restrictiva ─────────────────────────────────
--
-- `as restrictive` se combina con AND contra las permisivas que ya existen: la
-- 0029 sigue diciendo QUÉ puede hacer cada rol y esta dice DE QUIÉN son los
-- datos. Las dos tienen que dejar pasar. Así no hay que tocar —ni arriesgar—
-- ninguna de las políticas que ya estaban probadas.

do $$
declare
  t text;
begin
  foreach t in array array[
    'anexos', 'articulo_proveedor', 'articulos', 'campos_contrato',
    'categorias_costo', 'compras', 'contratos', 'costos_personal',
    'cotizacion_items', 'cotizaciones', 'estados_pago', 'facturas',
    'items_compra', 'ordenes_compra', 'ordenes_compra_proveedor',
    'proveedores', 'reglas_aprobacion', 'servicios', 'solped', 'solped_items',
    'adjuntos', 'aprobaciones', 'auditoria', 'invitaciones',
    'parametros_pago', 'seguridad'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: solo su empresa" on public.%I', t, t);
    execute format(
      'create policy "%s: solo su empresa" on public.%I
         as restrictive
         for all to authenticated
         using (public.ve_empresa(empresa_id))
         with check (public.ve_empresa(empresa_id))', t, t);
  end loop;
end;
$$;

-- Los perfiles también: nadie tiene por qué ver la lista de gente de otra
-- empresa. El soporte sí, y cada uno el suyo aunque todavía no tenga empresa.
drop policy if exists "perfiles: solo su empresa" on public.perfiles;
create policy "perfiles: solo su empresa" on public.perfiles
  as restrictive
  for all to authenticated
  using (id = auth.uid() or public.ve_empresa(empresa_id))
  with check (id = auth.uid() or public.ve_empresa(empresa_id));

-- ─── 8. Quién es de quién, hoy ──────────────────────────────────────────────
--
-- El demo a la empresa de prueba y todos los demás a Valar.
--
-- EL SOPORTE TAMBIÉN LLEVA EMPRESA, y no es un detalle: `empresa_id` entra por
-- defecto desde `empresa_actual()`, así que alguien sin empresa no puede crear
-- NADA —ni siquiera una invitación—, porque la columna es NOT NULL y el valor
-- le sale nulo. Dejarlo sin empresa "porque las cruza todas" era dejarlo sin
-- poder trabajar. Mirar de todo lo da `cruza_empresas`; crear lo da esta
-- columna, y son dos permisos distintos a propósito.

update public.perfiles p
   set empresa_id = 'demo'
  from auth.users u
 where u.id = p.id and u.email = 'demo@grupovalar.cl';

update public.perfiles
   set empresa_id = 'valar'
 where empresa_id is null;

-- El demo deja de ser `admin`: con eso podía administrar usuarios de verdad.
update public.perfiles p
   set rol = 'gestion'
  from auth.users u
 where u.id = p.id and u.email = 'demo@grupovalar.cl' and p.rol = 'admin';

-- ─── 9. PostgREST sirve desde una caché de esquema ──────────────────────────
-- Sin esto, `empresas` y las columnas nuevas no aparecen hasta que el servicio
-- decida recargar solo. Ya nos costó una vuelta entera antes.

notify pgrst, 'reload schema';
