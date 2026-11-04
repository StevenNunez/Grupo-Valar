import type { Metadata } from "next";
import { FormularioCV } from "@/components/FormularioCV";
import { PaginaInterior } from "@/components/PaginaInterior";

export const metadata: Metadata = {
  title: "Trabaja con nosotros",
  description:
    "Envía tu currículum a Valar. Construimos obras civiles, mantenimiento industrial y movimiento de tierra en Antofagasta; te contactaremos cuando haya un proceso que calce con tu perfil.",
  alternates: { canonical: "/trabaja-con-nosotros/" },
};

export default function TrabajaConNosotros() {
  return (
    <PaginaInterior
      etiqueta="Trabaja con nosotros"
      titulo="Súmate al equipo de Valar"
      bajada="Dejamos abierta una base de postulantes. Envía tu currículum y, cuando necesitemos personal para una obra o servicio, te contactaremos."
      ancho="max-w-3xl"
    >
      <FormularioCV />
    </PaginaInterior>
  );
}
