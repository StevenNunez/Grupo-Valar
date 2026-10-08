-- ============================================================================
-- 0067 — Una OC y una factura pueden cubrir varios estados de pago
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Va después de la 0066. Idempotente.
--
-- Observaciones del usuario (08-10-2026):
--
--   1. La numeración de los EDP es correlativa POR CONTRATO y por tipo: el
--      EP 23 ordinario y el EP 23 extraordinario del mismo contrato conviven.
--      Hasta ahora el número no se podía repetir dentro del contrato, y los
--      ordinarios de 9500013862 terminaron cargados como 126-129. Vuelven a
--      ser 22-25 (confirmado por el usuario).
--
--   2. El mandante emite UNA orden de compra para el ordinario y el
--      extraordinario del mes, y se factura UNA factura por los dos. Antes la
--      orden y la factura colgaban de un solo EDP (estado_pago_id), y hubo que
--      cargar la OC 9000114150 dos veces e inventar el folio "678-E". Ahora
--      es al revés: el EDP apunta a su orden y a su factura
--      (estados_pago.orden_compra_id / factura_id), y varios EDP pueden
--      apuntar a la misma. Se unen los duplicados que ya existían.
--
--   3. La OC del mandante es para COBRAR, no para comprar: lleva forma de
--      pago (contado / crédito) y fecha de cobro, que pasa a ser el
--      vencimiento propuesto de la factura.
--
--   4. Los EDP no cambiaban de estado: nada movía "estado" al facturar ni al
--      pagar, y la vista daba "Por aprobar" a los EDP marcados "pagado". Ahora
--      el estado lo mueve la factura: emitida → "facturado" (en pantalla:
--      "Pendiente de pago"), pagada → "pagado".
-- ============================================================================

-- ─── 1. El EDP apunta a su orden y a su factura ─────────────────────────────

alter table public.estados_pago
  add column if not exists orden_compra_id text,
  add column if not exists factura_id text;

alter table public.estados_pago drop constraint if exists estados_pago_orden_compra_fkey;
alter table public.estados_pago add constraint estados_pago_orden_compra_fkey
  foreign key (empresa_id, orden_compra_id) references public.ordenes_compra (empresa_id, id)
  on update cascade on delete set null (orden_compra_id);
alter table public.estados_pago drop constraint if exists estados_pago_factura_fkey;
alter table public.estados_pago add constraint estados_pago_factura_fkey
  foreign key (empresa_id, factura_id) references public.facturas (empresa_id, id)
  on update cascade on delete set null (factura_id);

create index if not exists estados_pago_orden_idx on public.estados_pago (empresa_id, orden_compra_id)
  where orden_compra_id is not null;
create index if not exists estados_pago_factura_idx on public.estados_pago (empresa_id, factura_id)
  where factura_id is not null;

comment on column public.estados_pago.orden_compra_id is
  'La OC del mandante que autoriza este EDP. Una misma OC puede cubrir varios EDP (ordinario y extraordinario del mes).';
comment on column public.estados_pago.factura_id is
  'La factura (folio) con que se cobró. Una factura puede incluir varios EDP.';

/* Lo que ya estaba enlazado al revés. Solo si las columnas viejas siguen. */
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ordenes_compra' and column_name = 'estado_pago_id') then
    update public.estados_pago e set orden_compra_id = o.id
      from public.ordenes_compra o
     where o.empresa_id = e.empresa_id and o.estado_pago_id = e.id and e.orden_compra_id is null;
    update public.estados_pago e set factura_id = f.id
      from public.facturas f
     where f.empresa_id = e.empresa_id and f.estado_pago_id = e.id and e.factura_id is null;
  end if;
end;
$$;

-- ─── 2. Unir las OC repetidas (mismo contrato y mismo N°) ───────────────────
-- Se queda la que tiene el PDF adjunto o, si ninguna, la primera que se cargó.
-- Las repetidas autorizaban el mismo monto (el total de la OC): no se suman.

do $$
declare
  r record;
