/** Módulos de la Plataforma Valar. Hoy solo Control de Gestión está operativo. */
export type Modulo = {
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
  /** `false` mientras el módulo no exista: se muestra apagado, con "Pronto". */
  activo: boolean;
  icono: "gestion" | "proyectos" | "personas" | "equipos" | "documentos";
};

export const modulos: Modulo[] = [
  {
    id: "control-de-gestion",
    titulo: "Control de Gestión",
    descripcion:
      "Avance físico, presupuesto contra costo real y estado de cada contrato en curso.",
    href: "/control-de-gestion/",
    activo: true,
    icono: "gestion",
  },
  {
    id: "proyectos",
    titulo: "Proyectos",
    descripcion: "Carpeta de obra, hitos, programa y libro de comunicaciones.",
    href: "#",
    activo: false,
    icono: "proyectos",
  },
  {
    id: "personas",
    titulo: "Personas y HH",
    descripcion: "Dotación por faena, horas hombre y control de asistencia.",
    href: "#",
    activo: false,
    icono: "personas",
  },
  {
    id: "equipos",
    titulo: "Equipos y Arriendos",
    descripcion: "Torres de iluminación, andamios Layher y mantención preventiva.",
    href: "#",
    activo: false,
    icono: "equipos",
  },
  {
    id: "documentos",
    titulo: "Documentos",
    descripcion: "Estados de pago, certificados Sicep y documentación laboral.",
    href: "#",
    activo: false,
    icono: "documentos",
  },
];
