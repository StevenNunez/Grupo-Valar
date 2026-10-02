import type { Metadata } from "next";
import { VistaSolped } from "@/components/vistas/VistaSolped";

export const metadata: Metadata = { title: "Solicitudes de pedido" };

export default function Pagina() {
  return <VistaSolped />;
}
