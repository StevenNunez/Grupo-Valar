"use client";

import { useEffect, useState } from "react";
import { cargarEstadoUf, type EstadoUf } from "./dashboard";

/**
 * La UF de hoy, para mostrar en pesos lo que se pacta en UF.
 *
 * Es la misma serie que trae la base cada día (0011) y la misma con que
 * `contratos_resumen` pasa a pesos el monto de un contrato en UF (0061): lo
 * que se ve en el formulario cuadra con lo que después muestra el Dashboard.
 * Se pide una sola vez por pestaña y la comparten todos los que la usen.
 */

let pedido: Promise<EstadoUf | null> | null = null;

export function useUfHoy(): EstadoUf | null {
  const [uf, setUf] = useState<EstadoUf | null>(null);

  useEffect(() => {
    let vigente = true;
    pedido ??= cargarEstadoUf().then((r) => {
      // Si falló, que el próximo que la necesite vuelva a intentar.
      if (!r) pedido = null;
      return r;
    });
    pedido.then((r) => vigente && setUf(r));
    return () => {
      vigente = false;
    };
  }, []);

  return uf;
}

/** UF → pesos, redondeado al peso. */
export const ufAPesos = (uf: number, valorUf: number) => Math.round(uf * valorUf);

/**
 * Meses entre inicio y término, contando el término completo: del 01-06 al
 * 31-10 son 5 meses justos. Si no calza en meses enteros, da la fracción.
 */
export function mesesDePlazo(inicio: string, termino: string): number | null {
  if (!inicio || !termino) return null;
  const [y1, m1, d1] = inicio.split("-").map(Number);
  const fin = new Date(`${termino}T12:00:00`);
  fin.setDate(fin.getDate() + 1); // el día siguiente al término
  const y2 = fin.getFullYear(), m2 = fin.getMonth() + 1, d2 = fin.getDate();
  const enteros = (y2 - y1) * 12 + (m2 - m1);
  const meses = enteros + (d2 - d1) / 30;
  return meses > 0 ? Math.round(meses * 10) / 10 : null;
}