begin
  for r in
    select empresa_id, id, primera
      from (select o.empresa_id, o.id,
                   first_value(o.id) over (
                     partition by o.empresa_id, o.contrato_id, btrim(o.numero)
                     order by exists (select 1 from public.adjuntos a
                                       where a.empresa_id = o.empresa_id and a.tabla = 'ordenes_compra'
                                         and a.registro_id = o.id) desc,
                              o.creado_en) as primera
              from public.ordenes_compra o) x
     where id <> primera
  loop
    update public.estados_pago set orden_compra_id = r.primera
     where empresa_id = r.empresa_id and orden_compra_id = r.id;
    update public.facturas set orden_compra_id = r.primera
     where empresa_id = r.empresa_id and orden_compra_id = r.id;
    update public.adjuntos set registro_id = r.primera
     where empresa_id = r.empresa_id and tabla = 'ordenes_compra' and registro_id = r.id;
    delete from public.ordenes_compra where empresa_id = r.empresa_id and id = r.id;
  end loop;
end;
$$;

create unique index if not exists ordenes_compra_numero_por_contrato
  on public.ordenes_compra (empresa_id, contrato_id, btrim(numero));

-- ─── 3. La factura 678 de Valar, partida en "678" y "678-E" ─────────────────
-- Es una sola factura del SII por los dos EDP de septiembre (EP 129 y EP 26):
-- neto $85.540.293, que ya tenían las dos. La 678 quedó con el IVA del EP 129
-- solo; se corrige al 19% del neto. El EDP de la "678-E" pasa a la 678.

do $$
begin
  if exists (select 1 from public.facturas where empresa_id = 'valar' and id = '678-E')
     and exists (select 1 from public.facturas where empresa_id = 'valar' and id = '678') then
    update public.estados_pago set factura_id = '678'
     where empresa_id = 'valar' and factura_id = '678-E';
    update public.adjuntos set registro_id = '678'
     where empresa_id = 'valar' and tabla = 'facturas' and registro_id = '678-E';
    delete from public.facturas where empresa_id = 'valar' and id = '678-E';
    update public.facturas set iva = round(neto * 0.19)
     where empresa_id = 'valar' and id = '678';
  end if;
end;
$$;

-- ─── 4. Numeración correlativa por contrato, anexo y tipo ───────────────────

drop index if exists public.estados_pago_numero_por_anexo;
create unique index if not exists estados_pago_numero_por_tipo
  on public.estados_pago (empresa_id, contrato_id, coalesce(anexo_id, ''), tipo_edp, numero);

-- Los ordinarios de 9500013862 vuelven a su número real (confirmado 08-10-2026).
update public.estados_pago set numero = v.numero
  from (values ('EP 22', 22), ('EPO 23', 23), ('EP124', 24), ('EP 129', 25)) as v(id, numero)
 where empresa_id = 'valar' and contrato_id = '9500013862' and tipo_edp = 'ordinario'
   and estados_pago.id = v.id and estados_pago.numero <> v.numero;

-- ─── 5. La OC del mandante: forma de pago y fecha de cobro ──────────────────

alter table public.ordenes_compra
  add column if not exists forma_pago text,
  add column if not exists fecha_cobro date;
alter table public.ordenes_compra drop constraint if exists ordenes_compra_forma_pago_check;
alter table public.ordenes_compra add constraint ordenes_compra_forma_pago_check
  check (forma_pago is null or forma_pago in ('contado', 'credito'));

comment on column public.ordenes_compra.forma_pago is 'Contado o crédito: cómo paga el mandante.';
comment on column public.ordenes_compra.fecha_cobro is
  'Cuándo se le cobra al mandante. Es el vencimiento que se propone al facturar.';

-- Las cargadas hasta hoy usaban "vigencia" como fecha de cobro.
update public.ordenes_compra set fecha_cobro = vigencia
 where fecha_cobro is null and vigencia is not null;

-- ─── 6. El estado del EDP lo mueve su factura ───────────────────────────────

/* Al enlazar o desenlazar la factura del EDP. Un EDP "pagado" sin factura
   (los de antes de la plataforma) se respeta: no hay nada que lo contradiga. */
