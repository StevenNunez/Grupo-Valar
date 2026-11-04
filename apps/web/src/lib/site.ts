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
 * Base de datos que recibe las postulaciones de «Trabaja con nosotros» (el
 * Supabase de la Plataforma). La clave `anon` es pública por diseño: lo que
 * puede hacer un visitante lo limitan las políticas de la base (0113: solo
 * insertar su postulación y subir un archivo; nunca leer nada). Se leen en el
 * build, desde `apps/web/.env.local`.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Versión del texto de privacidad que aceptó quien postula (queda guardada con la postulación). */
export const versionPrivacidad = "2026-11-04";
