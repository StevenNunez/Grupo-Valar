"use client";

import { createPortal } from "react-dom";

/**
 * La vista previa de un documento antes de imprimirlo o guardarlo en PDF.
 *
 * El PDF lo hace el navegador: en el cuadro de imprimir, "Guardar como PDF".
 * Por eso no hay ninguna librería de PDF en el proyecto ni servidor que genere
 * archivos — y por eso el documento se puede diseñar con el mismo HTML y las
 * mismas fuentes que el resto de la plataforma.
 *
 * `imprimiendo` es la clase que las reglas de `@media print` de `globals.css`
 * dejan visible; todo lo demás de la pantalla se esconde. La barra de botones
 * lleva `no-imprimir` para que no salga en la hoja.
 *
 * VA EN UN PORTAL A `document.body`, Y ESO NO ES UN DETALLE: la regla de
 * impresión es `body > *:not(.imprimiendo) { display: none }`, que mira los
 * HIJOS DIRECTOS del body. Colgando de `<main>`, como estaba antes, la hoja
 * quedaba dentro del elemento que la regla escondía y la impresión salía en
 * blanco. Desde el body, se esconde la aplicación y queda la hoja sola.
 */
export function Impresion({
  titulo,
  alCerrar,
  children,
}: {
  titulo: string;
  alCerrar: () => void;
  children: React.ReactNode;
}) {
  // `document` no existe mientras Next prerenderiza. No hace falta esperar al
  // montaje con un efecto: esto solo se renderiza cuando alguien aprieta el
  // botón, o sea siempre en el navegador y después de la hidratación.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="imprimiendo fixed inset-0 z-70 overflow-y-auto bg-mist/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="no-imprimir mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-4">
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
          >
            Imprimir o guardar PDF
          </button>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-full border border-mist-deep bg-white px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Cerrar
          </button>
        </div>
      </div>

      {children}
    </div>,
    document.body,
  );
}

/** El botón que abre la vista previa. */
export function BotonImprimir({
  onClick,
  children = "Informe PDF",
}: {
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-mist-deep bg-white px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path
          d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7Z"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </button>
  );
}
