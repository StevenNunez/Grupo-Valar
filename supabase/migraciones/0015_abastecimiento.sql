-- ============================================================================
-- Plataforma Valar — Abastecimiento: proveedores, SOLPED y aprobaciones
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0014.
--
-- QUÉ ENTRA ACÁ (primera fase del módulo):
--   · el maestro de proveedores, con RUT único
--   · la SOLPED y sus ítems
--   · la bitácora de aprobaciones y las reglas que dicen quién aprueba qué
--   · los enlaces que faltaban para seguir una compra de punta a punta
--
-- QUÉ NO ENTRA todavía: cotizaciones, cuadro comparativo y notas de crédito.
-- Van en la fase siguiente, cuando esto ya esté en uso.
--
-- DECISIONES TOMADAS CON EL USUARIO (08-09-2026):
--
--   · La SOLPED lleva DOS firmas: quien solicita y quien aprueba. El formato en
--     papel trae una tercera (Oficina Técnica) que no corresponde a un paso
--     real del proceso, así que no se copia.
--   · La SOLPED se aprueba por NECESIDAD y no trae precios: en el formulario
--     real los precios recién aparecen al cotizar. El umbral en plata se aplica
--     al aprobar la compra, que es cuando hay precio de verdad.
--   · El umbral se mide sobre el TOTAL NETO del documento, no ítem por ítem:
--     catorce ítems de $50.000 son $700.000 y tienen que subir a gerencia.
--   · La SOLCOT es un documento INTERNO: la llena abastecimiento con los
--     precios que averigua. No se le manda al proveedor.
-- ============================================================================

-- ─── Maestro de proveedores ─────────────────────────────────────────────────
-- Hoy el proveedor es texto libre en `compras` y en las órdenes. Así,
-- "Sodimac", "SODIMAC S.A." y "sodimac antofagasta" son tres proveedores
-- distintos para la base, y no hay forma de sumar cuánto se le compró a nadie.
-- El RUT es la identidad; el nombre cambia, el RUT no.

