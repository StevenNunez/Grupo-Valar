"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useUsuario } from "./sesion";

/**
 * Los filtros y la vista de cada persona, recordados en su navegador.
 *
 * Al buscar otra cosa y volver, la pantalla queda como la dejó: período,
 * contrato, estatus, lo que haya elegido. Se guarda por usuario (la clave lleva
 * su id), así que en un equipo compartido cada cual ve sus propios filtros, y
 * sobrevive a cerrar la pestaña. No viaja a la base: es una comodidad de la
 * persona, no un dato del negocio.
 *
 * Se lee con `useSyncExternalStore`: la pantalla se prerenderiza sin navegador
 * y el servidor siempre ve el valor inicial, así no discrepa con el cliente.
 */
const PREFIJO = "vista:";
const EVENTO = "plataforma:vista";

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}

/* Respaldo en memoria: sin almacenamiento (modo privado) el filtro igual cambia. */
const memoria = new Map<string, string>();

function leerCrudo(llave: string): string | null {
  try {
    return localStorage.getItem(llave) ?? memoria.get(llave) ?? null;
  } catch {
    return memoria.get(llave) ?? null;
  }
}

export function useVistaGuardada<T extends object>(clave: string, inicial: T): [T, (cambio: Partial<T>) => void] {
  const usuario = useUsuario();
  const llave = `${PREFIJO}${usuario.id}:${clave}`;
  const crudo = useSyncExternalStore(suscribir, () => leerCrudo(llave), () => null);

  const valor = useMemo<T>(() => {
    if (!crudo) return inicial;
    try {
      return { ...inicial, ...(JSON.parse(crudo) as Partial<T>) };
    } catch {
      return inicial;
    }
    // `inicial` es un literal nuevo en cada render: lo que cuenta es lo guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crudo]);

  const cambiar = useCallback(
    (cambio: Partial<T>) => {
      let actual: Partial<T> = {};
      try {
        actual = JSON.parse(leerCrudo(llave) ?? "{}") as Partial<T>;
      } catch {
        /* Un valor guardado ilegible se pisa con el nuevo. */
      }
      const texto = JSON.stringify({ ...actual, ...cambio });
      memoria.set(llave, texto);
      try {
        localStorage.setItem(llave, texto);
      } catch {
        /* Sin almacenamiento queda solo en memoria: se pierde al recargar. */
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [llave],
  );

  return [valor, cambiar];
}

/** Como `useState`, pero el valor se recuerda para esta persona. */
export function useFiltro<T>(clave: string, inicial: T): [T, (valor: T) => void] {
  const [guardado, cambiar] = useVistaGuardada<{ v: T }>(clave, { v: inicial });
  const poner = useCallback((valor: T) => cambiar({ v: valor }), [cambiar]);
  return [guardado.v, poner];
}
