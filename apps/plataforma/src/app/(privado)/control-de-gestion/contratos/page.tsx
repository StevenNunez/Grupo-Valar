import type { Metadata } from "next";
import { VistaContratos } from "@/components/vistas/VistaContratos";

export const metadata: Metadata = { title: "Contratos" };

export default function Pagina() {
  return <VistaContratos />;
}
