-- ============================================================================
-- 0042 — Acceso por módulo: Administrador, Usuario, Visualizador, Personalizado
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0041 y ANTES de la 0043 (que es la que hace cumplir esto en
-- cada tabla). Correr `npm run revisar-sql` antes de pegarlo.
--
-- LO QUE HABÍA. Un rol por persona para toda la plataforma (Gerente,
-- Supervisor, RRHH… catorce) y un switch por rol. El rol mezclaba dos cosas:
-- QUIÉN es la persona y QUÉ puede hacer.
--
-- LO QUE QUEDA. Esas dos cosas se separan:
--
--   cargo   (`roles`, `perfiles.rol`)  quién es. Un título, nada más. Lo
--           administran el Administrador general y Soporte: crear, renombrar,
--           describir, desactivar.
--   acceso  (`accesos`)  qué puede hacer, MÓDULO POR MÓDULO:
--
--     administrador  todo en ese módulo, e invita gente a ESE módulo
--     usuario        ingresa datos (lo de `nivel_permisos`) + switches extra
--     visualizador   solo mira, y solo las secciones que se le prendan
--     personalizado  parte de cero, switch por switch
--
--   Y por encima, `perfiles.acceso_general`: el Administrador general (todo,
--   en todos los módulos) y Soporte (lo mismo, en todas las empresas).
--
-- CONTRATOS. Cada acceso dice si ve todos los contratos del módulo o solo los
-- de `acceso_contratos`. Es por módulo y no por persona: alguien puede ver
-- todo Abastecimiento y en Control de Gestión solo el contrato de Carpas.
--
-- `tiene_permiso()` CONSERVA SU NOMBRE Y SU FIRMA. Las políticas que ya lo
-- llaman siguen funcionando; lo que cambia es de dónde saca la respuesta.
--
-- LAS TABLAS VIEJAS NO SE BORRAN TODAVÍA. `rol_permisos` y `usuario_permisos`
-- se dejan de leer pero quedan, para que la pantalla vieja no se caiga entre
-- que se aplica esto y se despliega la nueva. Se van en una migración aparte.
-- ============================================================================

-- ─── 1. Los módulos, como datos ─────────────────────────────────────────────
-- El id es el mismo de `apps/plataforma/src/lib/modulos.ts`.

create table if not exists public.modulos (
  id text primary key,
  titulo text not null,
  orden smallint not null default 50
);

comment on table public.modulos is
  'Los módulos de la plataforma. Cada permiso pertenece a uno, y el acceso de una persona se da módulo por módulo.';

insert into public.modulos (id, titulo, orden) values
  ('control-de-gestion', 'Control de Gestión', 10),
  ('abastecimiento',     'Abastecimiento',     20)
on conflict (id) do update
  set titulo = excluded.titulo,
      orden = excluded.orden;

-- ─── 2. El catálogo de permisos, por módulo y por sección ───────────────────
--
-- Antes "Ver Control de Gestión" abría todo de una vez. Para que un
-- Visualizador vea SOLO lo que se le muestre, el "ver" se parte por sección,
-- siguiendo las páginas que existen.
--
-- `modulo_id` nulo = del Administrador general, no de un módulo.
-- `lectura` = es un "ver"; es lo único que se le puede prender a un
-- Visualizador.

alter table public.permisos
  add column if not exists modulo_id text references public.modulos (id) on update cascade,
  add column if not exists lectura boolean not null default false;

/* Para que `acceso_permisos` pueda exigir, con una foránea, que el permiso sea
   del mismo módulo que el acceso. Es estructura, no una regla que se olvide. */
create unique index if not exists permisos_id_modulo on public.permisos (id, modulo_id);

