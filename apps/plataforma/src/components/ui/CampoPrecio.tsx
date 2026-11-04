"use client";

import { useState } from "react";
import { formatearPrecio, numeroDeTexto } from "@/lib/formato";

/**
 * Un precio unitario que admite decimales ("663,87"). Mientras se escribe se
 * respeta lo tecleado (si no, la coma final desaparecería antes del primer
 * decimal); al salir del campo se muestra formateado.
 */
export function CampoPrecio({
  valor,
  alCambiar,
  disabled,
  className,
  ariaLabel,
}: {
  valor: number;
  alCambiar: (n: number) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder="0"
      value={texto ?? (valor === 0 ? "" : formatearPrecio(valor))}
      onChange={(e) => {
        setTexto(e.target.value);
        alCambiar(numeroDeTexto(e.target.value));
      }}
      onBlur={() => setTexto(null)}
      className={className}
    />
  );
}
