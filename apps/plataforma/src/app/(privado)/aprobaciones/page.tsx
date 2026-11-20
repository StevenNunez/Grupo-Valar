import type { Metadata } from "next";
import { MarcoSimple } from "@/components/MarcoSimple";
import { VistaAprobaciones } from "@/components/vistas/VistaAprobaciones";

export const metadata: Metadata = { title: "Aprobaciones" };

export default function Pagina() {
  return (
    <MarcoSimple>
      <VistaAprobaciones />
    </MarcoSimple>
  );
}
