/**
 * Los correos que manda la plataforma: invitaciones y solicitudes de cotización.
 *
 * POR QUÉ ESTO EXISTE. La plataforma es un export estático servido por
 * Cloudflare: no tiene servidor propio. Mandar un correo necesita una
 * credencial, y una credencial en el navegador la lee cualquiera que abra las
 * herramientas de desarrollo. Esta función corre en Supabase, que es donde las
 * credenciales pueden estar guardadas de verdad.
 *
 * CÓMO SE DESPLIEGA
 *
 *   supabase login
 *   supabase link --project-ref <el-ref-del-proyecto>
 *   supabase secrets set SMTP_HOST=smtp.zoho.com SMTP_PORT=465 \
 *       SMTP_USUARIO=hola@teolabs.app \
 *       SMTP_CLAVE=<contraseña de aplicación de Zoho> \
 *       SMTP_REMITENTE="Valar SpA <hola@teolabs.app>"
 *   supabase functions deploy correo
 *
 * La contraseña es una **contraseña de aplicación** de Zoho, no la del correo:
 * se genera en Zoho → Seguridad → Contraseñas de aplicación. Si algún día se
 * filtra, se revoca esa y no la cuenta entera.
 *
 * EL REMITENTE ES PROVISORIO. Hoy sale desde `hola@teolabs.app` porque es la
 * casilla que hay configurada; Zoho solo deja mandar desde la cuenta que
 * autentica, así que el `from` no se puede disfrazar de otra. Por eso el
 * `replyTo` lleva el correo de quien pidió la cotización: así el proveedor le
 * contesta a la persona de Valar y no a un buzón ajeno. Cuando exista la
 * casilla de Valar, se cambian estos dos secretos y nada más.
 *
 * QUIÉN PUEDE LLAMARLA. Nadie por su cuenta: la función revisa el permiso del
 * usuario con `tiene_permiso()`, usando SU sesión y no la clave de servicio.
 * Que la función tenga poderes de administrador no significa que se los preste
 * a quien la llame.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!autorizacion) return responder({ error: "Falta la sesión." }, 401);

  /* Dos clientes a propósito.

     `comoUsuario` lleva el token de quien llama: con él se pregunta qué puede
     hacer, y la respuesta la da la base con sus propias reglas.

     `comoServicio` se salta RLS y solo se usa DESPUÉS de haber comprobado el
     permiso. Mezclarlos es como se construye una función que cualquiera puede
     usar para hacer cualquier cosa. */
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacion } },
  });
  const comoServicio = createClient(url, servicio, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sesion } = await comoUsuario.auth.getUser();
  if (!sesion?.user) return responder({ error: "Sesión inválida." }, 401);

  const puede = async (clave: string) => {
    const { data } = await comoUsuario.rpc("tiene_permiso", { clave });
    return data === true;
  };

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "El cuerpo no es JSON." }, 400);
  }

  const accion = String(cuerpo.accion ?? "");

  try {
    if (accion === "invitar") return await invitar();
    if (accion === "solicitud") return await solicitud();
    return responder({ error: `Acción desconocida: ${accion}` }, 400);
  } catch (e) {
    return responder({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  /* ── Invitar a alguien ──────────────────────────────────────────────────── */

  /* QUÉ PUEDE DAR QUIEN INVITA (ver la 0042):

       Administrador general   cualquier cosa, menos Soporte
       Soporte                 cualquier cosa
       administrador de un módulo
                               acceso a SU módulo, con cualquier nivel —también
                               otro administrador—, y solo contratos que él ve

     Todo se pregunta con la sesión de quien invita (`comoUsuario`), a las
     mismas funciones que usa el RLS. Si la pantalla se equivoca o la saltan,
     acá se frena igual. Y lo que después escribe la clave de servicio es
     exactamente lo que se comprobó, ni una fila más. */
  async function invitar() {
    const correo = String(cuerpo.correo ?? "").trim().toLowerCase();
    // `rol` es el CARGO: un título del catálogo, no da permisos.
    const rol = String(cuerpo.rol ?? "").trim();
    const nombre = String(cuerpo.nombre ?? "").trim();
    const general = cuerpo.general ? String(cuerpo.general) : null;
    const accesos = Array.isArray(cuerpo.accesos) ? (cuerpo.accesos as Record<string, unknown>[]) : [];

    if (!correo || !rol) return responder({ error: "Faltan el correo y el cargo." }, 400);
    if (!general && accesos.length === 0) {
      return responder({ error: "Elige al menos un módulo al que entre." }, 400);
    }

    const pregunta = async (fn: string, args: Record<string, unknown>) => {
      const { data } = await comoUsuario.rpc(fn, args);
      return data === true;
    };

    if (general) {
      if (general !== "administrador" && general !== "soporte") {
        return responder({ error: "Acceso general desconocido." }, 400);
      }
      if (!(await pregunta("es_admin_general", {}))) {
        return responder({ error: "Solo el Administrador general nombra administradores generales." }, 403);
      }
      if (general === "soporte" && !(await pregunta("cruza_empresas", {}))) {
        return responder({ error: "Solo Soporte puede dar acceso de Soporte." }, 403);
      }
    }

    // Se valida cada acceso y se arma lo que se va a escribir.
    type Acceso = { modulo: string; nivel: string; permisos: string[]; contratos: string[] | null };
    const limpios: Acceso[] = [];
    const niveles = ["administrador", "usuario", "visualizador", "personalizado"];

    for (const a of general ? [] : accesos) {
      const modulo = String(a.modulo ?? "");
      const nivel = String(a.nivel ?? "");
      const permisos = Array.isArray(a.permisos) ? a.permisos.map(String) : [];
      const contratos = Array.isArray(a.contratos) ? a.contratos.map(String) : null;

      if (!niveles.includes(nivel)) return responder({ error: `Nivel desconocido: ${nivel}` }, 400);
      if (!(await pregunta("administra_modulo", { modulo }))) {
        return responder({ error: "Solo puedes invitar a los módulos que administras." }, 403);
      }
      if (contratos === null) {
        if (!(await pregunta("ve_contrato", { modulo, contrato: null }))) {
          return responder({ error: "No puedes dar todos los contratos: tú no los ves todos." }, 403);
        }
      } else {
        if (contratos.length === 0) {
          return responder({ error: "Elige al menos un contrato, o todos." }, 400);
        }
        for (const contrato of contratos) {
          if (!(await pregunta("ve_contrato", { modulo, contrato }))) {
            return responder({ error: `No puedes dar el contrato ${contrato}: no lo ves.` }, 403);
          }
        }
      }
      limpios.push({ modulo, nivel, permisos: nivel === "administrador" ? [] : permisos, contratos });
    }

    // Los permisos tienen que ser del módulo; a un Visualizador, solo "ver".
    if (limpios.some((a) => a.permisos.length > 0)) {
      const { data: catalogo } = await comoServicio
        .from("permisos")
        .select("id, modulo_id, lectura");
      const porId = new Map((catalogo ?? []).map((p) => [p.id as string, p]));
      for (const a of limpios) {
        for (const id of a.permisos) {
          const p = porId.get(id);
          if (!p || p.modulo_id !== a.modulo) {
            return responder({ error: `El permiso ${id} no es de ese módulo.` }, 400);
          }
          if (a.nivel === "visualizador" && !p.lectura) {
            return responder({ error: "Un Visualizador solo puede tener permisos de “Ver”." }, 400);
          }
        }
      }
    }

    const { data: cargoValido } = await comoServicio
      .from("roles")
      .select("id")
      .eq("id", rol)
      .eq("activo", true)
      .maybeSingle();
    if (!cargoValido) return responder({ error: "Ese cargo no existe o está desactivado." }, 400);

    /* A QUÉ EMPRESA ENTRA. Se pregunta con la sesión de quien invita, no se
       recibe en el cuerpo: si viniera del navegador, cualquiera con permiso
       para invitar podría meter gente en otra empresa.

       Sin esto la invitación falla de dos formas a la vez. El perfil nace sin
       empresa, y `empresa_actual()` en nulo deja a esa persona sin ver ni
       poder crear nada —la plataforma en blanco—. Y el registro en
       `invitaciones` se escribe con la clave de servicio, donde `auth.uid()`
       es nulo: el `default empresa_actual()` da nulo y choca contra el NOT
       NULL, así que ni siquiera se alcanza a mandar el correo. */
    const { data: empresa } = await comoUsuario.rpc("empresa_actual");
    if (!empresa) {
      return responder(
        { error: "Tu cuenta no tiene empresa asignada, así que no puede invitar a nadie." },
        409,
      );
    }

    /* El correo lo manda Supabase Auth con el SMTP configurado en el proyecto,
       así el enlace de acceso lo genera y lo valida él. Reimplementar eso a
       mano es reimplementar la parte de autenticación que más cuesta acertar. */
    const { data, error } = await comoServicio.auth.admin.inviteUserByEmail(correo, {
      // `empresa` viaja en los metadatos porque el trigger que crea el perfil
      // corre sobre `auth.users` y es lo único que alcanza a ver. Ver la 0031.
      data: { nombre, rol, empresa },
      redirectTo: String(cuerpo.volverA ?? ""),
    });

    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        return responder(
          {
            error:
              "Ese correo ya tiene cuenta. Búscalo en la lista de personas y dale acceso desde ahí.",
          },
          409,
        );
      }
      return responder({ error: error.message }, 400);
    }

    const usuarioId = data.user?.id;
    if (!usuarioId) return responder({ error: "Supabase no devolvió la cuenta creada." }, 500);

    /* El perfil primero: los accesos cuelgan de él y toman su empresa. El
       cargo (texto) lo copia el trigger desde el catálogo. */
    const { error: falloPerfil } = await comoServicio.from("perfiles").upsert(
      { id: usuarioId, nombre: nombre || correo, rol, empresa_id: empresa, acceso_general: general },
      { onConflict: "id" },
    );
    if (falloPerfil) return responder({ error: falloPerfil.message }, 500);

    for (const a of limpios) {
      const comun = { usuario_id: usuarioId, modulo_id: a.modulo };
      const { error: e1 } = await comoServicio.from("accesos").upsert(
        {
          ...comun,
          empresa_id: empresa, // el trigger la vuelve a poner desde el perfil
          nivel: a.nivel,
          todos_los_contratos: a.contratos === null,
          otorgado_por: sesion!.user.id,
        },
        { onConflict: "usuario_id,modulo_id" },
      );
      if (e1) return responder({ error: e1.message }, 500);

      if (a.permisos.length > 0) {
        const { error: e2 } = await comoServicio.from("acceso_permisos").upsert(
          a.permisos.map((permiso_id) => ({ ...comun, permiso_id, otorgado_por: sesion!.user.id })),
          { onConflict: "usuario_id,permiso_id" },
        );
        if (e2) return responder({ error: e2.message }, 500);
      }
      if (a.contratos) {
        const { error: e3 } = await comoServicio.from("acceso_contratos").upsert(
          a.contratos.map((contrato_id) => ({ ...comun, empresa_id: empresa, contrato_id })),
          { onConflict: "usuario_id,modulo_id,contrato_id" },
        );
        if (e3) return responder({ error: e3.message }, 500);
      }
    }

    await comoServicio.from("invitaciones").insert({
      empresa_id: empresa,
      correo,
      rol,
      nombre: nombre || null,
      accesos: general ? [{ general }] : limpios,
      invitada_por: sesion!.user.id,
      estado: "enviada",
    });

    return responder({ ok: true, usuario: usuarioId });
  }

  /* ── Mandarle la solicitud de cotización a un proveedor ─────────────────── */

  async function solicitud() {
    if (!(await puede("cotizacion.gestionar"))) {
      return responder({ error: "No tienes permiso para enviar cotizaciones." }, 403);
    }

    const para = String(cuerpo.para ?? "").trim();
    const asunto = String(cuerpo.asunto ?? "").trim();
    const texto = String(cuerpo.texto ?? "");
    const cotizacionId = String(cuerpo.cotizacionId ?? "");

    if (!para || !asunto || !texto) {
      return responder({ error: "Faltan destinatario, asunto o mensaje." }, 400);
    }

    const host = Deno.env.get("SMTP_HOST");
    const usuario = Deno.env.get("SMTP_USUARIO");
    const clave = Deno.env.get("SMTP_CLAVE");
    const remitente = Deno.env.get("SMTP_REMITENTE") ?? usuario;

    if (!host || !usuario || !clave) {
      return responder(
        { error: "Falta configurar el SMTP: SMTP_HOST, SMTP_USUARIO y SMTP_CLAVE." },
        500,
      );
    }

    const cliente = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get("SMTP_PORT") ?? 465),
        tls: true,
        auth: { username: usuario, password: clave },
      },
    });

    try {
      await cliente.send({
        from: remitente!,
        to: para,
        // Quien recibe contesta al correo de la empresa, que es lo que se busca.
        replyTo: String(cuerpo.responderA ?? remitente!),
        subject: asunto,
        content: texto,
      });
    } finally {
      await cliente.close();
    }

    /* La constancia se escribe DESPUÉS de que el correo salió: marcarla antes
       dejaría como enviada una solicitud que se cayó en el camino. */
    /* Con la sesión de quien la mandó, no con la clave de servicio: los ids de
       cotización se repiten entre empresas, y la clave de servicio habría
       marcado la de todas. Así la marca respeta empresa y contratos. */
    if (cotizacionId) {
      await comoUsuario
        .from("cotizaciones")
        .update({ enviada_en: new Date().toISOString(), enviada_a: para })
        .eq("id", cotizacionId);
    }

    return responder({ ok: true });
  }
});
