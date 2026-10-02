-- ============================================================================
-- 0043 — Cada tabla pide SU permiso y respeta los contratos de cada persona
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
-- Va DESPUÉS de la 0042, que crea `puede()`, `ve_contrato()` y compañía.
--
-- LO QUE HABÍA, y por qué un Visualizador no existía todavía:
--
--   leer      `using (true)`: cualquiera con sesión leía TODO lo de su empresa.
--             Los permisos "Ver…" no los revisaba nadie.
--   escribir  `puede_editar()`: quien pudiera escribir algo, podía escribir en
--             cualquier tabla. Alguien de Abastecimiento podía cambiar un
--             Estado de Pago llamando directo a la API.
--
-- LO QUE QUEDA. Igual que en la 0030, NO SE REESCRIBE NADA: se AGREGAN
-- políticas `as restrictive`, que Postgres combina con AND contra las que ya
-- hay. Una por operación —leer, crear, cambiar, borrar— porque una
-- restrictiva `for all` también filtraría la lectura con la regla de
-- escritura.
--
-- LAS VISTAS NO CAMBIAN: son todas `security_invoker` (verificado en la 0030),
-- así que corren con estas reglas. El Dashboard de quien solo ve ingresos
-- muestra ingresos y no costos, sin una línea de código distinta.
--
-- DOS CRITERIOS QUE CONVIENE SABER:
--
-- 1. Los maestros (proveedores, artículos, categorías, el nombre del contrato)
--    los lee cualquiera que entre al módulo que los usa. Sin el nombre del
--    proveedor, una compra no se entiende. Qué PÁGINA se ve lo decide la
--    pantalla con "Ver proveedores", etc.
-- 2. En Abastecimiento, una solicitud la tocan quien la crea, quien la
--    aprueba, quien cotiza y quien emite la orden. Esas tablas piden "escribe
--    algo en Abastecimiento sobre ese contrato" (`escribe_en`), no una acción
--    puntual. La acción puntual la siguen cuidando las firmas (`puede_aprobar`)
--    y la pantalla. Lo que sí queda cerrado: nadie de fuera del módulo, ni de
--    fuera de sus contratos, escribe ahí.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select * from (values
      /* tabla, quién lee, quién escribe (crea, cambia y borra) */

      -- ── Contratos y lo que cuelga de su definición ──
      ('contratos',
       $q$public.ve_contrato('control-de-gestion', id) or public.ve_contrato('abastecimiento', id)$q$,
       $q$public.puede('contratos.editar', id)$q$),
      ('anexos',
       $q$public.ve_contrato('control-de-gestion', contrato_id) or public.ve_contrato('abastecimiento', contrato_id)$q$,
       $q$public.puede('contratos.editar', contrato_id)$q$),
      ('campos_contrato',
       $q$public.ve_contrato('control-de-gestion', contrato_id) or public.ve_contrato('abastecimiento', contrato_id)$q$,
       $q$public.puede('contratos.editar', contrato_id)$q$),
      -- Abastecimiento también las lee: cada ítem de una solicitud lleva categoría.
      ('categorias_costo',
       $q$public.ve_contrato('control-de-gestion', contrato_id) or public.ve_contrato('abastecimiento', contrato_id)$q$,
       $q$public.puede('contratos.editar', contrato_id)$q$),

      -- ── Ingresos ──
      ('estados_pago',
       $q$public.puede('ingresos.ver', contrato_id)$q$,
       $q$public.puede('gestion.editar', contrato_id)$q$),
      ('ordenes_compra',
       $q$public.puede('ingresos.ver', contrato_id)$q$,
       $q$public.puede('gestion.editar', contrato_id)$q$),
      ('facturas',
       $q$public.puede('ingresos.ver', contrato_id)$q$,
       $q$public.puede('gestion.editar', contrato_id)$q$),

      -- ── Egresos ──
      ('servicios',
       $q$public.puede('egresos.ver', contrato_id)$q$,
       $q$public.puede('gestion.editar', contrato_id)$q$),
      ('costos_personal',
       $q$public.puede('personal.ver', contrato_id)$q$,
       $q$public.puede('personal.editar', contrato_id)$q$),
      /* Oficina central no es de ningún contrato: es una sección y punto. Si
         se le prende a alguien, la ve aunque esté limitado a un contrato. */
      ('egresos_oficina_central',
       $q$public.tiene_permiso('oficina_central.ver')$q$,
       $q$public.tiene_permiso('gestion.editar')$q$),

      /* Compras e ítems los comparten los dos módulos: son el egreso de
         Control de Gestión y la orden/el pago de Abastecimiento. */
      ('compras',
       $q$public.puede('egresos.ver', contrato_id) or public.puede('pagos.ver', contrato_id) or public.puede('ordenes.ver', contrato_id)$q$,
       $q$public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)$q$),
      ('items_compra',
       $q$public.puede('egresos.ver', contrato_id) or public.puede('ordenes.ver', contrato_id) or public.puede('solped.ver', contrato_id) or public.puede('pagos.ver', contrato_id)$q$,
       $q$public.puede('gestion.editar', contrato_id) or public.escribe_en('abastecimiento', contrato_id)$q$),

      -- ── Abastecimiento ──
      ('solped',
       $q$public.puede('solped.ver', contrato_id) or public.puede('ordenes.ver', contrato_id)$q$,
       $q$public.escribe_en('abastecimiento', contrato_id)$q$),
      /* Sin contrato propio: se ven si se ve su solicitud. El `exists` corre
         con las reglas de quien mira, así que hereda las de `solped`. */
      ('solped_items',
       $q$exists (select 1 from public.solped s where s.empresa_id = solped_items.empresa_id and s.id = solped_items.solped_id)$q$,
       $q$exists (select 1 from public.solped s where s.empresa_id = solped_items.empresa_id and s.id = solped_items.solped_id and public.escribe_en('abastecimiento', s.contrato_id))$q$),
      ('cotizaciones',
       $q$exists (select 1 from public.solped s where s.empresa_id = cotizaciones.empresa_id and s.id = cotizaciones.solped_id)$q$,
       $q$exists (select 1 from public.solped s where s.empresa_id = cotizaciones.empresa_id and s.id = cotizaciones.solped_id and public.escribe_en('abastecimiento', s.contrato_id))$q$),
      ('cotizacion_items',
       $q$exists (select 1 from public.cotizaciones c where c.empresa_id = cotizacion_items.empresa_id and c.id = cotizacion_items.cotizacion_id)$q$,
       $q$exists (select 1 from public.cotizaciones c join public.solped s on s.empresa_id = c.empresa_id and s.id = c.solped_id where c.empresa_id = cotizacion_items.empresa_id and c.id = cotizacion_items.cotizacion_id and public.escribe_en('abastecimiento', s.contrato_id))$q$),
      ('ordenes_compra_proveedor',
       $q$public.puede('ordenes.ver', contrato_id) or public.puede('pagos.ver', contrato_id) or public.puede('solped.ver', contrato_id) or public.puede('egresos.ver', contrato_id)$q$,
       $q$public.escribe_en('abastecimiento', contrato_id)$q$),

      -- ── Maestros ──
      /* Control de Gestión también crea proveedores: el formulario de compra
         deja darlos de alta sin salir. */
      ('proveedores',
       $q$public.entra_a('control-de-gestion') or public.entra_a('abastecimiento')$q$,
       $q$public.tiene_permiso('proveedores.editar') or public.tiene_permiso('gestion.editar')$q$),
      ('articulo_proveedor',
       $q$public.entra_a('abastecimiento')$q$,
       $q$public.tiene_permiso('articulos.editar') or public.tiene_permiso('proveedores.editar')$q$),
      ('articulos',
       $q$public.entra_a('abastecimiento')$q$,
       $q$public.tiene_permiso('articulos.editar')$q$),

      -- ── Lo que cuelga de cualquier registro: se ve si se ve el registro ──
      ('adjuntos',
       $q$public.ve_registro(tabla, registro_id)$q$,
       $q$public.ve_registro(tabla, registro_id)$q$),

      -- ── Parámetros ──
      ('seguridad',
       $q$public.entra_a('control-de-gestion')$q$,
       $q$public.tiene_permiso('gestion.editar')$q$),
      ('reglas_aprobacion',
       $q$public.entra_a('abastecimiento')$q$,
       $q$public.tiene_permiso('parametros.editar')$q$),
      ('parametros_pago',
       $q$public.entra_a('abastecimiento')$q$,
       $q$public.tiene_permiso('parametros.editar')$q$)
    ) as t(tabla, lee, escribe)
  loop
    execute format('drop policy if exists "acceso: lee" on public.%I', r.tabla);
    execute format(
      'create policy "acceso: lee" on public.%I as restrictive for select to authenticated using (%s)',
      r.tabla, r.lee);

    execute format('drop policy if exists "acceso: crea" on public.%I', r.tabla);
    execute format(
      'create policy "acceso: crea" on public.%I as restrictive for insert to authenticated with check (%s)',
      r.tabla, r.escribe);

    execute format('drop policy if exists "acceso: cambia" on public.%I', r.tabla);
    execute format(
      'create policy "acceso: cambia" on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      r.tabla, r.escribe, r.escribe);

    execute format('drop policy if exists "acceso: borra" on public.%I', r.tabla);
    execute format(
      'create policy "acceso: borra" on public.%I as restrictive for delete to authenticated using (%s)',
      r.tabla, r.escribe);
  end loop;
end;
$$;

-- ─── Parámetros: dejaban fuera al Gerente General ───────────────────────────
-- Preguntaban `rol_actual() = 'admin'`, un rol con nombre escrito en la
-- política. El Gerente General no podía cambiar el tope de pago. Ahora es el
-- permiso, que es solo del Administrador general.

drop policy if exists "reglas: cambia admin" on public.reglas_aprobacion;
drop policy if exists "reglas: cambia quien puede" on public.reglas_aprobacion;
create policy "reglas: cambia quien puede" on public.reglas_aprobacion
  for all to authenticated
  using (public.tiene_permiso('parametros.editar'))
  with check (public.tiene_permiso('parametros.editar'));

drop policy if exists "parametros_pago: cambia admin" on public.parametros_pago;
drop policy if exists "parametros_pago: cambia quien puede" on public.parametros_pago;
create policy "parametros_pago: cambia quien puede" on public.parametros_pago
  for all to authenticated
  using (public.tiene_permiso('parametros.editar'))
  with check (public.tiene_permiso('parametros.editar'));

-- ─── Firmas: se ven si se ve lo firmado ─────────────────────────────────────

drop policy if exists "acceso: lee" on public.aprobaciones;
create policy "acceso: lee" on public.aprobaciones
  as restrictive for select to authenticated
  using (public.ve_registro(
    case documento when 'solped' then 'solped' else 'ordenes_compra_proveedor' end,
    registro_id));

drop policy if exists "acceso: firma" on public.aprobaciones;
create policy "acceso: firma" on public.aprobaciones
  as restrictive for insert to authenticated
  with check (public.ve_registro(
    case documento when 'solped' then 'solped' else 'ordenes_compra_proveedor' end,
    registro_id));

-- ─── La bitácora ────────────────────────────────────────────────────────────
-- Completa, solo para el Administrador general. Los demás ven la historia de
-- lo que pueden ver: el "Historial" de cada ficha sigue funcionando.

drop policy if exists "acceso: lee" on public.auditoria;
create policy "acceso: lee" on public.auditoria
  as restrictive for select to authenticated
  using (public.tiene_permiso('auditoria.ver') or public.ve_registro(tabla, registro_id));

-- ─── Los archivos ───────────────────────────────────────────────────────────
-- Antes: cualquiera con sesión leía cualquier archivo del bucket, de
-- cualquier empresa, si conocía la ruta. Ahora se lee un archivo si se ve su
-- ficha en `adjuntos` —que a su vez exige ver el registro y la empresa—.
--
-- El caso del archivo SIN ficha. `lib/adjuntos.ts` borra la ficha primero y
-- el archivo después (a propósito: peor es una ficha que apunta a la nada), y
-- si la ficha no entra al subir, borra el archivo recién subido. En los dos
-- momentos el archivo no tiene ficha, y Storage exige poder LEERLO para
-- borrarlo. Sin esta salida, cada borrado dejaría el archivo huérfano para
-- siempre. Se permite entonces, solo para archivos sin ficha, mirar el
-- registro de la ruta (`tabla/registro/archivo`).

create or replace function public.archivo_sin_ficha(ruta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.adjuntos a where a.ruta = archivo_sin_ficha.ruta);
$$;

grant execute on function public.archivo_sin_ficha(text) to authenticated;

drop policy if exists "respaldos: lectura autenticada" on storage.objects;
drop policy if exists "respaldos: lectura de lo que se ve" on storage.objects;
create policy "respaldos: lectura de lo que se ve" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'respaldos'
    and (
      exists (select 1 from public.adjuntos a where a.ruta = storage.objects.name)
      or (
        public.puede_editar()
        and public.archivo_sin_ficha(storage.objects.name)
        and public.ve_registro(split_part(storage.objects.name, '/', 1),
                               split_part(storage.objects.name, '/', 2))
      )
    )
  );

notify pgrst, 'reload schema';
