import { Guardia } from "@/components/Guardia";

/**
 * Grupo de rutas `(privado)`: los paréntesis no aparecen en la URL. Acá vive
 * solo el control de sesión — el marco visual lo pone cada zona, porque el
 * índice de módulos y el interior de un módulo no se ven igual.
 */
export default function LayoutPrivado({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Guardia>{children}</Guardia>;
}
