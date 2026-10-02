import type { Metadata } from "next";
import { VistaOficinaCentral } from "@/components/vistas/VistaOficinaCentral";

export const metadata: Metadata = { title: "Oficina Central" };

export default function Pagina() {
  return <VistaOficinaCentral />;
}
