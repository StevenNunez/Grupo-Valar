import type { Seccion } from "@/lib/secciones";

const trazos: Record<Seccion["icono"], React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.6" />
    </>
  ),
  contratos: (
    <>
      <path d="M6 3h8l4 4v14H6Z" strokeLinejoin="round" />
      <path d="M14 3v4h4M9.5 12h5M9.5 16h5" strokeLinecap="round" />
    </>
  ),
  // Flecha entrando: la plata que llega.
  ingresos: (
    <>
      <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </>
  ),
  // Flecha saliendo: la plata que se va.
  egresos: (
    <>
      <path d="M12 15V4m0 0 4.5 4.5M12 4 7.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </>
  ),
  // Hoja con una lista: la solicitud que llega de faena.
  solicitudes: (
    <>
      <path d="M6.5 3h11v18h-11Z" strokeLinejoin="round" />
      <path d="M9.5 8h5M9.5 12h5M9.5 16h3" strokeLinecap="round" />
    </>
  ),
  // Documento sellado: la orden ya emitida.
  ordenes: (
    <>
      <path d="M5 3h9l5 5v13H5Z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinejoin="round" />
      <path d="m9 14.5 2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Tienda con toldo: el proveedor.
  proveedores: (
    <>
      <path d="M4 9h16v11H4Z" strokeLinejoin="round" />
      <path d="M3 9l1.6-5h14.8L21 9" strokeLinejoin="round" />
      <path d="M10 20v-5h4v5" strokeLinejoin="round" />
    </>
  ),
  // Caja de bodega: el artículo.
  articulos: (
    <>
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" strokeLinejoin="round" />
      <path d="M3 8.5 12 13l9-4.5M12 13v7" strokeLinejoin="round" />
    </>
  ),
  // Billete con una moneda: la transferencia al proveedor.
  pagos: (
    <>
      <rect x="2.5" y="6" width="15" height="9.5" rx="1.6" />
      <circle cx="10" cy="10.75" r="2.2" />
      <path d="M6.5 19.5h12a3 3 0 0 0 3-3V9.5" strokeLinecap="round" />
    </>
  ),
};

/** Iconos de la barra lateral del módulo, al mismo grosor que los del sitio. */
export function IconoSeccion({
  icono,
  className = "",
}: {
  icono: Seccion["icono"];
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
