-- ============================================================================
-- 0119 — Registro de errores de la plataforma
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0118.
--
-- POR QUÉ. Cuando algo fallaba —el envío de una OC, el webhook de Pagnol, una
-- pantalla que no cargaba— nadie se enteraba salvo que la persona avisara.
-- Ahora el servidor anota cada error acá (y lo deja en los registros de
-- Vercel), y la primera vez que aparece un error nuevo se manda un aviso a
-- Teo Labs.
--
-- UNA FILA POR ERROR, NO POR VEZ. La `huella` agrupa el mismo error (mismo
-- lugar y mismo mensaje, sin números ni identificadores): si una pantalla
-- falla cien veces se ve una fila con `veces = 100`, no cien filas, y el aviso
-- sale una sola vez. Si un error marcado como resuelto vuelve a aparecer, se
-- reabre y avisa de nuevo.
--
-- QUIÉN LA VE. Nadie desde la API: tiene RLS sin políticas, así que solo la
-- escribe el servidor (clave de servicio) y se lee en el panel de Supabase.
-- ============================================================================

create table if not exists public.errores (
  huella        text primary key,
  origen        text not null check (origen in ('navegador', 'servidor')),
  donde         text not null,
  mensaje       text not null,
  detalle       jsonb not null default '{}'::jsonb,
  usuario_id    uuid,
  empresa_id    text,
  veces         integer not null default 1,
  primera_vez   timestamptz not null default now(),
  ultima_vez    timestamptz not null default now(),
  resuelto      boolean not null default false
);

comment on table public.errores is
  'Errores de la plataforma, agrupados por huella (lugar + mensaje normalizado). Los escribe el servidor con la clave de servicio; se revisan en el panel de Supabase. Marcar resuelto = true al arreglar: si vuelve a pasar, se reabre.';

create index if not exists errores_recientes on public.errores (resuelto, ultima_vez desc);

alter table public.errores enable row level security;
-- Sin políticas a propósito: ni anónimos ni personas con sesión la leen o escriben.

/* Anota un error y dice si es nuevo (o si vuelve después de resuelto), para
   que el servidor avise solo esa vez. Una sola sentencia: dos fallos al mismo
   tiempo no duplican la fila. */
create or replace function public.registrar_error(
  p_huella text,
  p_origen text,
  p_donde text,
  p_mensaje text,
  p_detalle jsonb,
  p_usuario_id uuid,
  p_empresa_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  previo boolean;
begin
  select resuelto into previo from public.errores where huella = p_huella;

  insert into public.errores (huella, origen, donde, mensaje, detalle, usuario_id, empresa_id)
  values (p_huella, p_origen, left(p_donde, 300), left(p_mensaje, 2000), coalesce(p_detalle, '{}'::jsonb), p_usuario_id, p_empresa_id)
  on conflict (huella) do update
    set veces      = public.errores.veces + 1,
        ultima_vez = now(),
        detalle    = excluded.detalle,
        usuario_id = coalesce(excluded.usuario_id, public.errores.usuario_id),
        empresa_id = coalesce(excluded.empresa_id, public.errores.empresa_id),
        resuelto   = false;

  -- Nuevo si no existía, o si estaba resuelto y volvió.
  return previo is null or previo;
end;
$$;

revoke all on function public.registrar_error(text, text, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_error(text, text, text, text, jsonb, uuid, text) to service_role;

notify pgrst, 'reload schema';
