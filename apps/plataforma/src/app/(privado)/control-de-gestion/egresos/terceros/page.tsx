import type { Metadata } from "next";
import { VistaEgresosTerceros } from "@/components/vistas/VistaEgresosTerceros";

export const metadata: Metadata = { title: "Compras y Servicios" };

export default function Pagina() {
  return <VistaEgresosTerceros />;
}
