-- ============================================================================
-- 0118 — El detalle por equipo de un servicio se escribe con el mismo permiso
--        que el servicio
--
-- CÓMO SE APLICA: Supabase → SQL Editor del proyecto GRUPO VALAR → pegar
-- entero → Run. Idempotente. Va después de la 0117.
--
-- POR QUÉ. La 0071 creó `servicio_lineas` con una política base abierta
-- (`using (true) with check (true)`) y solo restringió la LECTURA por permiso.
-- Así, cualquiera con sesión en la empresa podía crear, cambiar o borrar las
-- líneas de un servicio aunque no pudiera editar egresos. Acá se le ponen las
-- mismas reglas de escritura que a `servicios` (0043): `gestion.editar` en el
-- contrato.
--
-- QUÉ NO CAMBIA. Quien ya edita servicios sigue guardando sus líneas igual: la
-- pantalla borra y vuelve a insertar el detalle con la misma sesión.
-- ============================================================================

drop policy if exists "acceso: crea" on public.servicio_lineas;
create policy "acceso: crea" on public.servicio_lineas
  as restrictive for insert to authenticated
  with check (public.puede('gestion.editar', contrato_id));

drop policy if exists "acceso: cambia" on public.servicio_lineas;
create policy "acceso: cambia" on public.servicio_lineas
  as restrictive for update to authenticated
  using (public.puede('gestion.editar', contrato_id))
  with check (public.puede('gestion.editar', contrato_id));

drop policy if exists "acceso: borra" on public.servicio_lineas;
create policy "acceso: borra" on public.servicio_lineas
  as restrictive for delete to authenticated
  using (public.puede('gestion.editar', contrato_id));

notify pgrst, 'reload schema';
