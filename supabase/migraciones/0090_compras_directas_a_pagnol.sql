-- ============================================================================
-- 0090 — Las compras directas también se informan a Pagnol
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0055 (pagnol_envios).
--
-- Una compra directa (sin OC) es mercadería que ya llegó: EPP, herramientas,
-- materiales. Igual que una recepción de OC, entra a Pagnol como activo por
-- unidad (rastreable) o como ingreso de stock (consumible).
--
-- Se informa en un paso aparte, no colgado de las líneas del documento: al
-- guardar una compra la base reemplaza todas sus líneas, y reenviar por línea
-- duplicaría stock y activos con cada edición. Cada envío lleva su propia
-- referencia (`valar:compra:<compra>:linea:<n>…`), así que reintentar no duplica.
-- ============================================================================

alter table public.pagnol_envios
  add column if not exists compra_id text,
  add column if not exists panol_id uuid,
  add column if not exists valor_unitario numeric(14, 2),
  add column if not exists fecha date,
  add column if not exists descripcion text;

comment on column public.pagnol_envios.compra_id is 'La compra directa de la que salió (nulo si vino de una recepción de OC).';
comment on column public.pagnol_envios.panol_id is 'Pañol de Pagnol donde entra (solo compras directas; en una recepción vive en recepciones.pagnol_panol_id).';

alter table public.pagnol_envios drop constraint if exists pagnol_envios_compra_fkey;
alter table public.pagnol_envios
  add constraint pagnol_envios_compra_fkey
  foreign key (empresa_id, compra_id) references public.compras (empresa_id, id) on delete set null (compra_id);

create index if not exists pagnol_envios_compra_idx on public.pagnol_envios (empresa_id, compra_id) where compra_id is not null;

notify pgrst, 'reload schema';