create or replace function public.estado_edp_por_factura()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cobro text;
begin
  if new.factura_id is not null then
    select estado_cobro into cobro from public.facturas
     where empresa_id = new.empresa_id and id = new.factura_id;
    if cobro = 'pagada' then
      new.estado := 'pagado';
      if new.monto_cobrado = 0 then
        new.monto_cobrado := greatest(new.monto_neto - new.retenciones, 0);
      end if;
    elsif cobro is not null then
      new.estado := 'facturado';
    end if;
  elsif tg_op = 'UPDATE' and old.factura_id is not null and new.estado in ('facturado', 'pagado') then
    new.estado := 'aprobado';
  end if;
  return new;
end;
$$;

drop trigger if exists estados_pago_estado_por_factura on public.estados_pago;
create trigger estados_pago_estado_por_factura before insert or update of factura_id on public.estados_pago
  for each row execute function public.estado_edp_por_factura();

/* Al cambiar el cobro de la factura: todos sus EDP a la vez. */
create or replace function public.estado_edp_desde_factura()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.estados_pago e
     set estado = case when new.estado_cobro = 'pagada' then 'pagado' else 'facturado' end,
         monto_cobrado = case
           when new.estado_cobro = 'pagada' and e.monto_cobrado = 0 then greatest(e.monto_neto - e.retenciones, 0)
           else e.monto_cobrado end
   where e.empresa_id = new.empresa_id and e.factura_id = new.id;
  return null;
end;
$$;

drop trigger if exists facturas_estado_de_sus_edp on public.facturas;
create trigger facturas_estado_de_sus_edp after update of estado_cobro on public.facturas
  for each row when (old.estado_cobro is distinct from new.estado_cobro)
  execute function public.estado_edp_desde_factura();

-- Los EDP que ya tienen factura quedan con el estado que les corresponde.
update public.estados_pago e
   set estado = case when f.estado_cobro = 'pagada' then 'pagado' else 'facturado' end
  from public.facturas f
 where f.empresa_id = e.empresa_id and f.id = e.factura_id
   and e.estado is distinct from case when f.estado_cobro = 'pagada' then 'pagado' else 'facturado' end;

-- ─── 7. La vista del ciclo, con los enlaces nuevos ──────────────────────────

drop view if exists public.ciclo_ingreso;
create view public.ciclo_ingreso
with (security_invoker = true) as
select e.id,
       e.contrato_id,
       c.nombre as contrato,
       c.cliente,
       e.numero,
       e.periodo,
       e.tipo_edp,
       e.estado,
       e.avance_periodo,
       e.monto_neto,
       e.monto_uf,
       e.retenciones,
       e.monto_cobrado,
       e.fecha_presentacion,
       e.fecha_aprobacion,
       e.datos,
       e.anexo_id,
       o.id as orden_id,
       o.numero as orden_numero,
       o.mandante as orden_mandante,
       o.monto_autorizado,
       o.fecha_emision as orden_fecha,
       o.forma_pago as orden_forma_pago,
       o.fecha_cobro as orden_fecha_cobro,
       o.estado as orden_estado,
       f.id as factura_id,
       f.neto as factura_neto,
       f.iva as factura_iva,
       f.total as factura_total,
       f.fecha_emision as factura_fecha,
       f.vencimiento as factura_vencimiento,
       f.estado_cobro,
       case
         when f.estado_cobro = 'pagada' or e.estado = 'pagado' then 'cerrado'
         when f.id is not null or e.estado = 'facturado' then 'cobro'
         when o.id is not null then 'factura'
         when e.estado = 'aprobado' then 'orden'
         else 'edp'
       end as etapa
  from public.estados_pago e
  join public.contratos c on c.empresa_id = e.empresa_id and c.id = e.contrato_id
  left join public.ordenes_compra o on o.empresa_id = e.empresa_id and o.id = e.orden_compra_id
  left join public.facturas f on f.empresa_id = e.empresa_id and f.id = e.factura_id;

grant select on public.ciclo_ingreso to authenticated;

-- ─── 8. Los enlaces viejos, al revés, se van ────────────────────────────────
-- facturas.orden_compra_id también: una factura puede cubrir varias OC, y
-- cuáles son sale de sus EDP.

alter table public.ordenes_compra drop column if exists estado_pago_id;
alter table public.facturas drop column if exists estado_pago_id;
alter table public.facturas drop column if exists orden_compra_id;

notify pgrst, 'reload schema';
