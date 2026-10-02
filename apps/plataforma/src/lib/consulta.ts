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
};

export function useConsulta<T>(consultar: () => Promise<T>): Consulta<T> {
  const [estado, setEstado] = useState<EstadoConsulta<T>>({ estado: "cargando" });
  const [version, setVersion] = useState(0);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;

    consultar()
      .then((datos) => {
        if (vigente) setEstado({ estado: "listo", datos });
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        setEstado({
          estado: "error",
          mensaje: e instanceof Error ? e.message : String(e),
        });
      });

    return () => {
      vigente = false;
    };
    // `consultar` se define en el módulo y no cambia entre renders; lo que
    // dispara una recarga es `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { estado, recargar };
}
