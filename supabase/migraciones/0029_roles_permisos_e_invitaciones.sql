-- ============================================================================
-- Plataforma Valar — Roles, permisos e invitaciones
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0028.
--
-- LO QUE HABÍA. `perfiles.rol` era texto con una lista cerrada de seis valores
-- escrita en un CHECK, y lo que cada rol podía hacer estaba escrito DENTRO de
-- dos funciones (`puede_editar`, `puede_aprobar`). Agregar un rol o mover un
-- permiso era una migración. Con doce roles reales —gerente general, soporte,
-- ADC, gerente, subgerente, operaciones, RRHH, abastecimiento, calidad,
-- contador, supervisor— eso no se sostiene.
--
-- LO QUE QUEDA. Tres listas y una función:
--
--   roles            quiénes son
--   permisos         qué se puede hacer, una acción por fila
--   rol_permisos     qué puede cada rol  ← esto es el switch
--   tiene_permiso()  la pregunta que hacen las políticas RLS
--
-- Los permisos de un rol son un PUNTO DE PARTIDA, no una jaula: si el gerente
-- general quiere que RRHH apruebe algo, prende el switch y listo, sin tocar
-- código. Y `usuario_permisos` deja hacer la excepción de una sola persona sin
-- alterar el rol entero, que es lo que pasa siempre en una empresa real.
--
-- `perfiles.rol` SIGUE SIENDO LA MISMA COLUMNA, ahora apuntando al catálogo en
-- vez de a un CHECK. No hay dato que migrar ni consulta que reescribir: los seis
-- roles que ya existían entran como filas con los mismos identificadores.
--
-- QUIÉN INVITA. Solo quien tenga `usuarios.administrar`, que de fábrica son el
-- gerente general y soporte. No está escrito en código: es una fila de
-- `rol_permisos` y se puede cambiar.
-- ============================================================================

-- ─── 1. Los roles, como datos ───────────────────────────────────────────────

