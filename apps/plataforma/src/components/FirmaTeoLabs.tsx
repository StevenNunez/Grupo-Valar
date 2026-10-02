"use client";

import InteractiveLogo from "./InteractiveLogo";

/**
 * El crédito de Teo Labs, igual en toda la plataforma y en cada documento.
 *
 * Usa `InteractiveLogo` tal cual —es un componente compartido entre los sitios
 * de Teo Labs y se mantiene idéntico en todos—, así que acá no se le cambia el
 * gradiente ni el tamaño: solo se envuelve con el enlace y el ®.
 *
 * OJO AL IMPRIMIR. El logo pinta las letras con un gradiente recortado al texto
 * (`bg-clip-text` + texto transparente). Los navegadores no imprimen fondos por
 * omisión, así que en papel o en «Guardar como PDF» las letras saldrían
 * invisibles. Por eso los documentos llevan la clase `firma-teolabs`, que en
 * `globals.css` fuerza la impresión de color en `@media print`. Eso no cambia
 * el diseño del logo: le dice al navegador que lo imprima como se ve.
 */
export function FirmaTeoLabs({
  className = "",
  tono = "text-ink-soft",
}: {
  className?: string;
  /** El color del texto que acompaña. El logo trae el suyo. */
  tono?: string;
}) {
  return (
    <span
      className={`firma-teolabs flex items-center gap-1 text-[12px] ${tono} ${className}`}
    >
      Desarrollado por
      <a
        href="https://www.teolabs.app"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-opacity hover:opacity-80"
      >
        <InteractiveLogo variant="footer-small" className="text-[14px]" />
      </a>
      ®
    </span>
  );
}
