"use client";

import { supabase } from "./supabase";
import type { Nivel } from "./sesion";

/**
 * Usuarios, cargos y accesos (ver la migración 0042).
 *
 * LA IDEA DE FONDO: el CARGO dice quién es la persona y el ACCESO dice qué
 * puede hacer, módulo por módulo:
 *
 *   administrador  todo en el módulo, e invita gente a ese módulo
 *   usuario        ingresa datos: lo que trae el nivel + switches extra
 *   visualizador   solo mira, y solo las secciones que se le prendan
 *   personalizado  parte de cero, switch por switch
 *
 * Y por encima, el Administrador general (todo, en todos los módulos) y
 * Soporte (lo mismo, en todas las empresas).
 *
 * Lo que manda al final es la base: `tiene_permiso()`, `puede()` y las
 * políticas de cada tabla. La pantalla esconde lo que no corresponde; la base
 * dice que no aunque la pantalla se equivoque.
 */

export type { Nivel };
export type General = "administrador" | "soporte" | null;

export const niveles: { id: Nivel; titulo: string; nota: string }[] = [
  { id: "administrador", titulo: "Administrador", nota: "Todo en el módulo, e invita gente a él." },
  { id: "usuario", titulo: "Usuario", nota: "Ingresa datos. Se le pueden sumar permisos." },
  { id: "visualizador", titulo: "Visualizador", nota: "Solo mira, y solo lo que le prendas." },
  { id: "personalizado", titulo: "Personalizado", nota: "Parte de cero: eliges permiso por permiso." },
];

export const tituloNivel = (n: Nivel) => niveles.find((x) => x.id === n)?.titulo ?? n;

function traducir(mensaje: string) {
  if (/row-level security|permission denied|42501/i.test(mensaje)) {
    return "Tu acceso no permite este cambio. Solo se administra la gente de los módulos que administras.";
  }
  if (/duplicate key|already exists/i.test(mensaje)) {
    return "Ya existe uno con ese nombre.";
  }
  return mensaje;
}

/* ── Catálogos ────────────────────────────────────────────────────────────── */

export type Modulo = { id: string; titulo: string };

export async function cargarModulos(): Promise<Modulo[]> {
  const { data, error } = await supabase.from("modulos").select("id, titulo").order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Modulo[];
}

export type Permiso = {
  id: string;
  titulo: string;
  descripcion: string | null;
  moduloId: string | null;
  lectura: boolean;
  orden: number;
};

export async function cargarPermisos(): Promise<Permiso[]> {
  const { data, error } = await supabase
    .from("permisos")
    .select("id, titulo, descripcion, modulo_id, lectura, orden")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    titulo: p.titulo,
    descripcion: p.descripcion,
    moduloId: p.modulo_id,
    lectura: p.lectura,
    orden: p.orden,
  }));
}

/** Lo que trae cada nivel de fábrica, como claves "nivel|permiso". */
export async function cargarNivelPermisos(): Promise<Set<string>> {
  const { data, error } = await supabase.from("nivel_permisos").select("nivel, permiso_id");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((f) => `${f.nivel}|${f.permiso_id}`));
}

/** Mueve un ✅ de la matriz. Solo el Administrador general. */
export async function cambiarNivelPermiso(nivel: "usuario" | "visualizador", permisoId: string, incluir: boolean) {
  const { error } = incluir
    ? await supabase
        .from("nivel_permisos")
        .upsert({ nivel, permiso_id: permisoId }, { onConflict: "nivel,permiso_id" })
    : await supabase.from("nivel_permisos").delete().eq("nivel", nivel).eq("permiso_id", permisoId);
  if (error) throw new Error(traducir(error.message));
}

/* ── Cargos (son títulos: no dan permisos) ────────────────────────────────── */

export type Cargo = {
  id: string;
  titulo: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
};

export async function cargarCargos(): Promise<Cargo[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("id, titulo, descripcion, orden, activo")
    .order("orden")
    .order("titulo");
  if (error) throw new Error(error.message);
  return (data ?? []) as Cargo[];
}

/** "Jefe de Bodega" → "jefe_de_bodega". El id no se ve en pantalla. */
function idDeCargo(titulo: string) {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function guardarCargo(cargo: {
  id?: string;
  titulo: string;
  descripcion: string;
  activo: boolean;
}) {
  const titulo = cargo.titulo.trim();
  if (!titulo) throw new Error("El cargo necesita un nombre.");
  const fila = { titulo, descripcion: cargo.descripcion.trim() || null, activo: cargo.activo };

  const { error } = cargo.id
    ? await supabase.from("roles").update(fila).eq("id", cargo.id)
    : await supabase.from("roles").insert({ ...fila, id: idDeCargo(titulo) || `cargo_${Date.now()}`, orden: 60 });
  if (error) throw new Error(traducir(error.message));
}

/* ── Personas ─────────────────────────────────────────────────────────────── */

export type Persona = {
  id: string;
  nombre: string;
  cargo: string;
  rol: string;
  general: General;
  creadoEn: string;
};

export async function cargarPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, cargo, rol, acceso_general, creado_en")
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cargo: p.cargo,
    rol: p.rol,
    general: p.acceso_general,
    creadoEn: p.creado_en,
  }));
}

