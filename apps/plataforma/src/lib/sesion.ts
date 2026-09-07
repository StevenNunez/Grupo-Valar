"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Sesión de la Plataforma Valar, sobre Supabase Auth.
 *
 * El guard visual de `Shell.tsx` sigue siendo comodidad —evita mostrar un
 * panel vacío a quien no entró—, pero ya no es lo que protege los datos: el
 * muro son las políticas RLS. Aunque alguien se salte la pantalla, Postgres no
 * le devuelve una sola fila sin sesión válida.
 */

export type Rol = "lectura" | "gestion" | "admin";

export type Usuario = {
  id: string;
  correo: string;
  nombre: string;
  cargo: string;
  rol: Rol;
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
  const { data, error } = await supabase
    .from("perfiles")
    .select("nombre, cargo, rol")
    .eq("id", id)
    .maybeSingle();

  // Un fallo acá no debe dejar a nadie fuera: el trigger que crea el perfil
  // puede ir un instante atrasado respecto del primer login.
  if (error) console.warn("No se pudo leer el perfil:", error.message);

  const nombre = data?.nombre?.trim() || correo.split("@")[0];

  return {
    id,
    correo,
    nombre,
    cargo: data?.cargo?.trim() || "Sin cargo asignado",
    rol: (data?.rol as Rol) ?? "lectura",
    iniciales: iniciales(nombre, correo),
  };
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
