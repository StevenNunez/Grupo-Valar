import type { Metadata } from "next";
import { VistaFacturas } from "@/components/vistas/VistaFacturas";

export const metadata: Metadata = { title: "Facturas" };

export default function Pagina() {
  return <VistaFacturas />;
}
