import type { Metadata } from "next";
import { PanelAbastecimiento } from "@/components/PanelAbastecimiento";

export const metadata: Metadata = { title: "Abastecimiento" };

export default function Pagina() {
  return <PanelAbastecimiento />;
}
