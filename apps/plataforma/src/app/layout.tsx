import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { empresa } from "@/lib/empresa";
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

export const metadata: Metadata = {
  title: {
    default: "Plataforma Valar",
    template: "%s | Plataforma Valar",
  },
  description: `Plataforma interna de ${empresa.razonSocial}.`,
  applicationName: "Plataforma Valar",
  // Herramienta interna: fuera de Google y de los rastreadores de IA. Se
  // refuerza en robots.ts y en la cabecera X-Robots-Tag de public/_headers.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL">
      <body className={`${inter.variable} ${poppins.variable}`}>{children}</body>
    </html>
  );
}
