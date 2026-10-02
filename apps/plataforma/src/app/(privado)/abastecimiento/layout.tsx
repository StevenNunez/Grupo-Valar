import { MarcoModulo } from "@/components/MarcoModulo";
import { seccionesAbastecimiento } from "@/lib/secciones";

/** Todo lo que cuelga del módulo comparte su barra lateral. */
export default function LayoutAbastecimiento({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarcoModulo modulo="abastecimiento" titulo="Abastecimiento" secciones={seccionesAbastecimiento}>
      {children}
    </MarcoModulo>
  );
}
