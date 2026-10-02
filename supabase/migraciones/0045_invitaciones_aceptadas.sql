-- ============================================================================
-- 0045 — Las invitaciones pasan solas a "aceptada"
--
-- CÓMO SE APLICA: Supabase → SQL Editor → pegar entero → Run. Idempotente.
--
-- EL PROBLEMA. Nada marcaba una invitación como aceptada. La persona entraba,
-- trabajaba, y en la pantalla su invitación seguía "enviada"; a los 7 días
-- pasaba a "expirada". Al administrador le decía exactamente lo contrario de
-- lo que pasó: que alguien que ya está adentro nunca llegó.
--
-- LA SOLUCIÓN. `caducar_invitaciones()` —la que la pantalla ya llama cada vez
-- que abre la lista— ahora primero marca como aceptadas las de quienes ya
-- iniciaron sesión, y recién después vence las que quedan. En ese orden: al
-- revés, una aceptada tarde se vencería antes de que se la reconociera.
--
-- Se mira `auth.users.last_sign_in_at` (por eso la función es SECURITY
-- DEFINER: la tabla de Auth no la lee nadie desde la app). El minuto de
-- tolerancia es porque la cuenta se crea un par de segundos ANTES de que se
-- escriba la invitación: Supabase crea la cuenta y recién ahí se anota.
-- ============================================================================

create or replace function public.caducar_invitaciones()
returns void
language sql
security definer
set search_path = public
as $$
  update public.invitaciones i
     set estado = 'aceptada',
         aceptada_en = u.last_sign_in_at,
         aceptada_por = u.id
    from auth.users u
   where lower(u.email) = lower(i.correo)
     and i.estado in ('enviada', 'expirada')
     and u.last_sign_in_at is not null
     and u.last_sign_in_at >= i.enviada_en - interval '1 minute';

  update public.invitaciones
     set estado = 'expirada'
   where estado = 'enviada'
     and vence_en < now();
$$;

comment on function public.caducar_invitaciones() is
  'Pone al día las invitaciones: aceptada si la persona ya entró, expirada si venció sin entrar.';

grant execute on function public.caducar_invitaciones() to authenticated;

-- Las que ya estaban esperando, de una vez.
select public.caducar_invitaciones();

notify pgrst, 'reload schema';
