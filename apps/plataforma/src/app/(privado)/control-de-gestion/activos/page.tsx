import type { Metadata } from "next";
import { VistaActivos } from "@/components/vistas/VistaActivos";

export const metadata: Metadata = { title: "Activos" };

export default function Pagina() {
  return <VistaActivos />;
}
