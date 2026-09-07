import { Shell } from "@/components/Shell";

/**
 * Grupo de rutas `(panel)`: los paréntesis no aparecen en la URL, solo sirven
 * para que todo lo que va detrás del login comparta el marco sin colgarse de
 * un segmento extra. Así `/modulos/` y `/control-de-gestion/` quedan a la vista.
 */
export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell>{children}</Shell>;
}
