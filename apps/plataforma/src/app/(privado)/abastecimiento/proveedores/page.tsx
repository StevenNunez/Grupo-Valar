import type { Metadata } from "next";
import { VistaProveedores } from "@/components/vistas/VistaProveedores";

export const metadata: Metadata = { title: "Proveedores" };

export default function Pagina() {
  return <VistaProveedores />;
}
