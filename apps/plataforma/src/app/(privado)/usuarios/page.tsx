import type { Metadata } from "next";
import { MarcoSimple } from "@/components/MarcoSimple";
import { VistaUsuarios } from "@/components/vistas/VistaUsuarios";

export const metadata: Metadata = { title: "Usuarios y permisos" };

export default function Pagina() {
  return (
    <MarcoSimple>
      <VistaUsuarios />
    </MarcoSimple>
  );
}
