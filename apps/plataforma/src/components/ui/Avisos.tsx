"use client";

import { useEffect, useState } from "react";
import { EVENTO_AVISO } from "@/lib/avisos";

/** Confirmación visual de lo que se acaba de guardar. Se va sola a los 3 segundos. */
export function Avisos() {
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>;
    const alAvisar = (e: Event) => {
      clearTimeout(temporizador);
      setAviso({ id: Date.now(), texto: String((e as CustomEvent).detail) });
      temporizador = setTimeout(() => setAviso(null), 3000);
    };
    window.addEventListener(EVENTO_AVISO, alAvisar);
    return () => {
      clearTimeout(temporizador);
      window.removeEventListener(EVENTO_AVISO, alAvisar);
    };
  }, []);

  if (!aviso) return null;

  return (
    <div
      key={aviso.id}
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-xl"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.6">
        <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {aviso.texto}
    </div>
  );
}
