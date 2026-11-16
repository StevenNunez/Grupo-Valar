"use client";

import { Tabla, type Columna } from "../ui/Tabla";
import { Panel } from "../ui/Vista";
import { efectivos, tituloNivel, type Persona } from "@/lib/usuarios";
import { textoContratos, type Comunes } from "./comunes";

/* ── Quién ve qué ─────────────────────────────────────────────────────────── */

export function QuienVeQue({ datos, filtros }: Comunes) {
  const columnas: Columna<Persona>[] = [
    {
      clave: "persona",
      titulo: "Persona",
      encabezado: true,
      celda: (p) => (
        <>
          <span className="block font-semibold text-ink">{p.nombre}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{p.cargo || "Sin cargo"}</span>
        </>
      ),
    },
    ...datos.modulos.map(
      (m): Columna<Persona> => ({
        clave: m.id,
        titulo: m.titulo,
        celda: (p) => {
          if (p.general) return <span className="font-semibold text-ink">Todo</span>;
          const a = datos.accesos.find((x) => x.usuarioId === p.id && x.moduloId === m.id);
          if (!a) return <span className="text-ink-soft">—</span>;
          const puede = efectivos(a, datos.permisos, datos.nivelPermisos);
          const ve = puede.filter((x) => x.lectura).map((x) => x.titulo.replace(/^Ver /, ""));
          const hace = puede.filter((x) => !x.lectura).length;
          return (
            <div className="text-sm">
              <span className="font-semibold text-ink">{tituloNivel(a.nivel)}</span>
              <span className="block text-xs text-ink-soft">
                {a.nivel === "administrador" ? "Todo el módulo" : ve.length ? `Ve: ${ve.join(", ")}` : "No ve ninguna sección"}
              </span>
              {a.nivel !== "administrador" && (
                <span className="block text-xs text-ink-soft">
                  {hace === 0 ? "No cambia nada" : `Hace ${hace} ${hace === 1 ? "acción" : "acciones"}`}
                </span>
              )}
              <span className="block text-xs text-ink-soft">{textoContratos(a.contratos)}</span>
            </div>
          );
        },
      }),
    ),
  ];

  return (
    <Panel
      titulo="Quién ve qué"
      nota="Lo que cada persona ve y hace en cada módulo, y sobre qué contratos."
      filtros={filtros}
    >
      <Tabla columnas={columnas} filas={datos.personas} claveDe={(p) => p.id} vacio="Todavía no hay nadie." />
    </Panel>
  );
}

