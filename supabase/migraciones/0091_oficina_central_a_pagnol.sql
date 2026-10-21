-- ============================================================================
-- 0091 — Los egresos de Oficina Central también se informan a Pagnol
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va después de la 0090.
--
-- Oficina Central tiene su pañol en Pagnol ("Oficina Central"). Una compra de la
-- casa matriz (EPP, herramientas, insumos, activos) entra igual que la de un
-- contrato: activo por unidad si es rastreable, ingreso de stock si no.
--
-- Un egreso de la oficina no pertenece a ningún contrato, así que el envío puede
-- no llevar `contrato_id` cuando lleva `egreso_oficina_id`. Se ve y se escribe
-- con las mismas reglas que el egreso (`egresos_oficina_central`).
-- ============================================================================

alter table public.pagnol_envios alter column contrato_id drop not null;

alter table public.pagnol_envios add column if not exists egreso_oficina_id uuid;
comment on column public.pagnol_envios.egreso_oficina_id is 'El egreso de Oficina Central del que salió (sin contrato).';

alter table public.pagnol_envios drop constraint if exists pagnol_envios_egreso_oficina_fkey;
alter table public.pagnol_envios
  add constraint pagnol_envios_egreso_oficina_fkey
  foreign key (empresa_id, egreso_oficina_id) references public.egresos_oficina_central (empresa_id, id)
  on delete set null (egreso_oficina_id);

create index if not exists pagnol_envios_oficina_idx
  on public.pagnol_envios (empresa_id, egreso_oficina_id) where egreso_oficina_id is not null;

-- Las mismas reglas que egresos_oficina_central (0043): ver con oficina_central.ver,
-- escribir con gestion.editar. Se suman a las de contrato (las políticas se combinan con "o").
drop policy if exists "oficina: lee envios a pagnol" on public.pagnol_envios;
create policy "oficina: lee envios a pagnol" on public.pagnol_envios for select to authenticated
  using (public.ve_empresa(empresa_id) and egreso_oficina_id is not null and public.tiene_permiso('oficina_central.ver'));

drop policy if exists "oficina: crea envios a pagnol" on public.pagnol_envios;
create policy "oficina: crea envios a pagnol" on public.pagnol_envios for insert to authenticated
  with check (empresa_id = public.empresa_actual() and egreso_oficina_id is not null and public.tiene_permiso('gestion.editar'));

drop policy if exists "oficina: cambia envios a pagnol" on public.pagnol_envios;
create policy "oficina: cambia envios a pagnol" on public.pagnol_envios for update to authenticated
  using (empresa_id = public.empresa_actual() and egreso_oficina_id is not null and public.tiene_permiso('gestion.editar'))
  with check (empresa_id = public.empresa_actual() and egreso_oficina_id is not null and public.tiene_permiso('gestion.editar'));

notify pgrst, 'reload schema';