/** El cargo de una persona. El texto del cargo lo copia la base desde el catálogo. */
export async function cambiarCargo(usuarioId: string, rol: string) {
  const { error } = await supabase.from("perfiles").update({ rol }).eq("id", usuarioId);
  if (error) throw new Error(traducir(error.message));
}

/** Nombrar o quitar Administrador general / Soporte. */
export async function cambiarGeneral(usuarioId: string, general: General) {
  const { error } = await supabase
    .from("perfiles")
    .update({ acceso_general: general })
    .eq("id", usuarioId);
  if (error) {
    if (/Soporte/i.test(error.message)) throw new Error("Solo Soporte puede dar o quitar el acceso de Soporte.");
    throw new Error(traducir(error.message));
  }
}

/* ── Accesos ──────────────────────────────────────────────────────────────── */

export type Acceso = {
  usuarioId: string;
  moduloId: string;
  nivel: Nivel;
  /** Los switches de la persona en ese módulo. */
  permisos: string[];
  /** `null` = todos los contratos. */
  contratos: string[] | null;
};

/**
 * Los accesos que el que mira puede ver: los suyos y los de los módulos que
 * administra. El RLS hace el recorte, no esta consulta.
 */
export async function cargarAccesos(): Promise<Acceso[]> {
  const [accesos, permisos, contratos] = await Promise.all([
    supabase.from("accesos").select("usuario_id, modulo_id, nivel, todos_los_contratos"),
    supabase.from("acceso_permisos").select("usuario_id, modulo_id, permiso_id"),
    supabase.from("acceso_contratos").select("usuario_id, modulo_id, contrato_id"),
  ]);
  for (const r of [accesos, permisos, contratos]) if (r.error) throw new Error(r.error.message);

  const clave = (u: string, m: string) => `${u}|${m}`;
  const switches = new Map<string, string[]>();
  for (const p of permisos.data ?? []) {
    const k = clave(p.usuario_id, p.modulo_id);
    switches.set(k, [...(switches.get(k) ?? []), p.permiso_id]);
  }
  const suyos = new Map<string, string[]>();
  for (const c of contratos.data ?? []) {
    const k = clave(c.usuario_id, c.modulo_id);
    suyos.set(k, [...(suyos.get(k) ?? []), c.contrato_id]);
  }

  return (accesos.data ?? []).map((a) => {
    const k = clave(a.usuario_id, a.modulo_id);
    return {
      usuarioId: a.usuario_id,
      moduloId: a.modulo_id,
      nivel: a.nivel,
      permisos: switches.get(k) ?? [],
      contratos: a.todos_los_contratos ? null : (suyos.get(k) ?? []),
    };
  });
}

/** Nivel, switches y contratos de una vez (`guardar_acceso`, una transacción). */
export async function guardarAcceso(a: Acceso) {
  const { error } = await supabase.rpc("guardar_acceso", {
    persona: a.usuarioId,
    modulo: a.moduloId,
    nivel_nuevo: a.nivel,
    permisos: a.nivel === "administrador" ? [] : a.permisos,
    contratos: a.contratos,
  });
  if (error) {
    if (/Visualizador/.test(error.message)) throw new Error(error.message);
    if (/al menos un contrato/.test(error.message)) throw new Error(error.message);
    throw new Error(traducir(error.message));
  }
}

