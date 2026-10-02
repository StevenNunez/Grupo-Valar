# Correos de Plataforma Valar

Los asuntos están en `asuntos.json`; cada HTML del mismo nombre corresponde a
una plantilla de **Supabase → Authentication → Email Templates**. Todos usan
español, los colores de Valar y el logo público
`https://www.grupovalar.cl/logo-valar.png` (PNG para clientes de correo).

| Archivo | Plantilla de Supabase | Asunto |
| --- | --- | --- |
| `recovery.html` | Reset password | Valar \| Restablece tu contraseña |
| `invite.html` | Invite user | Valar \| Tu invitación a la plataforma |
| `confirmation.html` | Confirm sign up | Valar \| Confirma tu correo |
| `magic_link.html` | Magic link | Valar \| Tu enlace de acceso |
| `email_change.html` | Change email address | Valar \| Confirma tu nuevo correo |
| `reauthentication.html` | Reauthentication | Valar \| Código para verificar tu identidad |
| `password_changed_notification.html` | Password changed notification | Valar \| Se cambió tu contraseña |

En el Dashboard, abre cada tipo, pega **Subject** desde `asuntos.json` y
**Body** desde el HTML correspondiente, y guarda. `Password changed
notification` se enviará cuando la notificación de seguridad esté habilitada.
El script de publicación también la habilita.

Para aplicar o comprobar los siete pares de asunto y cuerpo de una vez, se
puede usar `scripts/publicar-plantillas-auth.mjs`. Requiere un
`SUPABASE_ACCESS_TOKEN` personal guardado en `.env.local` de la raíz (nunca en
el frontend ni en Git):

1. En [Supabase → Access Tokens](https://supabase.com/dashboard/account/tokens),
   crea un **scoped token** limitado al proyecto de Plataforma Valar.
2. Concede **Auth Config: Read-write** y **Project Settings: Read-write**.
   Ambos permisos son necesarios para actualizar la configuración de Auth.
3. Añade `SUPABASE_ACCESS_TOKEN=...` a `.env.local` en la raíz del repositorio.
   No compartas el valor en chats ni capturas. Al terminar se puede revocar el token.

```powershell
node --env-file=.env.local scripts/publicar-plantillas-auth.mjs --verificar
node --env-file=.env.local scripts/publicar-plantillas-auth.mjs --aplicar
```

El script modifica **solo asuntos, cuerpos y la activación del aviso de cambio
de contraseña**; conserva el SMTP y remitente que ya funcionan. Lee de vuelta
la configuración y verifica los 15 campos.

`{{ .ConfirmationURL }}` debe permanecer intacto en los correos con botón:
Supabase valida ese enlace antes de llevar a la persona a la plataforma. La
plantilla de verificación usa `{{ .Token }}`. El logo es una imagen remota, por
lo que algunos clientes pedirán permiso para mostrarla; el nombre VALAR
seguirá visible en texto.

Después de publicar, pide una recuperación de contraseña de una cuenta propia
y comprueba asunto, logo, botón, enlace y llegada a `/restablecer/`. Para la
invitación, prueba con una cuenta nueva cuando haga falta incorporar a alguien.
