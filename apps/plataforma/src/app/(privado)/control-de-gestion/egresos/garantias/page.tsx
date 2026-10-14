import type { Metadata } from "next";
import { VistaGarantias } from "@/components/vistas/VistaGarantias";

export const metadata: Metadata = { title: "Garantías" };

export default function Pagina() {
  return <VistaGarantias />;
}
