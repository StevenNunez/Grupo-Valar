/** Módulos de la Plataforma Valar. Hoy solo Control de Gestión está operativo. */
export type Modulo = {
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
  /** `false` mientras el módulo no exista: se muestra apagado, con "Pronto". */
  activo: boolean;
  icono: "gestion" | "abastecimiento" | "proyectos" | "personas" | "equipos" | "documentos";
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
    id: "abastecimiento",
    titulo: "Abastecimiento",
    descripcion:
      "Solicitudes de faena, cotizaciones, órdenes de compra y proveedores, con su aprobación.",
    href: "/abastecimiento/",
    activo: true,
    icono: "abastecimiento",
  },
  {
    id: "proyectos",
    titulo: "Proyectos",
    descripcion: "Carpeta de obra, hitos, programa y libro de comunicaciones.",
    href: "#",
    activo: false,
    icono: "proyectos",
  },
  
 

];

/**
 * Si la persona entra directo a un módulo, sin pasar por el índice.
 *
 * Es lo que pidió el usuario: quien tiene UN módulo entra a ese módulo y no ve
 * los demás —ni siquiera apagados—. Si además lo administra, la gente de su
 * módulo la maneja desde un enlace en su barra lateral. Devuelve la ruta, o
 * `null` si le corresponde el índice (Administrador general, o varios módulos).
 */
export function entraDirecto(usuario: {
  general: string | null;
  accesos: Record<string, string>;
}): string | null {
  if (usuario.general) return null;
  const suyos = modulos.filter((m) => m.activo && m.id in usuario.accesos);
  return suyos.length === 1 ? suyos[0].href : null;
}
