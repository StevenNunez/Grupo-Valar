import type { Metadata } from "next";
import { VistaPersonal } from "@/components/vistas/VistaPersonal";

export const metadata: Metadata = { title: "Personal" };

export default function Pagina() {
  return <VistaPersonal />;
}
