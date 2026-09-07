import type { Metadata } from "next";
import { ControlDeGestion } from "@/components/ControlDeGestion";

export const metadata: Metadata = { title: "Control de Gestión" };

export default function ControlDeGestionPage() {
  return <ControlDeGestion />;
}
