import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Clientes } from "@/components/Clientes";
import { Proposito } from "@/components/Proposito";
import { Servicios } from "@/components/Servicios";
import { Proyectos } from "@/components/Proyectos";
import { Sostenibilidad } from "@/components/Sostenibilidad";
import { Valores } from "@/components/Valores";
import { Contacto } from "@/components/Contacto";
import { Footer } from "@/components/Footer";
import { empresa, servicios, clientes } from "@/lib/content";
import { siteUrl } from "@/lib/site";

/**
 * Datos estructurados: es lo que Google usa para los resultados enriquecidos
 * y lo que los asistentes de IA leen para citar bien la empresa.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["GeneralContractor", "Organization"],
      "@id": `${siteUrl}/#organizacion`,
      name: empresa.razonSocial,
      alternateName: "Valar",
      legalName: empresa.razonSocial,
      taxID: empresa.rut,
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/logo-valar.png`,
        width: 512,
        height: 512,
      },
      image: `${siteUrl}/opengraph-image`,
      slogan: "Valor sostenible para el futuro.",
      description:
        "Empresa de ingeniería, obras civiles y mantenimiento industrial en Antofagasta, Chile. Más de 40 años de experiencia agregada al servicio de la minería, la energía, el retail y la industria portuaria.",
      email: empresa.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Vicente Salgado 81, sector El Huáscar",
        addressLocality: "Antofagasta",
        addressRegion: "Antofagasta",
        addressCountry: "CL",
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        email: empresa.email,
        areaServed: "CL",
        availableLanguage: ["es"],
      },
      founder: { "@type": "Person", name: empresa.representante },
      areaServed: [
        { "@type": "Country", name: "Chile" },
        { "@type": "AdministrativeArea", name: "Región de Antofagasta" },
      ],
      knowsAbout: [
        "Obras civiles industriales",
        "Movimiento de tierra",
        "Mantenimiento industrial",
        "Ingeniería 3D con escáner láser",
        "Arriendo de torres de iluminación solar y diésel",
        "Andamios certificados Layher",
      ],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Servicios Valar",
        itemListElement: servicios.map((s) => ({
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: s.titulo,
            description: s.resumen,
            serviceType: s.titulo,
            provider: { "@id": `${siteUrl}/#organizacion` },
          },
        })),
      },
      // Clientes declarados en el brochure corporativo.
      client: clientes.map((c) => ({ "@type": "Organization", name: c.nombre })),
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#sitio`,
      url: siteUrl,
      name: "Valar",
      inLanguage: "es-CL",
      publisher: { "@id": `${siteUrl}/#organizacion` },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main>
        <Hero />
        <Clientes />
        <Proposito />
        <Servicios />
        <Proyectos />
        <Sostenibilidad />
        <Valores />
        <Contacto />
      </main>
      <Footer />
    </>
  );
}
