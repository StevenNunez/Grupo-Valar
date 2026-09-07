/**
 * Datos de la empresa. Copiados del sitio público (apps/web/src/lib/content.ts)
 * a propósito: cada app es autónoma. Acá van a vivir además los campos que solo
 * necesitan los documentos que emite la plataforma.
 */
export const empresa = {
  nombre: "Valar",
  razonSocial: "Servicios y Proyectos Valar SpA",
  rut: "77.256.185-7",
  representante: "Francisco Valdés Araya",
  direccion: "Vicente Salgado 81, sector El Huáscar, Antofagasta, Chile",
  email: "contacto@valar.live",
  /** Sitio público, para volver desde la plataforma. */
  sitioUrl: "https://www.grupovalar.cl",
} as const;
