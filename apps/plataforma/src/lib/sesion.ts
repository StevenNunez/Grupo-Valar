"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { olvidarConsultas } from "./consulta";
import { supabase } from "./supabase";

/**
 * Sesión de la Plataforma Valar, sobre Supabase Auth.
 *
 * El guard visual (`Guardia.tsx`) es comodidad —evita mostrar un panel vacío a
 * quien no entró—, pero no es lo que protege los datos: el muro son las
 * políticas RLS. Aunque alguien se salte la pantalla, Postgres no le devuelve
 * una sola fila sin sesión válida.
 */

/**
 * Qué puede hacer la persona: desde la 0042 sale del ACCESO, no del cargo.
 *
 *   general   "administrador" = todo en todos los módulos; "soporte" = lo
 *             mismo y además cruza empresas. Nulo = lo de sus accesos.
 *   accesos   por módulo, su nivel (administrador, usuario, visualizador,
 *             personalizado)
 *   permisos  lo que le contesta `mis_permisos()`, ya resuelto
 *
 * Todo esto sirve para ESCONDER lo que no corresponde. Quien decide de verdad
 * es el RLS: si la pantalla se equivoca, la base dice que no igual.
 */
export type Nivel = "administrador" | "usuario" | "visualizador" | "personalizado";

export type Usuario = {
  id: string;
  correo: string;
  nombre: string;
  cargo: string;
  /** El cargo del catálogo (`roles`). Es un título: no da permisos. */
  rol: string;
  general: "administrador" | "soporte" | null;
  accesos: Record<string, Nivel>;
  permisos: Set<string>;
  /**
   * La empresa a la que pertenece. Es la que se le pone a todo lo que cree.
   *
   * Hace falta tenerla a mano porque el rol `soporte` VE varias empresas: una
   * consulta sin filtro que antes devolvía una fila ahora puede devolver una
   * por empresa, y las que esperan exactamente una se caen. Ver la 0030.
   */
  empresa: string | null;
  /** Iniciales para el avatar del encabezado. */
  iniciales: string;
};

export type EstadoSesion =
  | { estado: "cargando" }
  | { estado: "sin-sesion" }
  | { estado: "con-sesion"; usuario: Usuario };

/** "Francisco Valdés" → "FV"; "demo" → "DE". */
function iniciales(nombre: string, correo: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  const base = partes[0] ?? correo;
  return base.slice(0, 2).toUpperCase();
}

/** Trae el perfil del usuario. Si aún no existe, arma uno mínimo con el correo. */
async function cargarUsuario(id: string, correo: string): Promise<Usuario> {
  const [perfil, accesos, permisos] = await Promise.all([
    supabase
      .from("perfiles")
      .select("nombre, cargo, rol, empresa_id, acceso_general")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("accesos").select("modulo_id, nivel").eq("usuario_id", id),
    supabase.rpc("mis_permisos"),
  ]);

  // Un fallo acá no debe dejar a nadie fuera: el trigger que crea el perfil
  // puede ir un instante atrasado respecto del primer login. Sin accesos,
  // la persona ve la plataforma vacía, que es lo seguro.
  for (const r of [perfil, accesos, permisos]) {
    if (r.error) console.warn("No se pudo leer el acceso:", r.error.message);
  }

  const data = perfil.data as {
    nombre?: string;
    cargo?: string;
    rol?: string;
    empresa_id?: string | null;
    acceso_general?: Usuario["general"];
  } | null;
  const nombre = data?.nombre?.trim() || correo.split("@")[0];

  return {
    id,
    correo,
    nombre,
    cargo: data?.cargo?.trim() || "Sin cargo asignado",
    rol: data?.rol ?? "lectura",
    general: data?.acceso_general ?? null,
    accesos: Object.fromEntries(
      ((accesos.data ?? []) as { modulo_id: string; nivel: Nivel }[]).map((a) => [a.modulo_id, a.nivel]),
    ),
    permisos: new Set(((permisos.data ?? []) as { permiso_id: string }[]).map((p) => p.permiso_id)),
    empresa: data?.empresa_id ?? null,
    iniciales: iniciales(nombre, correo),
  };
}

