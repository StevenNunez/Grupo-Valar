import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Incluye a los rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot…):
        // el sitio es 100% público, queremos que puedan leerlo y citarlo.
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

export const dynamic = "force-static";
