"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Estado de una consulta a Supabase.
 *
 * Las tres vistas —cargando, error y listo— salen siempre en ese orden, así
 * ninguna pantalla del módulo tiene que inventarse su propio manejo.
 */
export type EstadoConsulta<T> =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; datos: T };

export type Consulta<T> = {
  estado: EstadoConsulta<T>;
  /** Vuelve a pedir los datos. Se llama después de crear, editar o borrar. */
  recargar: () => void;
  /** Se está mostrando lo guardado mientras llega lo nuevo. */
  actualizando: boolean;
};

/* ── Lo último que se vio, por pantalla ───────────────────────────────────────
   Una pantalla que se abre a cada rato no tiene por qué partir en blanco: se
   muestra lo último que se vio y se actualiza por detrás. Vive en memoria
   (navegar dentro de la plataforma) y en sessionStorage (recargar la pestaña),
   que se borra solo al cerrarla. La clave lleva usuario y empresa, y todo se
   olvida al cerrar sesión: nadie ve lo que vio otro. */

const memoria = new Map<string, unknown>();
const PREFIJO = "consulta:";

function leerGuardado<T>(clave: string): T | undefined {
  if (memoria.has(clave)) return memoria.get(clave) as T;
  try {
    const texto = sessionStorage.getItem(PREFIJO + clave);
    if (texto === null) return undefined;
    const datos = JSON.parse(texto) as T;
    memoria.set(clave, datos);
    return datos;
  } catch {
    return undefined;
  }
}

function guardar(clave: string, datos: unknown) {
  memoria.set(clave, datos);
  try {
    sessionStorage.setItem(PREFIJO + clave, JSON.stringify(datos));
  } catch {
    // Sin espacio o sin almacenamiento: queda en memoria, que es lo principal.
  }
}

/** Al cerrar sesión. */
export function olvidarConsultas() {
  memoria.clear();
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(PREFIJO)) sessionStorage.removeItem(k);
    }
  } catch {
    // Nada que borrar.
  }
}

/**
 * @param clave  Si viene, la pantalla abre con lo último que se vio y lo
 *               refresca sin volver a "cargando". Los datos tienen que ser
 *               JSON plano (nada de Set, Map ni Date).
 */
export function useConsulta<T>(consultar: () => Promise<T>, clave?: string): Consulta<T> {
  const [estado, setEstado] = useState<EstadoConsulta<T>>(() => {
    const guardado = clave ? leerGuardado<T>(clave) : undefined;
    return guardado === undefined ? { estado: "cargando" } : { estado: "listo", datos: guardado };
  });
  const [actualizando, setActualizando] = useState(estado.estado === "listo");
  const [version, setVersion] = useState(0);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;

    consultar()
      .then((datos) => {
        if (!vigente) return;
        if (clave) guardar(clave, datos);
        setEstado({ estado: "listo", datos });
        setActualizando(false);
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        const mensaje = e instanceof Error ? e.message : String(e);
        setActualizando(false);
        // Con algo en pantalla, un fallo al refrescar no lo borra.
        setEstado((actual) => {
          if (actual.estado === "listo") {
            console.warn("No se pudo actualizar:", mensaje);
            return actual;
          }
          return { estado: "error", mensaje };
        });
      });

    return () => {
      vigente = false;
    };
    // `consultar` se define en el módulo y no cambia entre renders; lo que
    // dispara una recarga es `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { estado, recargar, actualizando };
}