insert into public.permisos (id, titulo, descripcion, grupo, orden, modulo_id, lectura) values
  -- Control de Gestión: ver
  ('contratos.ver',        'Ver contratos',                  'Contratos, anexos y su avance.',                              'Control de Gestión', 10, 'control-de-gestion', true),
  ('ingresos.ver',         'Ver ingresos',                   'Estados de pago, OC del mandante y facturas.',                'Control de Gestión', 11, 'control-de-gestion', true),
  ('egresos.ver',          'Ver egresos de terceros',        'Compras y servicios de cada contrato.',                       'Control de Gestión', 12, 'control-de-gestion', true),
  ('oficina_central.ver',  'Ver egresos de oficina central', 'Gastos de la casa matriz, sin contrato.',                     'Control de Gestión', 13, 'control-de-gestion', true),
  ('personal.ver',         'Ver costos de personal',         'Remuneraciones y dotación por contrato.',                     'Control de Gestión', 14, 'control-de-gestion', true),
  -- Control de Gestión: hacer
  ('gestion.editar',       'Cargar ingresos y egresos',      'Estados de pago, facturas, compras, servicios y oficina central.', 'Control de Gestión', 20, 'control-de-gestion', false),
  ('personal.editar',      'Cargar costos de personal',      'Haberes, HH extra y leyes sociales.',                         'Control de Gestión', 21, 'control-de-gestion', false),
  ('contratos.editar',     'Crear contratos',                'Contratos, anexos, plantilla y categorías de costo.',         'Control de Gestión', 22, 'control-de-gestion', false),

  -- Abastecimiento: ver
  ('solped.ver',           'Ver solicitudes',                'Solicitudes de faena y sus cotizaciones.',                    'Abastecimiento',     30, 'abastecimiento',     true),
  ('ordenes.ver',          'Ver órdenes de compra',          'Órdenes emitidas y lo recibido.',                             'Abastecimiento',     31, 'abastecimiento',     true),
  ('proveedores.ver',      'Ver proveedores',                'El maestro de proveedores.',                                  'Abastecimiento',     32, 'abastecimiento',     true),
  ('articulos.ver',        'Ver artículos',                  'El catálogo y sus nombres técnicos.',                         'Abastecimiento',     33, 'abastecimiento',     true),
  ('pagos.ver',            'Ver pagos',                      'Lo que se le debe a cada proveedor.',                         'Abastecimiento',     34, 'abastecimiento',     true),
  -- Abastecimiento: hacer
  ('solped.crear',         'Crear solicitudes',              'Pedir lo que falta en faena.',                                'Abastecimiento',     40, 'abastecimiento',     false),
  ('cotizacion.gestionar', 'Cotizar',                        'Pedir cotización, cargarlas y comparar.',                     'Abastecimiento',     41, 'abastecimiento',     false),
  ('recepcion.registrar',  'Registrar recepción',            'Anotar lo que llega contra la orden.',                        'Abastecimiento',     42, 'abastecimiento',     false),
  ('solped.aprobar',       'Aprobar solicitudes',            'Firmar la necesidad de una solicitud.',                       'Abastecimiento',     43, 'abastecimiento',     false),
  ('compra.autorizar',     'Autorizar la compra',            'Aprobar el gasto una vez cotizado, según el umbral.',         'Abastecimiento',     44, 'abastecimiento',     false),
  ('ordenes.emitir',       'Emitir órdenes de compra',       'Generar y enviar la OC al proveedor.',                        'Abastecimiento',     45, 'abastecimiento',     false),
  ('proveedores.editar',   'Editar proveedores',             'Crear y corregir el maestro de proveedores.',                 'Abastecimiento',     46, 'abastecimiento',     false),
  ('articulos.editar',     'Editar artículos',               'Catálogo, nombres técnicos y stock de referencia.',           'Abastecimiento',     47, 'abastecimiento',     false),
  ('pagos.programar',      'Programar pagos',                'Agendar facturas en una semana de pago.',                     'Abastecimiento',     48, 'abastecimiento',     false),
  ('pagos.marcar',         'Marcar pagos',                   'Dar por transferida una factura y retener o soltar.',         'Abastecimiento',     49, 'abastecimiento',     false),

  -- Solo el Administrador general
  ('usuarios.administrar', 'Administrar usuarios y cargos',  'Ver quién ve qué, nombrar administradores, editar cargos.',   'Administración',     90, null,                 false),
  ('parametros.editar',    'Cambiar parámetros',             'Tope de pago semanal, plazos y reglas de aprobación.',        'Administración',     91, null,                 false),
  ('auditoria.ver',        'Ver la bitácora completa',       'Quién cambió qué y cuándo, en toda la plataforma.',           'Administración',     92, null,                 true)
on conflict (id) do update
  set titulo = excluded.titulo,
      descripcion = excluded.descripcion,
      grupo = excluded.grupo,
      orden = excluded.orden,
      modulo_id = excluded.modulo_id,
      lectura = excluded.lectura;

-- ─── 3. El Administrador general y Soporte ──────────────────────────────────

alter table public.perfiles
  add column if not exists acceso_general text
    check (acceso_general in ('administrador', 'soporte'));

comment on column public.perfiles.acceso_general is
  'administrador = todo en todos los módulos. soporte = lo mismo y además cruza '
  'empresas (Teo Labs). Nulo = lo que digan sus `accesos`.';

/* Cruzar empresas pasa del CARGO a la persona. Con los cargos convertidos en
   títulos, que un título abra todas las empresas sería un agujero que nadie
   va a ver al crear un cargo nuevo. `roles.cruza_empresas` queda sin uso. */
