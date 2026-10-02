import type { Metadata } from "next";
import { VistaEstadosPago } from "@/components/vistas/VistaEstadosPago";

export const metadata: Metadata = { title: "Estados de Pago" };

export default function Pagina() {
  return <VistaEstadosPago />;
}
