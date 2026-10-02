import type { Metadata } from "next";
import { VistaPagos } from "@/components/vistas/VistaPagos";

export const metadata: Metadata = { title: "Pagos a proveedores" };

export default function Pagina() {
  return <VistaPagos />;
}
