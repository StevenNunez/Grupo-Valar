import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Exportación estática, igual que el sitio público. Los datos no viajan en
   * el HTML: los pide el navegador a Supabase, y quien manda ahí son las
   * políticas RLS de la base, no este build.
   *
   * ESTE ES EL ARCHIVO A TOCAR el día que la plataforma necesite servidor
   * (Server Components, middleware, secretos). Al vivir en su propia app y en
   * su propio dominio, cambiarlo no toca ni el sitio público ni su SEO.
   */
  output: "export",

  /** Sin optimizador de imágenes en request: no hay servidor Next en producción. */
  images: { unoptimized: true },

  /** URLs con barra final, que es como sirve los archivos Cloudflare. */
  trailingSlash: true,
};

export default nextConfig;
