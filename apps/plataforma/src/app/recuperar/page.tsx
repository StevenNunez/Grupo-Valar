import type { Metadata } from "next";
import { FormularioRecuperacion } from "@/components/FormularioRecuperacion";
import { PantallaAcceso } from "@/components/PantallaAcceso";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return (
    <PantallaAcceso titulo="Recuperar contraseña" descripcion="Te enviaremos un enlace para elegir una nueva contraseña.">
      <FormularioRecuperacion />
    </PantallaAcceso>
  );
}
