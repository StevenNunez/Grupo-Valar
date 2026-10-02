/**
 * Datos de la empresa. Copiados del sitio público (apps/web/src/lib/content.ts)
 * a propósito: cada app es autónoma.
 */
export const empresa = {
  nombre: "Valar",
  razonSocial: "Servicios y Proyectos Valar SpA",
  rut: "77.256.185-7",
  representante: "Francisco Valdés Araya",
  /* Dirección confirmada por el usuario el 08-09-2026: la de las órdenes de
     compra es la buena. El sitio público todavía muestra "Vicente Salgado 81,
     sector El Huáscar"; cambiarlo allá es decisión aparte. */
  direccion: "Heroes de la Concepción 8848, Antofagasta, Chile",
  email: "contacto@valar.live",
  /** Sitio público, para volver desde la plataforma. */
  sitioUrl: "https://www.grupovalar.cl",
} as const;

/**
 * Lo que va impreso en la orden de compra, tomado de las 114 órdenes que Valar
 * ya emitió (OC22-001015 en adelante).
 *
 * La dirección es la de las órdenes de compra, que es la que el proveedor
 * conoce. Confirmada por el usuario el 08-09-2026 frente a la del sitio
 * público, que es distinta.
 *
 * Quien autoriza es fijo porque es el representante legal. Quien EMITE no:
 * cambia según la persona que la hizo, y se guarda en cada orden.
 */
export const emisorOC = {
  razonSocial: "VALAR SPA",
  rut: "77256185-7",
  direccion: "Heroes de la Concepción 8848",
  ciudad: "Antofagasta",
  comuna: "Antofagasta",
  region: "Antofagasta",
  autorizadoPor: empresa.representante,
  condicionesPagoPorDefecto: "30 días",
  /* Serie y correlativo con que sigue la numeración. La última orden emitida
     fuera de la plataforma fue la OC22-001128. */
  serieOC: "OC22",
  siguienteCorrelativo: 1129,
  digitosCorrelativo: 6,
} as const;