create table if not exists public.roles (
  id text primary key,                                   -- 'gerente_general'
  titulo text not null,                                  -- 'Gerente General'
  descripcion text,
  /* Para ordenarlos en pantalla de mayor a menor alcance. No da permisos por
     sí solo: los permisos son los de `rol_permisos` y nada más. */
  orden smallint not null default 50,
  /* Los que la plataforma necesita para funcionar. No se borran; sus permisos
     sí se pueden cambiar. */
  es_sistema boolean not null default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.roles is
  'Los roles de la empresa. Es una lista de datos, no un CHECK: agregar uno no debería ser una migración.';

insert into public.roles (id, titulo, descripcion, orden, es_sistema) values
  ('gerente_general', 'Gerente General',        'Máxima autoridad. Invita usuarios y define qué puede hacer cada rol.', 10, true),
  ('soporte',         'Soporte',                'Teo Labs. Mismos permisos que la gerencia general, para poder ayudar.', 11, true),
  ('admin',           'Administrador',          'Administra la plataforma y sus parámetros.',                             20, true),
  ('gerencia',        'Gerente',                'Autoriza compras sobre el umbral.',                                      30, true),
  ('subgerente',      'Subgerente',             'Apoya a gerencia y autoriza en su ausencia.',                            31, false),
  ('operaciones',     'Gerente de Operaciones', 'Responsable de la operación en faena.',                                  32, false),
  ('adc',             'Administrador de Contrato', 'Responsable de un contrato. Aprueba las solicitudes de su faena.',    33, true),
  ('supervisor',      'Supervisor',             'Supervisa en terreno y solicita lo que falta.',                          40, false),
  ('abastecimiento',  'Abastecimiento',         'Cotiza, compra y emite las órdenes.',                                    41, true),
  ('rrhh',            'Recursos Humanos',       'Personal, remuneraciones y contratación.',                               42, false),
  ('contador',        'Contador',               'Facturas, pagos y respaldos contables.',                                 43, false),
  ('calidad',         'Calidad',                'Control de calidad y documentación del sistema de gestión.',             44, false),
  ('gestion',         'Control de Gestión',     'Carga y revisa los datos de ingresos y egresos.',                        45, true),
  ('lectura',         'Solo lectura',           'Ve la información y no cambia nada.',                                    90, true)
on conflict (id) do update
  set titulo = excluded.titulo,
      descripcion = excluded.descripcion,
      orden = excluded.orden,
      es_sistema = excluded.es_sistema;

-- ─── 2. Los permisos: una acción por fila ───────────────────────────────────

create table if not exists public.permisos (
  id text primary key,                                   -- 'solped.aprobar'
  titulo text not null,
  descripcion text,
  /* Para agrupar los switches en pantalla. */
  grupo text not null default 'General',
  orden smallint not null default 50
);

comment on table public.permisos is
  'Cada acción que la plataforma sabe controlar. Si algo no está acá, no se puede pedir en una política.';

insert into public.permisos (id, titulo, descripcion, grupo, orden) values
  ('gestion.ver',            'Ver Control de Gestión',       'Dashboard, contratos, ingresos y egresos.',                    'Control de Gestión', 10),
  ('gestion.editar',         'Cargar y corregir datos',      'Ingresos, egresos, personal y servicios.',                     'Control de Gestión', 11),
  ('contratos.editar',       'Administrar contratos',        'Crear contratos, anexos y categorías de costo.',               'Control de Gestión', 12),

  ('abastecimiento.ver',     'Ver Abastecimiento',           'Solicitudes, cotizaciones, órdenes y proveedores.',            'Abastecimiento',     20),
  ('solped.crear',           'Crear solicitudes',            'Pedir lo que falta en faena.',                                 'Abastecimiento',     21),
  ('solped.aprobar',         'Aprobar solicitudes',          'Firmar la necesidad de una solicitud.',                        'Abastecimiento',     22),
  ('cotizacion.gestionar',   'Cotizar',                      'Pedir cotización, cargarlas y comparar.',                      'Abastecimiento',     23),
  ('compra.autorizar',       'Autorizar la compra',          'Aprobar el gasto una vez cotizado, según el umbral.',           'Abastecimiento',     24),
  ('ordenes.emitir',         'Emitir órdenes de compra',     'Generar y enviar la OC al proveedor.',                         'Abastecimiento',     25),
  ('recepcion.registrar',    'Registrar recepción',          'Anotar lo que llega contra la orden.',                         'Abastecimiento',     26),
  ('proveedores.editar',     'Administrar proveedores',      'Crear y corregir el maestro de proveedores.',                  'Abastecimiento',     27),
  ('articulos.editar',       'Administrar artículos',        'Catálogo, nombres técnicos y stock de referencia.',            'Abastecimiento',     28),

  ('pagos.ver',              'Ver cuentas por pagar',        'Lo que se le debe a cada proveedor.',                          'Pagos',              30),
  ('pagos.programar',        'Programar pagos',              'Agendar facturas en una semana de pago.',                      'Pagos',              31),
  ('pagos.marcar',           'Marcar pagos',                 'Dar por transferida una factura y retener o soltar.',          'Pagos',              32),

  ('personal.ver',           'Ver costos de personal',       'Remuneraciones y dotación por contrato.',                      'Personal',           40),
  ('personal.editar',        'Cargar costos de personal',    'Haberes, HH extra y leyes sociales.',                          'Personal',           41),

  ('usuarios.administrar',   'Administrar usuarios',         'Invitar, cambiar roles y definir qué puede hacer cada rol.',   'Administración',     50),
  ('parametros.editar',      'Cambiar parámetros',           'Tope de pago semanal, plazos y reglas de aprobación.',         'Administración',     51),
  ('auditoria.ver',          'Ver la bitácora',              'Quién cambió qué y cuándo.',                                   'Administración',     52)
on conflict (id) do update
  set titulo = excluded.titulo,
      descripcion = excluded.descripcion,
      grupo = excluded.grupo,
      orden = excluded.orden;

-- ─── 3. Qué puede cada rol: EL SWITCH ───────────────────────────────────────

create table if not exists public.rol_permisos (
  rol_id text not null references public.roles (id) on delete cascade,
  permiso_id text not null references public.permisos (id) on delete cascade,
  primary key (rol_id, permiso_id)
);

comment on table public.rol_permisos is
  'Una fila = ese rol puede esa acción. Es lo que prende y apaga el switch de la pantalla de usuarios.';

/*
  El punto de partida de cada rol.

  Solo se siembra la PRIMERA vez (`on conflict do nothing` y sin borrar lo que
  haya): si el gerente general le dio a RRHH permiso para aprobar, volver a
  aplicar la migración no puede quitárselo. Un preestablecido que se reimpone
  solo no es un preestablecido, es una imposición.
*/
insert into public.rol_permisos (rol_id, permiso_id)
/* `p.id` y no `p.permiso_id`: la columna de `permisos` se llama `id`. El `*` de
   abajo se expande con el join, así que la clave del permiso siempre sale de la
   tabla y nunca del literal. */
select r.rol_id, p.id
from (values
  -- Gerente general y soporte: todo. Son los que invitan.
  ('gerente_general', '*'),
  ('soporte',         '*'),
  ('admin',           '*'),

  ('gerencia',        'gestion.ver'), ('gerencia', 'abastecimiento.ver'),
  ('gerencia',        'solped.aprobar'), ('gerencia', 'compra.autorizar'),
  ('gerencia',        'pagos.ver'), ('gerencia', 'pagos.programar'),
  ('gerencia',        'personal.ver'), ('gerencia', 'auditoria.ver'),
  ('gerencia',        'parametros.editar'),

  ('subgerente',      'gestion.ver'), ('subgerente', 'abastecimiento.ver'),
  ('subgerente',      'solped.aprobar'), ('subgerente', 'compra.autorizar'),
  ('subgerente',      'pagos.ver'), ('subgerente', 'personal.ver'),

  ('operaciones',     'gestion.ver'), ('operaciones', 'abastecimiento.ver'),
  ('operaciones',     'solped.crear'), ('operaciones', 'solped.aprobar'),
  ('operaciones',     'recepcion.registrar'), ('operaciones', 'personal.ver'),

  ('adc',             'gestion.ver'), ('adc', 'gestion.editar'),
  ('adc',             'abastecimiento.ver'), ('adc', 'solped.crear'),
  ('adc',             'solped.aprobar'), ('adc', 'compra.autorizar'),
  ('adc',             'recepcion.registrar'), ('adc', 'personal.ver'),

  ('supervisor',      'abastecimiento.ver'), ('supervisor', 'solped.crear'),
  ('supervisor',      'recepcion.registrar'),

  ('abastecimiento',  'abastecimiento.ver'), ('abastecimiento', 'solped.crear'),
  ('abastecimiento',  'cotizacion.gestionar'), ('abastecimiento', 'ordenes.emitir'),
  ('abastecimiento',  'recepcion.registrar'), ('abastecimiento', 'proveedores.editar'),
  ('abastecimiento',  'articulos.editar'), ('abastecimiento', 'pagos.ver'),
  ('abastecimiento',  'gestion.ver'),

  ('rrhh',            'personal.ver'), ('rrhh', 'personal.editar'),
  ('rrhh',            'gestion.ver'),

  ('contador',        'gestion.ver'), ('contador', 'gestion.editar'),
  ('contador',        'pagos.ver'), ('contador', 'pagos.programar'),
  ('contador',        'pagos.marcar'), ('contador', 'abastecimiento.ver'),

  ('calidad',         'gestion.ver'), ('calidad', 'abastecimiento.ver'),
  ('calidad',         'auditoria.ver'),

  ('gestion',         'gestion.ver'), ('gestion', 'gestion.editar'),
  ('gestion',         'contratos.editar'), ('gestion', 'personal.ver'),
  ('gestion',         'personal.editar'), ('gestion', 'abastecimiento.ver'),
  ('gestion',         'pagos.ver'),

  ('lectura',         'gestion.ver'), ('lectura', 'abastecimiento.ver')
) as r(rol_id, permiso_id)
join public.permisos p
  on p.id = r.permiso_id or r.permiso_id = '*'
on conflict do nothing;

-- ─── 4. La excepción de una persona ─────────────────────────────────────────
-- Sin esto, darle un permiso puntual a alguien obliga a inventarle un rol
-- propio, y así es como se termina con quince roles de una persona cada uno.

create table if not exists public.usuario_permisos (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  permiso_id text not null references public.permisos (id) on delete cascade,
  /* true = se le da además de su rol. false = se le quita aunque su rol lo
     tenga. Lo segundo existe porque suspender a alguien de una función sin
     bajarlo de rol es una necesidad real. */
  concedido boolean not null default true,
  motivo text,
  otorgado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, permiso_id)
);