-- La 0044 borra la columna; si ya no está, no hay nada que comentar.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'roles' and column_name = 'cruza_empresas') then
    comment on column public.roles.cruza_empresas is
      'SIN USO desde la 0042: ahora lo decide `perfiles.acceso_general = ''soporte''`.';
  end if;
end;
$$;

-- ─── 4. Los accesos ─────────────────────────────────────────────────────────

create table if not exists public.accesos (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  modulo_id text not null references public.modulos (id) on update cascade on delete cascade,
  /* La de la persona. La pone el trigger de abajo, no quien da el acceso: así
     el soporte no puede, sin querer, dejar el acceso colgado de otra empresa. */
  empresa_id text not null references public.empresas (id),
  nivel text not null default 'usuario'
    check (nivel in ('administrador', 'usuario', 'visualizador', 'personalizado')),
  /* false = solo los contratos de `acceso_contratos`. */
  todos_los_contratos boolean not null default true,
  otorgado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, modulo_id)
);

comment on table public.accesos is
  'En qué módulo entra cada persona y con qué nivel. Sin fila = no ve el módulo.';

create index if not exists accesos_modulo_idx on public.accesos (modulo_id, nivel);

/* Los switches de una persona en un módulo. Para Usuario se suman a lo que da
   el nivel; para Visualizador y Personalizado son TODO lo que tiene. */
create table if not exists public.acceso_permisos (
  usuario_id uuid not null,
  modulo_id text not null,
  permiso_id text not null,
  otorgado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, permiso_id),
  foreign key (usuario_id, modulo_id)
    references public.accesos (usuario_id, modulo_id) on delete cascade,
  -- El permiso tiene que ser de ESTE módulo. Ver el índice `permisos_id_modulo`.
  foreign key (permiso_id, modulo_id)
    references public.permisos (id, modulo_id) on update cascade on delete cascade
);

comment on table public.acceso_permisos is
  'Switches de una persona dentro de un módulo. Un Visualizador solo puede tener permisos de lectura.';

/* Los contratos que ve, cuando no los ve todos. */
create table if not exists public.acceso_contratos (
  usuario_id uuid not null,
  modulo_id text not null,
  empresa_id text not null,
  contrato_id text not null,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, modulo_id, contrato_id),
  foreign key (usuario_id, modulo_id)
    references public.accesos (usuario_id, modulo_id) on delete cascade,
  -- Llave compuesta: no puede apuntar a un contrato de otra empresa.
  foreign key (empresa_id, contrato_id)
    references public.contratos (empresa_id, id) on update cascade on delete cascade
);

comment on table public.acceso_contratos is
  'Los contratos que ve una persona en un módulo, cuando su acceso no es a todos.';

/* Lo que trae cada nivel de fábrica. Administrador no aparece: tiene todo el
   módulo. Personalizado tampoco: parte de cero. Es una tabla y no código para
   que mover un ✅ de la matriz sea un switch y no una migración. */
create table if not exists public.nivel_permisos (
  nivel text not null check (nivel in ('usuario', 'visualizador')),
  permiso_id text not null references public.permisos (id) on update cascade on delete cascade,
  primary key (nivel, permiso_id)
);

comment on table public.nivel_permisos is
  'Lo que incluye cada nivel de fábrica (la matriz). Administrador = todo el módulo; Personalizado = nada.';

insert into public.nivel_permisos (nivel, permiso_id) values
  ('usuario', 'contratos.ver'),
  ('usuario', 'ingresos.ver'),
  ('usuario', 'egresos.ver'),
  ('usuario', 'oficina_central.ver'),
  ('usuario', 'gestion.editar'),
  ('usuario', 'solped.ver'),
  ('usuario', 'ordenes.ver'),
  ('usuario', 'proveedores.ver'),
  ('usuario', 'articulos.ver'),
  ('usuario', 'solped.crear'),
  ('usuario', 'cotizacion.gestionar'),
  ('usuario', 'recepcion.registrar')
on conflict do nothing;

-- ─── 5. Lo que se cuida solo, con triggers ──────────────────────────────────