create table if not exists public.proveedores (
  id text primary key,                                   -- "PRV-0001"
  /* Normalizado: sin puntos, con guion y K mayúscula. Lo hace un trigger, para
     que dé lo mismo cómo lo teclee cada uno. */
  rut text not null unique,
  razon_social text not null,
  nombre_fantasia text,
  giro text,
  direccion text,
  comuna text,
  ciudad text,
  contacto text,
  correo text,
  telefono text,
  /* Para pagar sin tener que buscar el correo donde mandaron los datos. */
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  condicion_pago text not null default '30 días',
  dias_credito smallint not null default 30 check (dias_credito >= 0),
  /* Qué vende. Sirve para saber a quién pedirle cotización. */
  rubros text[] not null default '{}',
  /* `por_completar` es el estado de un proveedor que se creó al vuelo desde una
     compra y al que todavía le faltan datos. No es un error: es trabajo
     pendiente, y conviene que se vea. */
  estado text not null default 'activo'
    check (estado in ('activo', 'por_completar', 'suspendido', 'inactivo')),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.proveedores is
  'Maestro de proveedores. El RUT es la identidad: sin esto no hay gasto por proveedor ni historial de cumplimiento.';

create index if not exists proveedores_razon_idx on public.proveedores (razon_social);
create index if not exists proveedores_estado_idx on public.proveedores (estado);

/* Deja el RUT en una sola forma: 77256185-7. Sin esto, el `unique` no sirve de
   nada —"77.256.185-7" y "772561857" pasarían como dos proveedores—. */
create or replace function public.normalizar_rut(entrada text)
returns text
language sql
immutable
as $$
  select case
    when entrada is null or btrim(entrada) = '' then null
    else (
      with limpio as (
        select upper(regexp_replace(entrada, '[^0-9kK]', '', 'g')) as r
      )
      select case
        when length(r) < 2 then r
        else left(r, length(r) - 1) || '-' || right(r, 1)
      end
      from limpio
    )
  end;
$$;

create or replace function public.limpiar_rut_proveedor()
returns trigger
language plpgsql
as $$
begin
  new.rut := public.normalizar_rut(new.rut);
  return new;
end;
$$;

drop trigger if exists proveedores_rut on public.proveedores;
create trigger proveedores_rut
  before insert or update on public.proveedores
  for each row execute function public.limpiar_rut_proveedor();

-- ─── La SOLPED ──────────────────────────────────────────────────────────────
-- La solicitud de pedido: alguien de faena pide comprar algo. Todavía sin
-- precios; lo que se aprueba acá es la necesidad.

create table if not exists public.solped (
  id text primary key,                                   -- "SP-MISC-0001"
  numero text not null unique,                           -- "SOLPED-097"
  contrato_id text not null references public.contratos (id) on delete restrict,

  /* Numeración del mandante. Es con lo que se conversa con SQM: sin estos
     números hay que volver al Excel para responder cualquier consulta suya. */
  sa text,
  numero_gr text,
  numero_rqm text,
  vb_na_litio text,

  /* Quién pide. El nombre y el cargo van copiados además del id: si mañana se
     borra la cuenta, la solicitud tiene que seguir diciendo quién la pidió. */
  solicitante_id uuid references auth.users (id) on delete set null,
  solicitante_nombre text not null,
  solicitante_cargo text,
  area text,

  fecha_emision date not null default current_date,
  fecha_requerida date,

  /* El mismo vocabulario que `items_compra.tipo`, a propósito: en el papel dice
     "Reembolsable / No reembolsable" y es exactamente el campo que decide si el
     gasto castiga el margen o se le recupera al mandante. Arrastrándolo hasta
     el ítem, la rentabilidad se calcula sola. */
  tipo_gasto text not null default 'ordinario'
    check (tipo_gasto in ('ordinario', 'reembolsable')),

  prioridad text not null default 'normal'
    check (prioridad in ('normal', 'alta', 'urgente')),

  /* borrador      → se está escribiendo
     en-aprobacion → esperando al aprobador
     aprobada      → hay que comprar
     en-cotizacion → abastecimiento está pidiendo precios
     cotizada      → hay precios, falta autorizar la compra
     en-compra     → hay OC emitida
     parcial       → llegó parte
     cerrada       → todo comprado y recibido
     rechazada     → no se compra
     anulada       → se dejó sin efecto */
  estado text not null default 'borrador'
    check (estado in ('borrador', 'en-aprobacion', 'aprobada', 'en-cotizacion',
                      'cotizada', 'en-compra', 'parcial', 'cerrada',
                      'rechazada', 'anulada')),
  motivo_cierre text,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.solped is
  'Solicitud de pedido. Se aprueba por necesidad, sin precios: los precios llegan al cotizar.';

create index if not exists solped_contrato_idx on public.solped (contrato_id, fecha_emision desc);
create index if not exists solped_estado_idx on public.solped (estado);

create table if not exists public.solped_items (
  id text primary key,                                   -- "SPI-000123"
  solped_id text not null references public.solped (id) on delete cascade,
  linea smallint not null,
  descripcion text not null,
  unidad text not null default 'un',
  cantidad numeric(12, 2) not null check (cantidad > 0),
  /* A qué categoría de costo del contrato va a caer. Es obligatorio en la
     práctica aunque acá sea nulo: un ítem sin categoría desaparece del análisis
     de rentabilidad, que es de donde sale el margen del mes. */
  categoria_id text references public.categorias_costo (id) on delete set null,
  observacion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (solped_id, linea)
);

comment on table public.solped_items is
  'Lo que se pide, línea por línea. Sin precio: acá todavía no se sabe cuánto cuesta.';

create index if not exists solped_items_solped_idx on public.solped_items (solped_id, linea);

-- ─── Los enlaces que faltaban ───────────────────────────────────────────────
-- Con esto se puede seguir una compra de punta a punta: qué se pidió, en qué
-- orden se compró, a quién, en qué factura llegó y cuándo se pagó.

alter table public.items_compra
  add column if not exists solped_item_id text
    references public.solped_items (id) on delete set null;

alter table public.ordenes_compra_proveedor
  add column if not exists solped_id text
    references public.solped (id) on delete set null;

alter table public.ordenes_compra_proveedor
  add column if not exists proveedor_id text
    references public.proveedores (id) on delete restrict;

alter table public.compras
  add column if not exists proveedor_id text
    references public.proveedores (id) on delete restrict;

/* Sin fecha de vencimiento no se puede avisar "vence en 3 días", que es
   justamente lo que hoy se controla mirando correos. */
alter table public.compras
  add column if not exists fecha_vencimiento date;

create index if not exists compras_vencimiento_idx
  on public.compras (fecha_vencimiento) where estado_pago <> 'pagada';

create index if not exists items_solped_idx on public.items_compra (solped_item_id);

-- ─── Quién aprueba qué ──────────────────────────────────────────────────────
-- Las reglas viven en una tabla y no en el código: los montos y los cargos van
-- a cambiar, y cambiarlos no debería requerir un despliegue.

create table if not exists public.reglas_aprobacion (
  id text primary key,
  documento text not null check (documento in ('solped', 'compra')),
  monto_desde bigint not null default 0 check (monto_desde >= 0),
  monto_hasta bigint,                                    -- nulo = sin tope
  rol text not null,
  orden smallint not null default 1,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.reglas_aprobacion is
  'Quién tiene que aprobar cada documento según su monto neto. Editable sin tocar el código.';

-- Las reglas de hoy. La SOLPED la aprueba el ADC sin importar el monto —lo que
-- se aprueba es la necesidad, y no tiene precio—. La compra la aprueba el ADC
-- siempre, y sobre $500.000 netos además gerencia.
insert into public.reglas_aprobacion (id, documento, monto_desde, monto_hasta, rol, orden)
values
  ('RA-SOLPED-ADC',      'solped', 0,      null, 'adc',      1),
  ('RA-COMPRA-ADC',      'compra', 0,      null, 'adc',      1),
  ('RA-COMPRA-GERENCIA', 'compra', 500001, null, 'gerencia', 2)
on conflict (id) do update
  set monto_desde = excluded.monto_desde,
      monto_hasta = excluded.monto_hasta,
      rol = excluded.rol,
      orden = excluded.orden;

/* Qué roles tienen que firmar un documento de este monto. La usa la app para
   pintar "falta la firma de gerencia" sin tener el umbral escrito adentro. */
create or replace function public.aprobadores_requeridos(documento text, monto bigint)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(r.rol order by r.orden), '{}')
  from public.reglas_aprobacion r
  where r.activa
    and r.documento = aprobadores_requeridos.documento
    and aprobadores_requeridos.monto >= r.monto_desde
    and (r.monto_hasta is null or aprobadores_requeridos.monto <= r.monto_hasta);
$$;

-- ─── La bitácora de aprobaciones ────────────────────────────────────────────
-- Separada de la auditoría general: acá interesa la decisión, no el cambio de
-- campo. Quién firmó, con qué cargo, cuándo y por qué.

create table if not exists public.aprobaciones (
  id bigint generated always as identity primary key,
  documento text not null check (documento in ('solped', 'compra')),
  registro_id text not null,
  /* Sobre qué monto se decidió. Guardado, no calculado: si mañana cambia el
     documento, la firma tiene que seguir diciendo qué fue lo que se autorizó. */
  monto bigint,
  accion text not null check (accion in ('aprobado', 'rechazado', 'devuelto')),
  usuario_id uuid references auth.users (id) on delete set null,
  usuario_nombre text,
  usuario_cargo text,
  usuario_rol text,
  comentario text,
  ocurrido_en timestamptz not null default now()
);

comment on table public.aprobaciones is
  'Quién autorizó qué y por qué. No se edita ni se borra: una firma que se puede cambiar no es una firma.';

create index if not exists aprobaciones_registro_idx
  on public.aprobaciones (documento, registro_id, ocurrido_en desc);

-- ─── Roles nuevos ───────────────────────────────────────────────────────────
-- `lectura`, `gestion` y `admin` no alcanzan para este flujo: hay que distinguir
-- a quien compra de quien autoriza.

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('lectura', 'gestion', 'admin', 'abastecimiento', 'adc', 'gerencia'));

comment on column public.perfiles.rol is
  'lectura · gestion · admin · abastecimiento (compra) · adc (autoriza) · gerencia (autoriza sobre el umbral)';

/* Quien puede escribir datos del módulo. Abastecimiento entra; el ADC y
   gerencia también, porque además de firmar corrigen lo que viene mal escrito
   de faena. */
create or replace function public.puede_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.rol_actual() in ('gestion', 'admin', 'abastecimiento', 'adc', 'gerencia'),
    false
  );
