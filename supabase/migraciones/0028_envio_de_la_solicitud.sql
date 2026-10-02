-- ============================================================================
-- Plataforma Valar — Dejar constancia de cuándo se le mandó la solicitud
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0027.
--
-- EL PROBLEMA: `solicitada_en` dice cuándo se CREÓ la solicitud, no cuándo se
-- envió. Entre las dos cosas puede pasar un día, y la pregunta que se hace en
-- la reunión —"¿ya le escribiste?"— no se contestaba con la plataforma. Peor:
-- el tiempo de respuesta del proveedor salía castigado por el rato que la
-- solicitud estuvo hecha y sin mandar, que no es culpa de él.
--
-- Se agregan dos columnas: cuándo se mandó y a qué correo. La segunda no es un
-- lujo: los correos de los proveedores cambian, y saber a cuál se escribió el
-- día que nadie responde ahorra la discusión de si se mandó o no.
--
-- SOBRE EL ENVÍO EN SÍ. La plataforma es un export estático: no hay servidor
-- que pueda mandar un correo por su cuenta. Hoy el botón arma el correo con
-- todo adentro —destinatario, asunto y el detalle de los ítems— y lo abre en el
-- cliente de quien está trabajando, que es de donde ya salen estos correos. El
-- envío automático desde una casilla de la empresa necesita una Edge Function y
-- un dominio verificado; cuando exista, escribe estas mismas dos columnas y
-- nada más cambia.
-- ============================================================================

alter table public.cotizaciones
  add column if not exists enviada_en timestamptz;

alter table public.cotizaciones
  add column if not exists enviada_a text;

comment on column public.cotizaciones.enviada_en is
  'Cuándo se le mandó al proveedor. Distinto de `solicitada_en`, que es cuándo se creó.';
comment on column public.cotizaciones.enviada_a is
  'A qué correo se mandó. Los correos de los proveedores cambian; este es el que se usó ese día.';

/* Las que ya existen se dan por enviadas el día que se crearon: es lo que pasó
   en la práctica —se creaban y se mandaban a mano en el momento— y dejarlas en
   nulo las mostraría como "sin enviar" para siempre. */
update public.cotizaciones
set enviada_en = solicitada_en::timestamptz
where enviada_en is null
  and estado <> 'solicitada';

-- ─── La vista, con lo nuevo al final ────────────────────────────────────────
--
-- `create or replace` y NO `drop` + `create`: `expediente_solped` cuelga de
-- esta vista, y tirarla obligaría a rehacer también aquella. Postgres permite
-- reemplazar una vista mientras las columnas que ya existen conserven nombre,
-- tipo y posición, y lo nuevo se agregue AL FINAL. Por eso las cinco columnas
-- nuevas van abajo aunque leídas de corrido quedarían mejor arriba: el orden
-- prolijo no vale una migración que se cae al aplicarse.

create or replace view public.comparativo_cotizaciones
with (security_invoker = true) as
  select
    c.id,
    c.solped_id,
    c.proveedor_id,
    p.razon_social as proveedor,
    c.numero,
    c.solicitada_en,
    c.recibida_en,
    /* El tiempo de respuesta se cuenta desde que se MANDÓ, no desde que se
       creó: el rato que la solicitud estuvo hecha y sin enviar no es demora del
       proveedor. Si no consta el envío, se cae a la fecha de creación. */
    (c.recibida_en - coalesce(c.enviada_en::date, c.solicitada_en))::int as dias_respuesta,
    c.validez_hasta,
    c.plazo_entrega_dias,
    c.condicion_pago,
    c.estado,
    c.seleccionada,
    c.motivo_seleccion,
    coalesce(sum(ci.neto), 0)::bigint as items_neto,
    c.descuento,
    c.flete,
    /* Lo único que sirve para decidir: lo que cuesta tenerlo en obra. */
    (coalesce(sum(ci.neto), 0) - c.descuento + c.flete)::bigint as costo_puesto,
    count(ci.id)::int as items_cotizados,
    count(ci.id) filter (where not ci.disponible)::int as items_sin_stock,

    -- Lo nuevo, al final por lo dicho arriba.
    /* El correo al que se le escribe, de la ficha del proveedor: así la
       pantalla no tiene que ir a buscarlo aparte al momento de mandar. */
    coalesce(nullif(btrim(p.correo), ''), nullif(btrim(p.correo_pago), '')) as correo_proveedor,
    p.contacto as contacto_proveedor,
    c.enviada_en,
    c.enviada_a,
    c.observaciones
  from public.cotizaciones c
  join public.proveedores p on p.id = c.proveedor_id
  left join public.cotizacion_items ci on ci.cotizacion_id = c.id
  group by c.id, p.razon_social, p.correo, p.correo_pago, p.contacto;

comment on view public.comparativo_cotizaciones is
  'Las cotizaciones de una solicitud, comparables por costo puesto en obra, con el correo del proveedor y cuándo se le mandó.';

grant select on public.comparativo_cotizaciones to authenticated;

notify pgrst, 'reload schema';