export async function quitarAcceso(usuarioId: string, moduloId: string) {
  const { error } = await supabase
    .from("accesos")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("modulo_id", moduloId);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Lo que la persona puede de verdad en un módulo, resuelto como lo resuelve
 * `tiene_permiso()`. Para mostrar "quién ve qué" sin preguntarle a la base
 * persona por persona.
 */
export function efectivos(
  acceso: Acceso,
  permisos: Permiso[],
  nivelPermisos: Set<string>,
): Permiso[] {
  const delModulo = permisos.filter((p) => p.moduloId === acceso.moduloId);
  if (acceso.nivel === "administrador") return delModulo;
  return delModulo.filter(
    (p) => nivelPermisos.has(`${acceso.nivel}|${p.id}`) || acceso.permisos.includes(p.id),
  );
}

/* ── Invitaciones ─────────────────────────────────────────────────────────── */

export type EstadoInvitacion = "enviada" | "aceptada" | "expirada" | "cancelada";

export type Invitacion = {
  id: string;
  correo: string;
  rol: string;
  nombre: string | null;
  estado: EstadoInvitacion;
  enviadaEn: string;
  venceEn: string;
  /** Lo que se le dio al invitar, como constancia. */
  accesos: { modulo?: string; nivel?: Nivel; general?: General }[];
};

export async function cargarInvitaciones(): Promise<Invitacion[]> {
  // Las vencidas se marcan solas: la pantalla no puede mostrar como viva una
  // invitación que ya no sirve.
  await supabase.rpc("caducar_invitaciones");

  const { data, error } = await supabase
    .from("invitaciones")
    .select("id, correo, rol, nombre, estado, enviada_en, vence_en, accesos")
    .order("enviada_en", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    id: i.id,
    correo: i.correo,
    rol: i.rol,
    nombre: i.nombre,
    estado: i.estado,
    enviadaEn: i.enviada_en,
    venceEn: i.vence_en,
    accesos: Array.isArray(i.accesos) ? i.accesos : [],
  }));
}

export async function cancelarInvitacion(id: string) {
  const { error } = await supabase
    .from("invitaciones")
    .update({ estado: "cancelada" })
    .eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

export type AccesoInvitado = {
  modulo: string;
  nivel: Nivel;
  permisos: string[];
  /** `null` = todos los contratos. */
  contratos: string[] | null;
};

/**
 * Invita a alguien.
 *
 * Pasa por la Edge Function `correo` porque crear una cuenta necesita la clave
 * de servicio, y esa clave no puede estar en el navegador. La función revisa,
 * con la sesión de quien invita, que administre cada módulo que da y vea cada
 * contrato que da, antes de escribir nada.
 */
export async function invitar(datos: {
  correo: string;
  rol: string;
  nombre?: string;
  general: General;
  accesos: AccesoInvitado[];
}) {
  const { data: sesion } = await supabase.auth.getSession();
  if (!sesion.session) throw new Error("Se cerró la sesión. Vuelve a entrar.");

  const { data, error } = await supabase.functions.invoke("correo", {
    body: {
      accion: "invitar",
      ...datos,
      volverA: `${window.location.origin}/restablecer/`,
    },
  });

  if (error) {
    /* El motivo REAL viene en el cuerpo de la respuesta, no en `error.message`.
       Cuando la función contesta 403, 409 o 500, supabase-js arma un
       `FunctionsHttpError` cuyo mensaje es siempre el mismo texto genérico
       sobre un status no-2xx; el detalle queda en `error.context`, que es la
       Response.

       Esto costó una vuelta entera: la pantalla decía "puede que no esté
       desplegada" cuando la función estaba perfectamente desplegada y lo que
       contestaba era otra cosa. Un mensaje de error que apunta al lugar
       equivocado es peor que no tener mensaje. */
    const contexto = (error as { context?: Response }).context;
    let detalle = "";

    if (contexto && typeof contexto.json === "function") {
      try {
        detalle = String(((await contexto.json()) as { error?: string })?.error ?? "");
      } catch {
        // La respuesta no era JSON: nos quedamos con lo que haya.
      }
    }

    if (detalle) throw new Error(detalle);

    throw new Error(
      /Failed to send|FunctionsFetchError/i.test(error.message)
        ? "No se pudo contactar la función de correo. Revisa que esté desplegada."
        : error.message,
    );
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Manda la solicitud de cotización desde el correo de la empresa.
 *
 * Devuelve `false` cuando la función de correo no está disponible, para que la
 * pantalla pueda ofrecer el camino de siempre —abrir el cliente de correo— en
 * vez de dejar a alguien sin poder mandar nada.
 */
export async function enviarSolicitudPorCorreo(datos: {
  cotizacionId: string;
  para: string;
  asunto: string;
  texto: string;
}): Promise<boolean> {
  /* El proveedor tiene que contestarle a quien le pidió la cotización, no a la
     casilla desde la que sale el correo: el remitente es un detalle de la
     infraestructura y hoy ni siquiera es una casilla de la empresa. Sin esto,
     las cotizaciones llegan a un buzón que nadie de Valar mira. */
  const { data: sesion } = await supabase.auth.getSession();
  const responderA = sesion.session?.user.email ?? undefined;

  const { data, error } = await supabase.functions.invoke("correo", {
    body: { accion: "solicitud", ...datos, responderA },
  });

  if (error) return false;
  if (data?.error) throw new Error(data.error);
  return true;
}
