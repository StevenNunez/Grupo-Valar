"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Una lista que se pide al servidor por partes.
 *
 * Abre con lo más reciente (`TAMANO_PAGINA` filas) y sigue con «Cargar más».
 * Los filtros, el buscador y el orden se resuelven en la base, así que encontrar
 * una orden de hace un año no obliga a bajar todas las demás. Cada cambio de
 * filtros vuelve a pedir desde el principio; una respuesta que llega tarde de un
 * filtro anterior se descarta.
 *
 * `filtroLocal` es para lo que la base no puede decidir (p. ej. «pagada», que sale
 * de otra tabla): se aplica sobre lo ya cargado y, si deja pocas filas, la lista
 * sigue pidiendo páginas sola hasta llenar la pantalla o agotarse.
 */

export const TAMANO_PAGINA = 50;

export function useListaServidor<T, F>({
  traer,
  filtros,
  filtroLocal,
}: {
  /** Pide `cuantos` filas desde la posición `desde`, con los filtros dados. */
  traer: (filtros: F, desde: number, cuantos: number) => Promise<T[]>;
  filtros: F;
  filtroLocal?: ((fila: T) => boolean) | null;
}) {
  /* Lo último que llegó, con la clave (filtros + recarga) con que se pidió. Si la
     clave actual es otra, se está pidiendo de nuevo: mientras tanto sigue a la
     vista lo anterior, sin parpadeo. */
  const [resultado, setResultado] = useState<{ clave: string; filas: T[]; hayMas: boolean; error: string | null } | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [version, setVersion] = useState(0);

  const solicitud = useRef(0);
  const traerRef = useRef(traer);
  const filtrosRef = useRef(filtros);
  traerRef.current = traer;
  filtrosRef.current = filtros;

  const clave = `${JSON.stringify(filtros)}|${version}`;
  const cargando = !resultado || resultado.clave !== clave;

  useEffect(() => {
    const id = ++solicitud.current;
    traerRef
      .current(filtrosRef.current, 0, TAMANO_PAGINA)
      .then((lote) => {
        if (id === solicitud.current) setResultado({ clave, filas: lote, hayMas: lote.length === TAMANO_PAGINA, error: null });
      })
      .catch((e: unknown) => {
        if (id === solicitud.current) {
          setResultado({ clave, filas: [], hayMas: false, error: e instanceof Error ? e.message : String(e) });
        }
      });
  }, [clave]);

  const filasCargadas = resultado?.filas;
  const cargarMas = useCallback(async () => {
    const id = solicitud.current;
    setCargandoMas(true);
    try {
      const lote = await traerRef.current(filtrosRef.current, filasCargadas?.length ?? 0, TAMANO_PAGINA);
      if (id !== solicitud.current) return;
      setResultado((r) => {
        if (!r) return r;
        const vistas = new Set(r.filas.map((f) => JSON.stringify(f)));
        return { ...r, filas: [...r.filas, ...lote.filter((f) => !vistas.has(JSON.stringify(f)))], hayMas: lote.length === TAMANO_PAGINA };
      });
    } catch (e) {
      if (id !== solicitud.current) return;
      setResultado((r) => (r ? { ...r, error: e instanceof Error ? e.message : String(e) } : r));
    } finally {
      setCargandoMas(false);
    }
  }, [filasCargadas]);

  const filas = useMemo(() => {
    const todas = resultado?.filas ?? [];
    return filtroLocal ? todas.filter(filtroLocal) : todas;
  }, [resultado, filtroLocal]);

  const hayMas = resultado?.hayMas ?? false;
  const error = resultado?.error ?? null;

  // Con un filtro que la base no resuelve, sigue pidiendo hasta tener con qué llenar la tabla.
  useEffect(() => {
    if (!filtroLocal || cargando || cargandoMas || error || !hayMas || filas.length >= TAMANO_PAGINA) return;
    const t = setTimeout(() => void cargarMas(), 0);
    return () => clearTimeout(t);
  }, [filtroLocal, cargando, cargandoMas, error, hayMas, filas.length, cargarMas]);

  return {
    filas,
    cargando,
    cargandoMas,
    hayMas,
    error,
    cargarMas: () => void cargarMas(),
    recargar: () => setVersion((v) => v + 1),
  };
}

/** El valor, pero solo cuando deja de cambiar por `ms`: para no consultar en cada tecla. */
export function useRetardado<T>(valor: T, ms = 350): T {
  const [retardado, setRetardado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetardado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retardado;
}
