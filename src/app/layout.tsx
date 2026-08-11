import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { siteUrl } from "@/lib/site";
import { empresa } from "@/lib/content";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const descripcion =
  "Servicios y Proyectos Valar SpA: obras civiles, movimiento de tierra, mantenimiento industrial, ingeniería 3D y arriendo de torres de iluminación y andamios en Antofagasta. Contratista de SQM, Copec, Coca-Cola Andina y Puerto Mejillones.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "Valar | Obras civiles y mantenimiento industrial en Antofagasta",
    template: "%s | Valar",
  },
  description: descripcion,
  applicationName: "Valar",
  keywords: [
    "obras civiles Antofagasta",
    "constructora industrial Antofagasta",
    "mantenimiento industrial Antofagasta",
    "movimiento de tierra Antofagasta",
    "contratista minero norte de Chile",
    "arriendo torres de iluminación solar",
    "andamios Layher certificados",
    "ingeniería 3D escáner láser",
    "empresa Sicep",
    "Servicios y Proyectos Valar SpA",
  ],
  authors: [{ name: empresa.razonSocial }],
  creator: empresa.razonSocial,
  publisher: empresa.razonSocial,
  category: "Construcción e ingeniería industrial",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: siteUrl,
    siteName: "Valar",
    title: "Valar | Valor sostenible para el futuro",
    description: descripcion,
  },
  twitter: {
    card: "summary_large_image",
    title: "Valar | Valor sostenible para el futuro",
    description: descripcion,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: true, address: true, email: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // El script de más abajo le pone clases a <html> antes de que React
    // hidrate; sin esto React lo reporta como desajuste de hidratación.
    <html lang="es-CL" suppressHydrationWarning>
      <body className={`${inter.variable} ${poppins.variable}`}>
        {/*
          Decide antes del primer pintado si toca mostrar la intro, para que no
          parpadee en quien ya la vio en esta sesión o pidió menos movimiento.
          `splash-js` además le avisa al CSS que hay JavaScript y que puede
          dejar de aplicar el plan B que la retira sola, y `?intro=1` la fuerza
          para poder revisarla o mostrarla sin abrir una pestaña nueva.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: [
              'var r=document.documentElement;r.classList.add("splash-js");',
              'try{',
              'if(location.search.indexOf("intro=1")>-1){r.classList.add("splash-force")}',
              'else if(sessionStorage.getItem("valar-splash")==="1"||matchMedia("(prefers-reduced-motion: reduce)").matches){r.classList.add("splash-skip")}',
              "}catch(e){}",
            ].join(""),
          }}
        />
        {children}
      </body>
    </html>
  );
}
