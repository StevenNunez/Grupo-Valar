import type { MetadataRoute } from "next";

/** Herramienta interna: no se indexa nada, ni por buscadores ni por IA. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}

export const dynamic = "force-static";