/* ── Qué puede, para la pantalla ──────────────────────────────────────────── */

/** Tiene ese permiso (en el módulo que sea). */
export function puede(usuario: Usuario, permiso: string) {
  return usuario.general !== null || usuario.permisos.has(permiso);
}

/** Entra a ese módulo, con el nivel que sea. */
export function entraA(usuario: Usuario, modulo: string) {
  return usuario.general !== null || modulo in usuario.accesos;
}

/** Administra la gente de ese módulo (o de todos). */
export function administra(usuario: Usuario, modulo: string) {
  return usuario.general !== null || usuario.accesos[modulo] === "administrador";
}

/** Administra gente de algún módulo: ve la pantalla de usuarios. */
export function administraAlgo(usuario: Usuario) {
  return usuario.general !== null || Object.values(usuario.accesos).includes("administrador");
}

/**
 * La empresa de quien está mirando, preguntándosela a la base.
 *
 * Es la misma `empresa_actual()` que usa el RLS, así que no hay forma de que
 * la aplicación y las políticas discrepen. Se usa donde una consulta espera
 * UNA fila y el rol `soporte` haría que llegaran varias.
 */
export async function empresaActual(): Promise<string | null> {
  const { data, error } = await supabase.rpc("empresa_actual");
  if (error) {
    console.warn("No se pudo resolver la empresa:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Estado de sesión, sincronizado con Supabase.
 *
 * `onAuthStateChange` dispara de inmediato con la sesión guardada, así que no
 * hace falta un `getSession()` aparte: el primer render dice "cargando" y el
 * siguiente ya trae la respuesta.
 */
export function useSesion(): EstadoSesion {
  const [estado, setEstado] = useState<EstadoSesion>({ estado: "cargando" });

  useEffect(() => {
    let vigente = true;

    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (!sesion?.user) {
        // Lo que vio esta sesión no puede abrirle la pantalla a la siguiente.
        olvidarConsultas();
        if (vigente) setEstado({ estado: "sin-sesion" });
        return;
      }

      const { id, email } = sesion.user;
      cargarUsuario(id, email ?? "").then((usuario) => {
        if (vigente) setEstado({ estado: "con-sesion", usuario });
      });
    });

    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return estado;
}

/** Traduce los errores de Supabase Auth a algo que se pueda leer en pantalla. */
export function mensajeDeError(mensaje: string) {
  if (/invalid login credentials/i.test(mensaje)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/email not confirmed/i.test(mensaje)) {
    return "La cuenta todavía no está confirmada. Escríbenos y la activamos.";
  }
  if (/too many requests|rate limit/i.test(mensaje)) {
    return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  }
  if (/failed to fetch|network/i.test(mensaje)) {
    return "No se pudo conectar. Revisa tu conexión y vuelve a intentar.";
  }
  return "No se pudo iniciar sesión. Intenta de nuevo en un momento.";
}

/* ── Usuario disponible en todo el panel ──────────────────────────────────────
   El guard (`Guardia.tsx`) resuelve la sesión una sola vez y la reparte por
   contexto. Así los marcos —el simple de /modulos/ y el del módulo con barra
   lateral— no repiten la consulta del perfil. */

const ContextoUsuario = createContext<Usuario | null>(null);

export const ProveedorUsuario = ContextoUsuario.Provider;

/** Solo se puede llamar dentro del guard, que garantiza que hay sesión. */
export function useUsuario(): Usuario {
  const usuario = useContext(ContextoUsuario);
  if (!usuario) {
    throw new Error("useUsuario() se usó fuera de <Guardia>, que es quien lo provee.");
  }
  return usuario;
}

/** Atajo para los botones: `usePuede("gestion.editar")`. */
export function usePuede(permiso: string): boolean {
  return puede(useUsuario(), permiso);
}
