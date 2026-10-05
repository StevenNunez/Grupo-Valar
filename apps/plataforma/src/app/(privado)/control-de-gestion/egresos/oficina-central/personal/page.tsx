import type { Metadata } from "next";
import { VistaPersonalOficina } from "@/components/vistas/VistaPersonalOficina";

export const metadata: Metadata = { title: "Personal de Oficina Central" };

export default function Pagina() {
  return <VistaPersonalOficina />;
}
