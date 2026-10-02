import type { Metadata } from "next";
import { ListaModulos } from "@/components/ListaModulos";
import { MarcoSimple } from "@/components/MarcoSimple";

export const metadata: Metadata = { title: "Módulos" };

/**
 * Lanzador. Sin barra lateral y sin encabezado que repita "Módulos": las
 * tarjetas ya dicen a dónde llevan. Cuáles se ven depende de la persona, así
 * que la lista la arma un componente de cliente con su sesión.
 */
export default function ModulosPage() {
  return (
    <MarcoSimple>
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-4xl font-semibold text-ink">
          Plataforma Valar
        </h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Elige el módulo con el que vas a trabajar.
        </p>

        <ListaModulos />
      </div>
    </MarcoSimple>
  );
}
