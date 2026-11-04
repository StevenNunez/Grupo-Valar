"use client";

import { abrirPreferenciasDeCookies } from "./Cookies";

/** «Preferencias sobre cookies» del footer: abre el panel. */
export function EnlaceCookies({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={abrirPreferenciasDeCookies} className={className}>
      Preferencias sobre cookies
    </button>
  );
}
