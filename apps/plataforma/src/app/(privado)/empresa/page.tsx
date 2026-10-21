import type { Metadata } from "next";
import { MarcoSimple } from "@/components/MarcoSimple";
import { VistaEmpresa } from "@/components/vistas/VistaEmpresa";

export const metadata: Metadata = { title: "Datos de la empresa" };

export default function Pagina() {
  return (
    <MarcoSimple>
      <VistaEmpresa />
    </MarcoSimple>
  );
}