/* La empresa del acceso es la de la persona, siempre. */
create or replace function public.acceso_con_empresa_de_la_persona()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'accesos' then
    new.empresa_id := (select p.empresa_id from public.perfiles p where p.id = new.usuario_id);
    if new.empresa_id is null then
      raise exception 'Esa persona no tiene empresa asignada; primero hay que dársela.';
    end if;
    new.actualizado_en := now();
  else
    new.empresa_id := (
      select a.empresa_id from public.accesos a
       where a.usuario_id = new.usuario_id and a.modulo_id = new.modulo_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists accesos_empresa on public.accesos;
create trigger accesos_empresa
  before insert or update on public.accesos
  for each row execute function public.acceso_con_empresa_de_la_persona();

drop trigger if exists acceso_contratos_empresa on public.acceso_contratos;
create trigger acceso_contratos_empresa
  before insert or update on public.acceso_contratos
  for each row execute function public.acceso_con_empresa_de_la_persona();

/* Un Visualizador solo mira. Se cuida al prender el switch… */
create or replace function public.visualizador_solo_lectura()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.accesos a
      join public.permisos p on p.id = new.permiso_id
     where a.usuario_id = new.usuario_id
       and a.modulo_id = new.modulo_id
       and a.nivel = 'visualizador'
       and not p.lectura
  ) then
    raise exception 'Un Visualizador solo puede tener permisos de "Ver".'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists acceso_permisos_visualizador on public.acceso_permisos;
create trigger acceso_permisos_visualizador
  before insert or update on public.acceso_permisos
  for each row execute function public.visualizador_solo_lectura();

/* …y al bajar a alguien a Visualizador: lo que no sea "ver" se le apaga. Sin
   esto, bajarlo de Personalizado a Visualizador le dejaría escribir igual. */
create or replace function public.al_cambiar_nivel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nivel = 'visualizador' and old.nivel is distinct from 'visualizador' then
    delete from public.acceso_permisos ap
     using public.permisos p
     where p.id = ap.permiso_id
       and ap.usuario_id = new.usuario_id
       and ap.modulo_id = new.modulo_id
       and not p.lectura;
  end if;
  if new.todos_los_contratos and not old.todos_los_contratos then
    delete from public.acceso_contratos ac
     where ac.usuario_id = new.usuario_id and ac.modulo_id = new.modulo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists accesos_cambio_de_nivel on public.accesos;
create trigger accesos_cambio_de_nivel
  after update on public.accesos
  for each row execute function public.al_cambiar_nivel();

/* El cargo de la lista se copia a `perfiles.cargo`, que es el texto que ya
   leen la bitácora, las firmas y el encabezado. Una sola fuente de verdad (el
   catálogo) y ningún lector que reescribir. */
create or replace function public.cargo_desde_el_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'perfiles' then
    -- En un INSERT no hay `old`: se pregunta por la operación primero.
    if tg_op = 'INSERT' then
      new.cargo := coalesce((select r.titulo from public.roles r where r.id = new.rol), new.cargo);
    elsif new.rol is distinct from old.rol then
      new.cargo := coalesce((select r.titulo from public.roles r where r.id = new.rol), new.cargo);
    end if;
    return new;
  end if;

  -- Se renombró un cargo: se renombra en todas las personas que lo tienen.
  if new.titulo is distinct from old.titulo then
    update public.perfiles set cargo = new.titulo where rol = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_cargo on public.perfiles;
create trigger perfiles_cargo
  before insert or update of rol on public.perfiles
  for each row execute function public.cargo_desde_el_catalogo();

drop trigger if exists roles_renombrar on public.roles;
create trigger roles_renombrar
  after update of titulo on public.roles
  for each row execute function public.cargo_desde_el_catalogo();

-- ─── 6. Las preguntas que hacen las políticas ───────────────────────────────

create or replace function public.es_admin_general()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.acceso_general is not null from public.perfiles p where p.id = auth.uid()),
    false);
$$;

comment on function public.es_admin_general() is
  'Administrador general o Soporte: todo, en todos los módulos.';

create or replace function public.cruza_empresas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.acceso_general = 'soporte' from public.perfiles p where p.id = auth.uid()),
    false);
$$;

/* La misma firma de siempre. Cambia de dónde sale la respuesta:

     Administrador general         sí, a todo
     permiso sin módulo            no (es del Administrador general)
     sin acceso al módulo          no
     administrador del módulo      sí, a todo lo del módulo
     usuario / visualizador        lo de su nivel + sus switches
     personalizado                 sus switches                              */
