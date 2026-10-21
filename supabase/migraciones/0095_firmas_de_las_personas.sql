-- ============================================================================
-- 0095 — La firma de cada persona, para las órdenes de compra
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0094.
--
-- Cada persona dibuja su firma una vez en «Mi perfil». Al enviar una orden de
-- compra, el PDF lleva la firma de quien la emite (la persona que la envía) y,
-- en «Autorizado por», la de quien la empresa tiene designado para autorizar
-- (`empresas.autoriza_ordenes_usuario_id`, se elige en «Datos de la empresa»).
-- Sin firma cargada, la raya queda en blanco con el nombre, como hasta hoy.
-- Las solicitudes de cotización no llevan firma.
--
-- PRIVACIDAD. Una firma es una imagen que sirve para falsificar: solo su dueña
-- la lee y la cambia. Nadie más la ve desde la aplicación (ni el soporte); el
-- servidor la lee con la clave de servicio al armar el PDF de una orden de SU
-- empresa y nunca la devuelve suelta.
-- ============================================================================

create table if not exists public.firmas (
  usuario_id uuid primary key references public.perfiles (id) on delete cascade,
  empresa_id text not null default public.empresa_actual() references public.empresas (id),
  /* PNG con fondo transparente, como data URL. Una firma pesa decenas de KB:
     el tope evita que se suba otra cosa. */
  imagen text not null
    check (imagen like 'data:image/png;base64,%' and length(imagen) <= 400000),
  actualizada_en timestamptz not null default now()
);

comment on table public.firmas is
  'La firma dibujada de cada persona. Solo su dueña la lee; el servidor la usa para estampar las órdenes de compra.';

alter table public.firmas enable row level security;

drop policy if exists "firmas: la suya" on public.firmas;
create policy "firmas: la suya" on public.firmas for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

grant select, insert, update, delete on public.firmas to authenticated;

-- Quién autoriza las órdenes de compra de la empresa: su firma va en «Autorizado por».
alter table public.empresas
  add column if not exists autoriza_ordenes_usuario_id uuid references public.perfiles (id) on delete set null;

comment on column public.empresas.autoriza_ordenes_usuario_id is
  'La persona cuya firma va en «Autorizado por» de las órdenes de compra. Nulo = la raya queda en blanco.';

notify pgrst, 'reload schema';
