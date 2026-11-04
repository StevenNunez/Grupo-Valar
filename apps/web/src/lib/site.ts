/**
 * Dominio de producción del sitio.
 *
 * ÚNICA fuente de verdad: de aquí salen las URLs canónicas, la imagen de
 * WhatsApp/correo (Open Graph), el robots.txt, el sitemap.xml y los datos
 * estructurados de Google. Si cambia el dominio, se cambia SOLO esta línea.
 */
// OJO: con "www". El dominio sin www no resuelve, y si las URLs apuntan ahí
// WhatsApp no puede descargar la imagen de vista previa.
export const siteUrl = "https://www.grupovalar.cl";

/**
 * Plataforma interna, en su propio subdominio y su propio deploy (apps/plataforma).
 * Vive aparte a propósito: el día que necesite servidor se cambia allá sin tocar
 * este sitio ni su SEO.
 */
export const plataformaUrl = "https://plataforma.grupovalar.cl";

/**
 * Redes de Valar para el «Síguenos» del footer. Solo se muestra la que tenga
 * URL: completar acá, sin tocar el footer. (Dejar vacío = no se muestra.)
 */
export const redes = {
  linkedin: "https://www.linkedin.com/company/grupo-valar",
  instagram: "",
  facebook: "",
  youtube: "",
} as const;

/**
 * Dónde llegan los currículums de «Trabaja con nosotros». Por ahora es solo un
 * correo: quien postula lo escribe desde su programa de correo, sin formulario.
 */
export const emailPostulaciones = "cleiva@valar.live";

/** Fecha de la última versión de la política de privacidad. */
export const versionPrivacidad = "2026-11-04";