comment on table public.usuario_permisos is
  'Excepciones por persona sobre lo que le da su rol. Mandan sobre `rol_permisos`.';

-- ─── 5. La pregunta que hacen las políticas ─────────────────────────────────

create or replace function public.tiene_permiso(clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      -- La excepción de la persona manda sobre lo que da el rol.
      select up.concedido
      from public.usuario_permisos up
      where up.usuario_id = auth.uid() and up.permiso_id = clave
    ),
    (
      select exists (
        select 1
        from public.perfiles pe
        join public.rol_permisos rp on rp.rol_id = pe.rol
        where pe.id = auth.uid() and rp.permiso_id = clave
      )
    ),
    false
  );
$$;

comment on function public.tiene_permiso(text) is
  'Si el usuario de la sesión puede hacer esa acción. Mira primero su excepción personal y después su rol.';

/*
  Todo lo que puede el que está mirando, de una sola consulta.

  La pantalla necesita esconder los botones que no corresponden, y preguntar
  permiso por permiso serían veinte viajes a la base para dibujar un menú. Esto
  es comodidad: quien decide de verdad sigue siendo la política RLS de cada
  tabla. Que un botón no se vea evita el error honesto; no evita a nadie.
*/
create or replace function public.mis_permisos()
returns table (permiso_id text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.permisos p
  where public.tiene_permiso(p.id);
$$;

comment on function public.mis_permisos() is
  'Los permisos del usuario de la sesión. Para que la pantalla sepa qué mostrar; la seguridad la pone RLS.';

grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.mis_permisos() to authenticated;

-- ─── 6. Los atajos de siempre, ahora leyendo permisos ───────────────────────
-- Se conservan los nombres porque están en decenas de políticas RLS. Lo que
-- cambia es de dónde sacan la respuesta: antes de una lista escrita adentro,
-- ahora de la tabla que el gerente general puede editar.

/*
  Quien puede escribir ALGO. Es la pregunta gruesa que hacen hoy las políticas
  de casi todas las tablas.

  Se arma con los permisos de ESCRITURA, uno por uno, y a propósito no incluye
  ningún `.ver`: sumar `abastecimiento.ver` acá le daría permiso de escritura a
  Calidad y a Solo lectura, que es exactamente lo contrario de lo que se busca.

  Que una sola función cubra tantas tablas es lo que hay que ir desarmando: el
  paso siguiente es que cada tabla pida SU permiso —`solped` pida
  `solped.crear`, `proveedores` pida `proveedores.editar`— en vez de esta
  pregunta general. Se deja escrito acá para que no se pierda.
*/
create or replace function public.puede_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tiene_permiso('gestion.editar')
      or public.tiene_permiso('contratos.editar')
      or public.tiene_permiso('personal.editar')
      or public.tiene_permiso('solped.crear')
      or public.tiene_permiso('cotizacion.gestionar')
      or public.tiene_permiso('ordenes.emitir')
      or public.tiene_permiso('recepcion.registrar')
      or public.tiene_permiso('proveedores.editar')
      or public.tiene_permiso('articulos.editar')
      or public.tiene_permiso('pagos.programar')
      or public.tiene_permiso('pagos.marcar');
$$;

comment on function public.puede_editar() is
  'Atajo histórico: si el usuario puede escribir algo. Sale de `rol_permisos`, no de una lista escrita adentro. Ver la nota: hay que ir reemplazándolo por el permiso puntual de cada tabla.';

create or replace function public.puede_aprobar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tiene_permiso('solped.aprobar')
      or public.tiene_permiso('compra.autorizar');
$$;

comment on function public.puede_aprobar() is
  'Atajo histórico: quien firma. Comprar y autorizar siguen siendo permisos distintos.';

-- El rol deja de ser una lista cerrada y pasa a apuntar al catálogo.
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles drop constraint if exists perfiles_rol_fkey;
alter table public.perfiles
  add constraint perfiles_rol_fkey foreign key (rol)
  references public.roles (id) on update cascade on delete restrict;

comment on column public.perfiles.rol is
  'Qué rol tiene, del catálogo `roles`. Lo que puede hacer sale de `rol_permisos` y de sus excepciones.';

-- ─── 7. Invitaciones ────────────────────────────────────────────────────────
-- La cuenta la crea Supabase Auth al aceptar; esto es el registro de a quién se
-- invitó, con qué rol y en qué quedó. Existe para poder responder "¿le llegó?"
-- sin abrir el panel de Supabase.

create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  correo text not null,
  rol text not null references public.roles (id) on update cascade,
  nombre text,
  cargo text,

  estado text not null default 'enviada'
    check (estado in ('enviada', 'aceptada', 'expirada', 'cancelada')),

  invitada_por uuid references auth.users (id) on delete set null,
  enviada_en timestamptz not null default now(),
  /* Una invitación que no caduca es una puerta abierta para siempre. */
  vence_en timestamptz not null default now() + interval '7 days',
  aceptada_en timestamptz,
  aceptada_por uuid references auth.users (id) on delete set null,

  observaciones text
);

