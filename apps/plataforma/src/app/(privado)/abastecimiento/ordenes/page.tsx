import type { Metadata } from "next";
import { VistaOrdenes } from "@/components/vistas/VistaOrdenes";

export const metadata: Metadata = { title: "Órdenes de Compra" };

export default function Pagina() {
  return <VistaOrdenes />;
}
