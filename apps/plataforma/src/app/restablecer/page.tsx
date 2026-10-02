import type { Metadata } from "next";
import { FormularioNuevaClave } from "@/components/FormularioNuevaClave";
import { PantallaAcceso } from "@/components/PantallaAcceso";

export const metadata: Metadata = { title: "Establecer contraseña" };

export default function RestablecerPage() {
  return (
    <PantallaAcceso titulo="Establecer contraseña" descripcion="Elige una contraseña nueva para tu cuenta.">
      <FormularioNuevaClave />
    </PantallaAcceso>
  );
}