comment on table public.invitaciones is
  'A quién se invitó, con qué rol y en qué quedó. La cuenta la crea Supabase Auth al aceptar.';

/* Un correo puede tener varias invitaciones a lo largo del tiempo —se venció,
   se reenvió—, pero solo una viva a la vez. */
create unique index if not exists invitaciones_correo_viva
  on public.invitaciones (lower(correo))
  where estado = 'enviada';

create index if not exists invitaciones_estado_idx on public.invitaciones (estado, enviada_en desc);

/* Las vencidas se marcan solas al consultarlas. Se hace con una función y no
   con un cron para que la pantalla nunca muestre como "enviada" una que ya no
   sirve. */
create or replace function public.caducar_invitaciones()
returns void
language sql
security definer
set search_path = public
as $$
  update public.invitaciones
  set estado = 'expirada'
  where estado = 'enviada' and vence_en < now();
$$;

grant execute on function public.caducar_invitaciones() to authenticated;

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────

alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.usuario_permisos enable row level security;
alter table public.invitaciones enable row level security;

/* Los catálogos los lee cualquiera con sesión: la pantalla necesita saber cómo
   se llama un rol para mostrarlo, y esconder los nombres no protege nada. */
do $$
declare
  t text;
begin
  foreach t in array array['roles', 'permisos', 'rol_permisos'] loop
    execute format('drop policy if exists "%s: lectura autenticada" on public.%I', t, t);
    execute format(
      'create policy "%s: lectura autenticada" on public.%I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s: administra quien puede" on public.%I', t, t);
    execute format(
      'create policy "%s: administra quien puede" on public.%I
         for all to authenticated
         using (public.tiene_permiso(''usuarios.administrar''))
         with check (public.tiene_permiso(''usuarios.administrar''))', t, t);
  end loop;
end;
$$;

/* Las excepciones personales: cada uno ve las suyas —tiene derecho a saber qué
   puede hacer— y solo quien administra usuarios ve y cambia las de todos. */
drop policy if exists "usuario_permisos: lectura" on public.usuario_permisos;
create policy "usuario_permisos: lectura"
  on public.usuario_permisos for select to authenticated
  using (usuario_id = auth.uid() or public.tiene_permiso('usuarios.administrar'));

drop policy if exists "usuario_permisos: administra quien puede" on public.usuario_permisos;
create policy "usuario_permisos: administra quien puede"
  on public.usuario_permisos for all to authenticated
  using (public.tiene_permiso('usuarios.administrar'))
  with check (public.tiene_permiso('usuarios.administrar'));

/* Las invitaciones solo las ve quien administra usuarios: llevan el correo de
   gente que todavía no entra, y eso no tiene por qué verlo el resto. */
drop policy if exists "invitaciones: administra quien puede" on public.invitaciones;
create policy "invitaciones: administra quien puede"
  on public.invitaciones for all to authenticated
  using (public.tiene_permiso('usuarios.administrar'))
  with check (public.tiene_permiso('usuarios.administrar'));

/* `perfiles` deja de ser solo de lectura: quien administra usuarios cambia el
   rol de los demás, y cada uno puede corregir su propio nombre y cargo. */
drop policy if exists "perfiles: administra quien puede" on public.perfiles;
create policy "perfiles: administra quien puede"
  on public.perfiles for all to authenticated
  using (public.tiene_permiso('usuarios.administrar'))
  with check (public.tiene_permiso('usuarios.administrar'));

drop policy if exists "perfiles: cada uno el suyo" on public.perfiles;
create policy "perfiles: cada uno el suyo"
  on public.perfiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── 9. Quién queda administrando ───────────────────────────────────────────
-- Si nadie tuviera `usuarios.administrar`, nadie podría dárselo a nadie: la
-- plataforma quedaría sin puerta de entrada. Los que hoy son 'admin' ya lo
-- tienen por su rol, y esto solo lo deja escrito para que se vea.

do $$
declare
  cuantos int;
begin
  select count(*) into cuantos
  from public.perfiles pe
  join public.rol_permisos rp on rp.rol_id = pe.rol
  where rp.permiso_id = 'usuarios.administrar';

  if cuantos = 0 then
    raise notice 'ATENCIÓN: ninguna cuenta puede administrar usuarios. Asigna el rol gerente_general o soporte a alguien.';
  else
    raise notice '% cuenta(s) pueden administrar usuarios.', cuantos;
  end if;
end;
$$;

notify pgrst, 'reload schema';
