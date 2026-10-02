import type { Metadata } from "next";
import { VistaOrdenesCompra } from "@/components/vistas/VistaOrdenesCompra";

export const metadata: Metadata = { title: "Órdenes de Compra" };

export default function Pagina() {
  return <VistaOrdenesCompra />;
}
