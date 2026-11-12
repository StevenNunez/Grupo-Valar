"use client";

import { forwardRef, useRef, useState } from "react";

/**
 * El botón de la plataforma. Antes cada pantalla escribía el suyo (38 maneras
 * distintas del primario); ahora hay uno con cuatro caras:
 *
 *   primario    la acción principal de la pantalla (una por pantalla)
 *   secundario  cancelar, volver, acciones de apoyo
 *   peligro     eliminar, anular
 *   oscuro      acción destacada sobre fondo claro (p. ej. "Seguir editando")
 *   enlace      acción liviana dentro de un texto o una fila
 *
 * Y se bloquea solo: si `onClick` devuelve una promesa, el botón queda
 * deshabilitado y muestra el texto de `trabajando` hasta que termine. Así un
 * doble clic no guarda dos veces. Con `cargando` se controla desde afuera
 * (útil para el botón de envío de un formulario).
 *
 * El primario va en cyan-deep: blanco sobre el cyan de marca daba 2,85:1 de
 * contraste y no se leía; sobre cyan-deep es 4,74:1.
 */

export type Variante = "primario" | "secundario" | "peligro" | "oscuro" | "enlace";
export type Tamano = "normal" | "chico";

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTES: Record<Variante, string> = {
  primario: "rounded-full bg-cyan-deep text-white hover:bg-cyan-hondo",
  secundario: "rounded-full border border-mist-deep bg-white text-ink-soft hover:border-ink hover:text-ink",
  peligro: "rounded-full bg-peligro text-white hover:bg-peligro-fuerte",
  oscuro: "rounded-full bg-ink text-white hover:bg-ink/85",
  enlace: "rounded-md text-cyan-deep hover:underline underline-offset-2",
};

/* Alto mínimo de 44 px en el tamaño normal: es lo que pide un dedo en el teléfono. */
const TAMANOS: Record<Tamano, string> = {
  normal: "min-h-11 px-5 py-2.5 text-sm",
  chico: "min-h-9 px-4 py-1.5 text-xs",
};

export function claseDeBoton(variante: Variante = "primario", tamano: Tamano = "normal", extra = "") {
  const t = variante === "enlace" ? (tamano === "chico" ? "text-xs" : "text-sm") : TAMANOS[tamano];
  return `${BASE} ${VARIANTES[variante]} ${t} ${extra}`.trim();
}

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variante?: Variante;
  tamano?: Tamano;
  /** Bloquea el botón y muestra `trabajando` (controlado desde afuera). */
  cargando?: boolean;
  /** Texto mientras trabaja. Por defecto, el mismo texto con el indicador. */
  trabajando?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown;
};

export const Boton = forwardRef<HTMLButtonElement, Props>(function Boton(
  { variante = "primario", tamano = "normal", cargando, trabajando, className = "", type = "button", disabled, onClick, children, ...resto },
  ref,
) {
  const [enCurso, setEnCurso] = useState(false);
  // El estado tarda un render en llegar: el ref frena el segundo clic del doble clic.
  const ocupado = useRef(false);
  const activo = !!cargando || enCurso;

  async function alPulsar(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onClick || ocupado.current) return;
    const r = onClick(e);
    if (r && typeof (r as Promise<unknown>).then === "function") {
      ocupado.current = true;
      setEnCurso(true);
      try {
        await r;
      } catch {
        // El error lo muestra quien llamó; acá solo se libera el botón.
      } finally {
        ocupado.current = false;
        setEnCurso(false);
      }
    }
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || activo}
      aria-busy={activo || undefined}
      onClick={onClick ? alPulsar : undefined}
      className={claseDeBoton(variante, tamano, `${activo ? "cursor-wait" : ""} ${className}`)}
      {...resto}
    >
      {activo && variante !== "enlace" && (
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {activo && trabajando ? trabajando : children}
    </button>
  );
});
