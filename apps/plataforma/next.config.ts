import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Con servidor Next, en Vercel. Hasta octubre de 2026 la plataforma era una
   * exportación estática en Cloudflare: los datos los pide el navegador a
   * Supabase y quien manda ahí son las políticas RLS, cosa que no cambia.
   *
   * Pasó a tener servidor porque la integración con Pagnol necesita guardar
   * una llave que el navegador no puede ver, y recibir webhooks. El sitio
   * público (apps/web) sigue siendo estático en Cloudflare.
   */

  /** URLs con barra final: es como quedaron publicadas y no se rompen enlaces guardados. */
  trailingSlash: true,
};

export default nextConfig;