$$;

/* Quien puede firmar. Separado a propósito de `puede_editar`: comprar y
   autorizar la compra no pueden ser la misma persona. */
create or replace function public.puede_aprobar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('adc', 'gerencia', 'admin'), false);
$$;

-- ─── Marca de tiempo, autoría y bitácora ────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['proveedores', 'solped', 'solped_items'] loop
    execute format(
      'alter table public.%I add column if not exists creado_por uuid
         references auth.users (id) on delete set null', t);
    execute format(
      'alter table public.%I add column if not exists actualizado_por uuid
         references auth.users (id) on delete set null', t);

    execute format('drop trigger if exists %I_actualizado on public.%I', t, t);
    execute format(
      'create trigger %I_actualizado before update on public.%I
         for each row execute function public.tocar_actualizado_en()', t, t);

    execute format('drop trigger if exists %I_autoria on public.%I', t, t);
    execute format(
      'create trigger %I_autoria before insert or update on public.%I
         for each row execute function public.marcar_autoria()', t, t);

    execute format('drop trigger if exists %I_auditoria on public.%I', t, t);
    execute format(
      'create trigger %I_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end;
$$;

create or replace function public.tablas_auditadas()
returns text[]
language sql
immutable
as $$
  select array[
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal', 'seguridad', 'adjuntos',
    'proveedores', 'solped', 'solped_items'
  ];
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.proveedores enable row level security;
alter table public.solped enable row level security;
alter table public.solped_items enable row level security;
alter table public.aprobaciones enable row level security;
alter table public.reglas_aprobacion enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['proveedores', 'solped', 'solped_items'] loop
    execute format('drop policy if exists "%s: lectura autenticada" on public.%I', t, t);
    execute format(
      'create policy "%s: lectura autenticada" on public.%I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s: escribe gestion" on public.%I', t, t);
    execute format(
      'create policy "%s: escribe gestion" on public.%I
         for all to authenticated
         using (public.puede_editar()) with check (public.puede_editar())', t, t);
  end loop;
end;
$$;

-- Las firmas se leen con sesión y las escribe quien puede aprobar. NO hay
-- política de update ni de delete: una firma no se corrige, se agrega otra.
drop policy if exists "aprobaciones: lectura autenticada" on public.aprobaciones;
create policy "aprobaciones: lectura autenticada"
  on public.aprobaciones for select to authenticated using (true);

drop policy if exists "aprobaciones: firma quien puede" on public.aprobaciones;
create policy "aprobaciones: firma quien puede"
  on public.aprobaciones for insert to authenticated
  with check (public.puede_aprobar() and usuario_id = auth.uid());

-- Las reglas las lee cualquiera con sesión; las cambia solo un administrador.
drop policy if exists "reglas: lectura autenticada" on public.reglas_aprobacion;
create policy "reglas: lectura autenticada"
  on public.reglas_aprobacion for select to authenticated using (true);

drop policy if exists "reglas: cambia admin" on public.reglas_aprobacion;
create policy "reglas: cambia admin"
  on public.reglas_aprobacion for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- ─── Los respaldos también cuelgan de lo nuevo ──────────────────────────────
-- `adjuntos` acota con una restricción a qué tablas se puede adjuntar. Sin
-- sumarlas, subir la SOLPED firmada o el certificado de un proveedor fallaría.

alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'ordenes_compra', 'facturas',
    'compras', 'servicios', 'costos_personal',
    'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped'
  )
);

-- ─── Cómo va cada SOLPED ────────────────────────────────────────────────────
-- Una fila por solicitud con su avance real: cuánto se pidió, cuánto se compró
-- y cuánto llegó. Sale de los ítems, no de un campo que alguien tenga que
-- acordarse de actualizar.

drop view if exists public.solped_resumen;
create view public.solped_resumen
with (security_invoker = true) as
  select
    s.id,
    s.numero,
    s.contrato_id,
    c.nombre as contrato,
    s.sa,
    s.solicitante_nombre,
    s.solicitante_cargo,
    s.area,
    s.fecha_emision,
    s.fecha_requerida,
    s.tipo_gasto,
    s.prioridad,
    s.estado,
    count(i.id)::int as items,
    coalesce(sum(i.cantidad), 0)::numeric as cantidad_pedida,
    coalesce(sum(ic.cantidad), 0)::numeric as cantidad_comprada,
    coalesce(sum(ic.cantidad_recibida), 0)::numeric as cantidad_recibida,
    coalesce(sum(ic.neto), 0)::bigint as comprado_neto,
    /* Días que lleva esperando quien la pidió. Es el número que hace visible
       una solicitud olvidada. */
    (current_date - s.fecha_emision)::int as dias_abierta
  from public.solped s
  join public.contratos c on c.id = s.contrato_id
  left join public.solped_items i on i.solped_id = s.id
  left join public.items_compra ic on ic.solped_item_id = i.id
  group by s.id, c.nombre;

comment on view public.solped_resumen is
  'Una fila por SOLPED con su avance deducido de los ítems comprados y recibidos.';

grant select on public.solped_resumen to authenticated;

notify pgrst, 'reload schema';
