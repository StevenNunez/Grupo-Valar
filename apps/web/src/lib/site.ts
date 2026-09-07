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
