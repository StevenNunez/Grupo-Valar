import type { Metadata } from "next";
import { VistaPostulaciones } from "@/components/vistas/VistaPostulaciones";

export const metadata: Metadata = { title: "Postulaciones" };

export default function Pagina() {
  return <VistaPostulaciones />;
}