create or replace function public.tiene_permiso(clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_general()
      or exists (
        select 1
          from public.permisos p
          join public.accesos a
            on a.modulo_id = p.modulo_id
           and a.usuario_id = auth.uid()
         where p.id = clave
           and (
             a.nivel = 'administrador'
             or exists (
               select 1 from public.nivel_permisos np
                where np.nivel = a.nivel and np.permiso_id = clave)
             or exists (
               select 1 from public.acceso_permisos ap
                where ap.usuario_id = a.usuario_id and ap.permiso_id = clave)
           )
      );
$$;

comment on function public.tiene_permiso(text) is
  'Si quien consulta puede esa acción, según su acceso al módulo del permiso. No mira contratos: para eso, `puede()`.';

/* ¿Ve este contrato en este módulo? Contrato nulo = un dato que no es de
   ningún contrato: lo ve solo quien ve TODOS, porque quien fue limitado a
   Carpas no debería ver lo que no se sabe de dónde es. */
create or replace function public.ve_contrato(modulo text, contrato text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_general()
      or exists (
        select 1
          from public.accesos a
         where a.usuario_id = auth.uid()
           and a.modulo_id = modulo
           and (
             a.todos_los_contratos
             or (contrato is not null and exists (
               select 1 from public.acceso_contratos ac
                where ac.usuario_id = a.usuario_id
                  and ac.modulo_id = a.modulo_id
                  and ac.contrato_id = contrato))
           )
      );
$$;

/* La pregunta que hacen casi todas las políticas de la 0043: tiene el
   permiso Y ve ese contrato en el módulo del permiso. Por eso las dos cosas
   viven juntas: alguien con Control de Gestión limitado a Carpas y
   Abastecimiento completo no puede usar lo segundo para ver lo primero. */
create or replace function public.puede(clave text, contrato text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tiene_permiso(clave)
     and public.ve_contrato(
           (select p.modulo_id from public.permisos p where p.id = clave),
           contrato);
$$;

comment on function public.puede(text, text) is
  'tiene_permiso(clave) y además ve ese contrato en el módulo del permiso.';

/* Puede escribir ALGO de ese módulo sobre ese contrato. Para las tablas que un
   módulo comparte entre varias acciones (una solicitud la editan quien la
   crea, quien la aprueba y quien emite la orden). */
create or replace function public.escribe_en(modulo text, contrato text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ve_contrato(modulo, contrato)
     and exists (
       select 1 from public.permisos p
        where p.modulo_id = modulo
          and not p.lectura
          and public.tiene_permiso(p.id));
$$;

/* Entra al módulo, con el nivel que sea. */
create or replace function public.entra_a(modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_general()
      or exists (
        select 1 from public.accesos a
         where a.usuario_id = auth.uid() and a.modulo_id = modulo);
$$;

/* Administra la gente de ese módulo. */
create or replace function public.administra_modulo(modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_general()
      or exists (
        select 1 from public.accesos a
         where a.usuario_id = auth.uid()
           and a.modulo_id = modulo
           and a.nivel = 'administrador');
$$;

/* ¿Puede ver este registro? Para lo que cuelga de cualquier tabla —adjuntos,
   bitácora, firmas— y no tiene contrato propio: se ve si se ve el registro.

   SECURITY INVOKER a propósito (es el de por defecto): la consulta corre con
   las reglas de quien mira, así que la respuesta es exactamente "¿lo vería si
   lo buscara?". Solo acepta las tablas auditadas, para que nadie pueda
   pasarle un nombre cualquiera. */
create or replace function public.ve_registro(tabla text, registro text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  visto boolean;
begin
  if not (tabla = any (public.tablas_auditadas() || array['egresos_oficina_central', 'ordenes_compra_proveedor', 'items_compra'])) then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id::text = $1)', tabla)
     into visto
    using registro;
  return visto;
end;
$$;

grant execute on function public.es_admin_general() to authenticated;
grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.ve_contrato(text, text) to authenticated;
grant execute on function public.puede(text, text) to authenticated;
grant execute on function public.escribe_en(text, text) to authenticated;
grant execute on function public.entra_a(text) to authenticated;
grant execute on function public.administra_modulo(text) to authenticated;
grant execute on function public.ve_registro(text, text) to authenticated;

-- ─── 7. Las cuentas que ya existen: nadie pierde ni gana ────────────────────
--
-- Se calcula lo que cada persona puede HOY (su rol + sus excepciones, con las
-- tablas viejas) y se traduce, módulo por módulo:
--
--   tiene todo el módulo                 → administrador
--   tiene lo que trae Usuario            → usuario + lo que le sobre, como switch
--   solo tiene "ver"                     → visualizador con esos switches
--   otra mezcla                          → personalizado con esos switches
--
-- "Ver Control de Gestión" y "Ver Abastecimiento" se abren en las secciones
-- que reemplazan. Solo se traduce a quien todavía no tiene accesos: correr
-- esto dos veces no pisa lo que ya se haya ajustado a mano.

do $$
declare
  persona record;
  m record;
  hoy text[];
  del_modulo text[];
  todo_el_modulo text[];
  de_usuario text[];
  nivel_nuevo text;
  sueltos text[];
begin
  -- Después de la 0044 las tablas viejas ya no existen: no hay nada que traducir.
  if to_regclass('public.rol_permisos') is null then
    return;
  end if;

  for persona in
    select pe.id, pe.rol
      from public.perfiles pe
     where pe.acceso_general is null
       and pe.empresa_id is not null
       and not exists (select 1 from public.accesos a where a.usuario_id = pe.id)
  loop
    -- Lo que puede hoy, con la regla vieja.
    select coalesce(array_agg(distinct x.permiso_id), '{}') into hoy
      from (
        select rp.permiso_id from public.rol_permisos rp where rp.rol_id = persona.rol
        union
        select up.permiso_id from public.usuario_permisos up
         where up.usuario_id = persona.id and up.concedido
      ) x
     where not exists (
       select 1 from public.usuario_permisos up
        where up.usuario_id = persona.id and up.permiso_id = x.permiso_id and not up.concedido);

    -- Quien administraba usuarios era, en los hechos, administrador general.
    if 'usuarios.administrar' = any (hoy) then
      update public.perfiles
         set acceso_general = case
               when (select r.cruza_empresas from public.roles r where r.id = persona.rol)
                 then 'soporte' else 'administrador' end
       where id = persona.id;
      continue;
    end if;

    -- Los "ver" de antes se abren en sus secciones.
    if 'gestion.ver' = any (hoy) then
      hoy := hoy || array['contratos.ver', 'ingresos.ver', 'egresos.ver', 'oficina_central.ver'];
    end if;
    if 'abastecimiento.ver' = any (hoy) then
      hoy := hoy || array['solped.ver', 'ordenes.ver', 'proveedores.ver', 'articulos.ver'];
    end if;

    for m in select id from public.modulos loop
      select coalesce(array_agg(p.id), '{}') into todo_el_modulo
        from public.permisos p where p.modulo_id = m.id;
      select coalesce(array_agg(p.id), '{}') into del_modulo
        from public.permisos p where p.modulo_id = m.id and p.id = any (hoy);
      select coalesce(array_agg(np.permiso_id), '{}') into de_usuario
        from public.nivel_permisos np
        join public.permisos p on p.id = np.permiso_id
       where np.nivel = 'usuario' and p.modulo_id = m.id;

      continue when cardinality(del_modulo) = 0;

      if del_modulo @> todo_el_modulo then
        nivel_nuevo := 'administrador';
        sueltos := '{}';
      elsif del_modulo @> de_usuario then
        nivel_nuevo := 'usuario';
        select coalesce(array_agg(x), '{}') into sueltos
          from unnest(del_modulo) x where not x = any (de_usuario);
      elsif not exists (
        select 1 from public.permisos p where p.id = any (del_modulo) and not p.lectura
      ) then
        nivel_nuevo := 'visualizador';
        sueltos := del_modulo;
      else
        nivel_nuevo := 'personalizado';
        sueltos := del_modulo;
      end if;

      insert into public.accesos (usuario_id, modulo_id, empresa_id, nivel)
      values (persona.id, m.id, 'valar', nivel_nuevo)  -- el trigger pone la verdadera
      on conflict do nothing;

      insert into public.acceso_permisos (usuario_id, modulo_id, permiso_id)
      select persona.id, m.id, x from unnest(sueltos) x
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

/* Los "ver" gruesos ya no sirven: se abrieron en secciones. Se borran DESPUÉS
   de traducir, porque la traducción los necesitaba. */
delete from public.permisos where id in ('gestion.ver', 'abastecimiento.ver');

-- ─── 8. RLS de lo nuevo ─────────────────────────────────────────────────────

alter table public.modulos enable row level security;
alter table public.accesos enable row level security;
alter table public.acceso_permisos enable row level security;
alter table public.acceso_contratos enable row level security;
alter table public.nivel_permisos enable row level security;

drop policy if exists "modulos: lectura" on public.modulos;
create policy "modulos: lectura" on public.modulos
  for select to authenticated using (true);

/* La matriz la lee cualquiera (la pantalla la muestra) y la cambia solo el
   Administrador general. */
drop policy if exists "nivel_permisos: lectura" on public.nivel_permisos;
create policy "nivel_permisos: lectura" on public.nivel_permisos
  for select to authenticated using (true);

drop policy if exists "nivel_permisos: administra" on public.nivel_permisos;
create policy "nivel_permisos: administra" on public.nivel_permisos
  for all to authenticated
  using (public.es_admin_general())
  with check (public.es_admin_general());

/* Accesos. Cada uno ve los suyos —tiene derecho a saber qué puede—, y el
   administrador de un módulo ve y maneja los de SU módulo. Nadie se cambia el
   propio: es la forma más corta de quedarse fuera, o de darse más. */
drop policy if exists "accesos: lectura" on public.accesos;
create policy "accesos: lectura" on public.accesos
  for select to authenticated
  using (usuario_id = auth.uid() or public.administra_modulo(modulo_id));

drop policy if exists "accesos: administra el módulo" on public.accesos;
create policy "accesos: administra el módulo" on public.accesos
  for all to authenticated
  using (
    public.administra_modulo(modulo_id)
    and (usuario_id <> auth.uid() or public.es_admin_general())
  )
  with check (
    public.administra_modulo(modulo_id)
    and (usuario_id <> auth.uid() or public.es_admin_general())
    -- No se regala lo que no se tiene: "todos los contratos" solo lo da quien
    -- ve todos.
    and (not todos_los_contratos or public.ve_contrato(modulo_id, null))
  );

/* El Administrador general no se toca desde un módulo: ni se le da ni se le
   quita acceso por ahí. Va en una restrictiva aparte para que ninguna otra
   política la pueda abrir. */
drop policy if exists "accesos: no a un administrador general" on public.accesos;
create policy "accesos: no a un administrador general" on public.accesos
  as restrictive for all to authenticated
  using (
    public.es_admin_general()
    or not exists (select 1 from public.perfiles p where p.id = usuario_id and p.acceso_general is not null)
  )
  with check (
    public.es_admin_general()
    or not exists (select 1 from public.perfiles p where p.id = usuario_id and p.acceso_general is not null)
  );

drop policy if exists "accesos: empresa" on public.accesos;
create policy "accesos: empresa" on public.accesos
  as restrictive for all to authenticated
  using (public.ve_empresa(empresa_id))
  with check (public.ve_empresa(empresa_id));

drop policy if exists "acceso_permisos: lectura" on public.acceso_permisos;
create policy "acceso_permisos: lectura" on public.acceso_permisos
  for select to authenticated
  using (usuario_id = auth.uid() or public.administra_modulo(modulo_id));

drop policy if exists "acceso_permisos: administra el módulo" on public.acceso_permisos;
create policy "acceso_permisos: administra el módulo" on public.acceso_permisos
  for all to authenticated
  using (public.administra_modulo(modulo_id) and (usuario_id <> auth.uid() or public.es_admin_general()))
  with check (public.administra_modulo(modulo_id) and (usuario_id <> auth.uid() or public.es_admin_general()));

drop policy if exists "acceso_contratos: lectura" on public.acceso_contratos;
create policy "acceso_contratos: lectura" on public.acceso_contratos
  for select to authenticated
  using (usuario_id = auth.uid() or public.administra_modulo(modulo_id));

/* Un administrador limitado a Carpas solo puede dar Carpas. */
drop policy if exists "acceso_contratos: administra el módulo" on public.acceso_contratos;
create policy "acceso_contratos: administra el módulo" on public.acceso_contratos
  for all to authenticated
  using (public.administra_modulo(modulo_id) and (usuario_id <> auth.uid() or public.es_admin_general()))
  with check (
    public.administra_modulo(modulo_id)
    and (usuario_id <> auth.uid() or public.es_admin_general())
    and public.ve_contrato(modulo_id, contrato_id)
  );

drop policy if exists "acceso_contratos: empresa" on public.acceso_contratos;
create policy "acceso_contratos: empresa" on public.acceso_contratos
  as restrictive for all to authenticated
  using (public.ve_empresa(empresa_id))
  with check (public.ve_empresa(empresa_id));

/* Guardar el acceso de una persona a un módulo, de una vez: nivel, switches y
   contratos. Desde la pantalla serían tres o cuatro escrituras, y si la
   tercera falla queda a medias —el nivel nuevo con los contratos viejos—.
   Acá es una sola transacción.

   SECURITY INVOKER (el de por defecto) a propósito: corre con las reglas de
   quien guarda, así que todas las políticas de arriba aplican igual. No es una
   puerta trasera, es un atajo. `contratos` nulo = todos. */
create or replace function public.guardar_acceso(
  persona uuid,
  modulo text,
  nivel_nuevo text,
  permisos text[],
  contratos text[]
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.accesos (usuario_id, modulo_id, empresa_id, nivel, todos_los_contratos, otorgado_por)
  values (persona, modulo, 'pendiente', nivel_nuevo, contratos is null, auth.uid())  -- la empresa la pone el trigger
  on conflict (usuario_id, modulo_id) do update
    set nivel = excluded.nivel,
        todos_los_contratos = excluded.todos_los_contratos,
        otorgado_por = excluded.otorgado_por;

  -- Al administrador no le hacen falta switches: tiene todo el módulo.
  delete from public.acceso_permisos ap
   where ap.usuario_id = persona
     and ap.modulo_id = modulo
     and (nivel_nuevo = 'administrador' or not ap.permiso_id = any (coalesce(permisos, '{}')));

  if nivel_nuevo <> 'administrador' then
    insert into public.acceso_permisos (usuario_id, modulo_id, permiso_id, otorgado_por)
    select persona, modulo, x, auth.uid()
      from unnest(coalesce(permisos, '{}')) x
    on conflict (usuario_id, permiso_id) do nothing;
  end if;

  delete from public.acceso_contratos ac
   where ac.usuario_id = persona
     and ac.modulo_id = modulo
     and (contratos is null or not ac.contrato_id = any (contratos));

  if contratos is not null then
    if cardinality(contratos) = 0 then
      raise exception 'Elige al menos un contrato, o todos.';
    end if;
    insert into public.acceso_contratos (usuario_id, modulo_id, empresa_id, contrato_id)
    select persona, modulo, 'pendiente', x from unnest(contratos) x
    on conflict (usuario_id, modulo_id, contrato_id) do nothing;
  end if;
end;
$$;

grant execute on function public.guardar_acceso(uuid, text, text, text[], text[]) to authenticated;

-- ─── 9. Quién nombra a quién ────────────────────────────────────────────────
--
-- `acceso_general` lo cambia solo el Administrador general (la política de
-- `perfiles` de la 0029 ya lo limita a `usuarios.administrar`, que ahora es
-- solo de él). Y Soporte lo da y lo quita SOLO Soporte: un administrador de
-- Valar no puede abrirle todas las empresas a nadie.

create or replace function public.proteger_campos_del_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;  -- clave de servicio o editor de SQL
  end if;

  -- El cargo ya no se escribe a mano: sale del catálogo. Cada uno corrige
  -- solo su nombre.
  if not coalesce(public.tiene_permiso('usuarios.administrar'), false)
     and (to_jsonb(new) - 'nombre')
         is distinct from (to_jsonb(old) - 'nombre') then
    raise exception 'Solo puedes cambiar tu nombre.'
      using errcode = '42501';
  end if;

  -- `coalesce`: con nulo de un lado, `is distinct from` da verdadero y le
  -- prohibiría al Administrador general nombrar a otro.
  if coalesce(new.acceso_general = 'soporte', false)
       <> coalesce(old.acceso_general = 'soporte', false)
     and not public.cruza_empresas() then
    raise exception 'Solo Soporte puede dar o quitar el acceso de Soporte.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ─── 10. Invitaciones: a qué módulos entra ──────────────────────────────────

alter table public.invitaciones
  add column if not exists accesos jsonb not null default '[]'::jsonb;

comment on column public.invitaciones.accesos is
  'Lo que se le dio al invitar: [{modulo, nivel, permisos[], contratos[] | null}]. '
  'Es la constancia; lo que manda es la tabla `accesos`.';

/* El administrador de un módulo ve las invitaciones que mandó él. Las de los
   demás llevan correos de gente que no le corresponde. */
drop policy if exists "invitaciones: las que mandé" on public.invitaciones;
create policy "invitaciones: las que mandé" on public.invitaciones
  for select to authenticated
  using (invitada_por = auth.uid());

drop policy if exists "invitaciones: cancelo las que mandé" on public.invitaciones;
create policy "invitaciones: cancelo las que mandé" on public.invitaciones
  for update to authenticated
  using (invitada_por = auth.uid())
  with check (invitada_por = auth.uid());

-- ─── 11. Resultado ──────────────────────────────────────────────────────────

do $$
declare
  generales int;
  con_acceso int;
  sin_nada int;
begin
  select count(*) into generales from public.perfiles where acceso_general is not null;
  select count(distinct usuario_id) into con_acceso from public.accesos;
  select count(*) into sin_nada from public.perfiles p
   where p.acceso_general is null
     and not exists (select 1 from public.accesos a where a.usuario_id = p.id);

  raise notice 'Administradores generales/Soporte: %. Con acceso a algún módulo: %. Sin acceso a nada: %.',
    generales, con_acceso, sin_nada;
  if generales = 0 then
    raise notice 'ATENCIÓN: nadie es Administrador general. Ponle acceso_general a alguien.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
