-- ════════════════════════════════════════════════════════════════════════════
-- 0079 — Garantías pagadas a proveedores
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un depósito en garantía (arriendo de cilindros, de equipos) sale de la caja
-- pero no es un gasto: se devuelve. Cargarlo como compra lo contaba como costo
-- o, en $0, lo escondía. Acá tiene su propio registro y su propio ciclo:
--
--   pagada → pendiente de devolución → devuelta
--
-- Con contrato (y anexo, si es de un anexo) o sin contrato, que es Oficina
-- Central. No entra en ninguna vista de costo. Lleva el comprobante adjunto
-- con el clip y su historial, como el resto.

create table if not exists public.garantias (
  empresa_id text not null default public.empresa_actual() references public.empresas(id),
  id text not null default ('GA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  -- Nulo = Oficina Central.
  contrato_id text,
  anexo_id text,
  proveedor_id text,
  -- Como figura en el comprobante; se llena solo al elegir la ficha.
  proveedor text not null check (btrim(proveedor) <> ''),
  concepto text not null check (btrim(concepto) <> ''),
  monto bigint not null check (monto > 0),
  fecha_pago date not null,
  documento text,
  -- Cuándo debería volver. Pasada esa fecha y sin devolverse, está vencida.
  devolucion_esperada date,
  estado text not null default 'pagada' check (estado in ('pagada', 'por_devolver', 'devuelta')),
  fecha_devolucion date,
  -- Lo que efectivamente volvió; puede ser menos si el proveedor descontó algo.
  monto_devuelto bigint not null default 0 check (monto_devuelto >= 0),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (empresa_id, id),
  constraint garantias_contrato_fkey foreign key (empresa_id, contrato_id)
    references public.contratos (empresa_id, id) on delete restrict,
  constraint garantias_anexo_fkey foreign key (empresa_id, anexo_id)
    references public.anexos (empresa_id, id) on delete set null (anexo_id),
  constraint garantias_proveedor_fkey foreign key (empresa_id, proveedor_id)
    references public.proveedores (empresa_id, id) on delete set null (proveedor_id),
  constraint garantias_anexo_con_contrato check (anexo_id is null or contrato_id is not null),
  constraint garantias_devuelta_con_fecha check (estado <> 'devuelta' or fecha_devolucion is not null),
  constraint garantias_devuelto_no_excede check (monto_devuelto <= monto)
);

comment on table public.garantias is
  'Depósitos en garantía pagados a proveedores. No son gasto: se devuelven. Ciclo: pagada → pendiente de devolución → devuelta.';
comment on column public.garantias.monto_devuelto is
  'Lo que volvió. Si es menos que el monto, el proveedor retuvo la diferencia.';

create index if not exists garantias_contrato_idx on public.garantias (empresa_id, contrato_id, fecha_pago);
create index if not exists garantias_estado_idx on public.garantias (empresa_id, estado);

drop trigger if exists garantias_autoria on public.garantias;
create trigger garantias_autoria before insert or update on public.garantias
  for each row execute function public.marcar_autoria();
drop trigger if exists garantias_actualizado on public.garantias;
create trigger garantias_actualizado before update on public.garantias
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists garantias_anexo_valido on public.garantias;
create trigger garantias_anexo_valido before insert or update of anexo_id, contrato_id on public.garantias
  for each row execute function public.validar_anexo_del_contrato();
drop trigger if exists garantias_auditoria on public.garantias;
create trigger garantias_auditoria after insert or update or delete on public.garantias
  for each row execute function public.registrar_auditoria();

/* Se ven como los egresos del contrato y se cargan con "Cargar ingresos y
   egresos". Sin contrato son de Oficina Central y siguen sus permisos. */
alter table public.garantias enable row level security;

drop policy if exists "garantias: lee" on public.garantias;
create policy "garantias: lee" on public.garantias for select to authenticated using (
  public.ve_empresa(empresa_id) and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver')
    else public.puede('egresos.ver', contrato_id)
  end);

drop policy if exists "garantias: crea" on public.garantias;
create policy "garantias: crea" on public.garantias for insert to authenticated with check (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('gestion.editar')
    else public.puede('gestion.editar', contrato_id)
  end);

drop policy if exists "garantias: cambia" on public.garantias;
create policy "garantias: cambia" on public.garantias for update to authenticated using (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('gestion.editar')
    else public.puede('gestion.editar', contrato_id)
  end) with check (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('gestion.editar')
    else public.puede('gestion.editar', contrato_id)
  end);

drop policy if exists "garantias: borra" on public.garantias;
create policy "garantias: borra" on public.garantias for delete to authenticated using (
  empresa_id = public.empresa_actual() and case
    when contrato_id is null then public.tiene_permiso('oficina_central.ver') and public.tiene_permiso('gestion.editar')
    else public.puede('gestion.editar', contrato_id)
  end);

grant select, insert, update, delete on public.garantias to authenticated;

/* Historial y comprobante (adjuntos) se ven si se ve el registro. */
create or replace function public.ve_registro(tabla text, registro text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  visto boolean;
begin
  if not (tabla = any (public.tablas_auditadas() || array[
    'egresos_oficina_central', 'ordenes_compra_proveedor', 'items_compra',
    'nominas_oficina_central',
    'recepciones', 'recepcion_items', 'factura_items', 'notas_credito', 'nota_credito_items',
    'finiquitos', 'garantias'
  ])) then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id::text = $1)', tabla)
     into visto
    using registro;
  return visto;
end;
$$;

alter table public.adjuntos drop constraint if exists adjuntos_tabla_valida;
alter table public.adjuntos add constraint adjuntos_tabla_valida check (
  tabla in (
    'contratos', 'estados_pago', 'facturas', 'ordenes_compra', 'compras',
    'servicios', 'costos_personal', 'ordenes_compra_proveedor', 'items_compra',
    'proveedores', 'solped', 'cotizaciones', 'anexos', 'articulos',
    'nominas_oficina_central', 'recepciones', 'notas_credito', 'finiquitos', 'garantias'
  )
);

notify pgrst, 'reload schema';
