/**
 * Trazos del isotipo, cada uno por su lado: la intro (`Splash`) los anima
 * por separado, así que viven aquí y no incrustados en el SVG.
 */
export const MARK_VIEWBOX = "0 0 275.01 142.45";

/** La V de la ligadura, a la izquierda. */
export const MARK_V =
  "M117.48 3.15L150.62 3.15L107.48 120.46C102.59 133.67 90.35 142.45 75.54 142.45C61.48 142.45 48.18 133.67 43.29 120.61L0 3.15L33.15 3.15L67.34 95.69C69.68 102.15 72.76 105.45 75.54 105.45C78.39 105.45 81.17 102.15 83.5 95.47L117.48 3.15Z";

/** La A, que es la misma V invertida, montada a la derecha. */
export const MARK_A =
  "M199.93 36.92C197.15 36.92 194.07 40.22 191.74 46.68L157.54 139.22L124.39 139.22L167.69 21.77C172.57 8.7 185.87 0 199.93 0C214.74 0 226.99 8.7 231.87 21.92L275.01 139.22L241.87 139.22L207.89 46.83C205.57 40.22 202.86 36.92 199.93 36.92Z";

/** Isotipo Valar (ligadura V+A), vectorizado desde el manual de marca. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={MARK_V} />
      <path d={MARK_A} />
    </svg>
  );
}

/** Isotipo + logotipo, como aparece en la portada del brochure. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-[0.72em] w-auto" />
      <span className="font-display text-[1em] font-semibold tracking-[0.28em] leading-none">
        VALAR
      </span>
    </span>
  );
}
