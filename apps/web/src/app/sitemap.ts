import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...["trabaja-con-nosotros", "privacidad", "terminos", "cookies"].map((p) => ({
      url: `${siteUrl}/${p}/`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: p === "trabaja-con-nosotros" ? 0.6 : 0.2,
    })),
  ];
}

export const dynamic = "force-static";
