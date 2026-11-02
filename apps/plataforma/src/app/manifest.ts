import type { MetadataRoute } from "next";

/**
 * Lo que hace que la plataforma se pueda instalar como app (teléfono y
 * escritorio) y que los avisos push lleguen aunque no esté abierta.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plataforma Valar",
    short_name: "Valar",
    description: "Plataforma interna de Grupo Valar: abastecimiento, control de gestión y pagos.",
    lang: "es-CL",
    start_url: "/modulos/",
    scope: "/",
    display: "standalone",
    background_color: "#1f2124",
    theme_color: "#1f2124",
    icons: [
      { src: "/icons/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
