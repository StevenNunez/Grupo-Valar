import { MarcoModulo } from "@/components/MarcoModulo";
import { seccionesGestion } from "@/lib/secciones";

/** Todo lo que cuelga del módulo comparte su barra lateral y sus pestañas. */
export default function LayoutControlDeGestion({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarcoModulo modulo="control-de-gestion" titulo="Control de Gestión" secciones={seccionesGestion}>
      {children}
    </MarcoModulo>
  );
}
