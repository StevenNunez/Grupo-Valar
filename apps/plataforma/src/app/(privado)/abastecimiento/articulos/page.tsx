import type { Metadata } from "next";
import { VistaArticulos } from "@/components/vistas/VistaArticulos";

export const metadata: Metadata = { title: "Artículos" };

export default function Pagina() {
  return <VistaArticulos />;
}
