import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Exportación estática: el build genera HTML/CSS/JS planos en `out/`.
   * El sitio no tiene backend (el formulario abre WhatsApp o el correo),
   * así que se sirve como archivos estáticos desde Cloudflare Workers.
   */
  output: "export",

  /**
   * Sin optimizador de imágenes en tiempo de request: no hay servidor Next
   * en producción. Las fotos ya vienen comprimidas en WebP al tamaño justo.
   */
  images: { unoptimized: true },

  /** URLs con barra final (`/contacto/`), que es como sirve los archivos Cloudflare. */
  trailingSlash: true,
};

export default nextConfig;
