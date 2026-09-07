import type { Modulo } from "@/lib/modulos";

const trazos: Record<Modulo["icono"], React.ReactNode> = {
  gestion: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" strokeLinecap="round" />
    </>
  ),
  proyectos: (
    <>
      <path
        d="M4 6a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
        strokeLinejoin="round"
      />
    </>
  ),
  personas: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3 2.7-4.8 6-4.8s6 1.8 6 4.8" strokeLinecap="round" />
      <path d="M16.5 6.4a3 3 0 0 1 0 5.6M18 19c0-2.2-.8-3.7-2-4.6" strokeLinecap="round" />
    </>
  ),
  equipos: (
    <>
      <path d="M3 20h18M6 20V9l6-4 6 4v11" strokeLinejoin="round" />
      <path d="M10 20v-5h4v5" strokeLinejoin="round" />
    </>
  ),
  documentos: (
    <>
      <path d="M6 3h7l5 5v13H6Z" strokeLinejoin="round" />
      <path d="M13 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
    </>
  ),
};

/** Iconos de línea del menú lateral, al mismo grosor que los del sitio. */
export function IconoModulo({
  icono,
  className = "",
}: {
  icono: Modulo["icono"];
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      className={className}
    >
      {trazos[icono]}
    </svg>
  );
}
