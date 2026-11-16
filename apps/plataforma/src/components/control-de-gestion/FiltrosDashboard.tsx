"use client";

import { useEffect, useRef, useState } from "react";
import { CampoFiltro, Desplegable, Filtro } from "../ui/Vista";
import { rangos, type Periodo } from "./periodo";

/* ── Filtros ──────────────────────────────────────────────────────────────── */

/** Id de Oficina Central en el selector; no choca con ningún contrato. */
export const OFICINA = "oficina-central";

export type GrupoContrato = { id: string; nombre: string; anexos: { id: string; nombre: string }[] };

/** Qué contratos entran al tablero: los que operan, los cerrados o todos. */
export type Alcance = "vigentes" | "cerrados" | "todos";

const alcances: { id: Alcance; titulo: string }[] = [
  { id: "vigentes", titulo: "Vigentes" },
  { id: "cerrados", titulo: "Cerrados" },
  { id: "todos", titulo: "Todos" },
];

/**
 * Contratos y período. Los contratos se eligen con casillas, como un filtro de
 * planilla: se marcan uno o varios (Torres + Misceláneos) y quedan como
 * etiquetas que se quitan de a una. Un anexo es un contrato más y se marca por
 * separado. Sin marcar nada se ven todos, cada uno por su lado.
 */
export function FiltrosDashboard({
  grupos,
  seleccion,
  alCambiarSeleccion,
  alcance,
  alCambiarAlcance,
  hayCerrados,
  periodo,
  alCambiarPeriodo,
  mesesDisponibles,
  acciones,
}: {
  grupos: GrupoContrato[];
  seleccion: string[];
  alCambiarSeleccion: (ids: string[]) => void;
  alcance: Alcance;
  alCambiarAlcance: (a: Alcance) => void;
  hayCerrados: boolean;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
  mesesDisponibles: { id: Periodo; titulo: string }[];
  acciones?: React.ReactNode;
}) {
  const nombre = (id: string) => {
    for (const g of grupos) {
      if (g.id === id) return g.nombre;
      const a = g.anexos.find((x) => x.id === id);
      if (a) return `${g.nombre} › ${a.nombre}`;
    }
    return id;
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <CampoFiltro etiqueta="Contratos">
          <SelectorContratos grupos={grupos} seleccion={seleccion} alCambiar={alCambiarSeleccion} />
        </CampoFiltro>
        {hayCerrados && (
          <CampoFiltro etiqueta="Estado">
            <Filtro etiqueta="Estado del contrato" opciones={alcances} valor={alcance} alCambiar={alCambiarAlcance} />
          </CampoFiltro>
        )}
        <CampoFiltro etiqueta="Período">
          <Desplegable
            etiqueta="Período"
            valor={periodo}
            alCambiar={alCambiarPeriodo}
            grupos={[{ opciones: rangos }, { titulo: "Un mes en particular", opciones: mesesDisponibles }]}
          />
        </CampoFiltro>
        {acciones && <div className="ml-auto">{acciones}</div>}
      </div>

      {seleccion.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Contratos seleccionados">
          {seleccion.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => alCambiarSeleccion(seleccion.filter((x) => x !== id))}
                title="Quitar de la selección"
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan/10 py-1 pl-3 pr-2 text-xs font-semibold text-cyan-deep transition-colors hover:bg-cyan/20"
              >
                {nombre(id)}
                <span aria-hidden="true" className="text-sm leading-none">×</span>
                <span className="sr-only">Quitar {nombre(id)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => alCambiarSeleccion([])}
              className="px-2 py-1 text-xs font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Quitar todos
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Lista desplegable con casillas: contratos y, debajo de cada uno, sus anexos. */
function SelectorContratos({
  grupos,
  seleccion,
  alCambiar,
}: {
  grupos: GrupoContrato[];
  seleccion: string[];
  alCambiar: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const alternar = (id: string) =>
    alCambiar(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);

  const q = busqueda.trim().toLowerCase();
  const visibles = grupos.filter(
    (g) => !q || g.nombre.toLowerCase().includes(q) || g.anexos.some((a) => a.nombre.toLowerCase().includes(q)),
  );
  const resumen =
    seleccion.length === 0 ? "Todos los contratos" : seleccion.length === 1 ? "1 seleccionado" : `${seleccion.length} seleccionados`;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className="flex w-full min-w-[14rem] max-w-[18rem] items-center justify-between gap-3 rounded-full border border-mist-deep bg-white py-2 pl-4 pr-3.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink focus:outline-none focus:ring-2 focus:ring-cyan"
      >
        <span className="truncate">{resumen}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute left-0 z-30 mt-2 w-[min(22rem,90vw)] rounded-2xl border border-mist-deep bg-white p-3 shadow-lg">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar contrato…"
            aria-label="Buscar contrato"
            className="mb-2 w-full rounded-xl border border-mist-deep px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
          />
          <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => alCambiar(grupos.flatMap((g) => [g.id, ...g.anexos.map((a) => a.id)]))}
              className="text-cyan-deep hover:underline"
            >
              Seleccionar todo
            </button>
            <button type="button" onClick={() => alCambiar([])} className="text-ink-soft hover:text-ink hover:underline">
              Limpiar
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {visibles.length === 0 && <li className="px-2 py-3 text-sm text-ink-soft">Ningún contrato coincide.</li>}
            {visibles.map((g) => (
              <li key={g.id}>
                <Casilla marcada={seleccion.includes(g.id)} alCambiar={() => alternar(g.id)} fuerte>
                  {g.nombre}
                </Casilla>
                {g.anexos.map((a) => (
                  <div key={a.id} className="pl-6">
                    <Casilla marcada={seleccion.includes(a.id)} alCambiar={() => alternar(a.id)}>
                      ↳ {a.nombre}
                    </Casilla>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Casilla({
  marcada,
  alCambiar,
  fuerte = false,
  children,
}: {
  marcada: boolean;
  alCambiar: () => void;
  fuerte?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-mist/60">
      <input type="checkbox" checked={marcada} onChange={alCambiar} className="h-4 w-4 shrink-0 accent-cyan-deep" />
      <span className={`min-w-0 truncate ${fuerte ? "font-semibold text-ink" : "text-ink-soft"}`}>{children}</span>
    </label>
  );
}

