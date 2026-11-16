"use client";

import { useState } from "react";
import { Chip } from "../ui/Chip";
import { Tabla, type Columna } from "../ui/Tabla";
import { Panel } from "../ui/Vista";
import { mensajeParaPersona } from "@/lib/errores";
import { formatearFecha } from "@/lib/formato";
import { cambiarCargo, tituloNivel, type Persona } from "@/lib/usuarios";
import { Aviso, textoContratos, tituloGeneral, type Comunes } from "./comunes";
import { DialogoPersona } from "./DialogoPersona";

/* ── Personas ─────────────────────────────────────────────────────────────── */

export function Personas({ datos, yo, misModulos, filtros, alGuardado }: Comunes) {
  const [viendo, setViendo] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const general = yo.general !== null;
  const titulos = new Map(datos.modulos.map((m) => [m.id, m.titulo]));

  async function moverCargo(p: Persona, rol: string) {
    setError(null);
    try {
      await cambiarCargo(p.id, rol);
      alGuardado();
    } catch (e) {
      setError(mensajeParaPersona(e, "VistaUsuarios"));
    }
  }

  const columnas: Columna<Persona>[] = [
    {
      clave: "persona",
      titulo: "Persona",
      encabezado: true,
      celda: (p) => (
        <>
          <span className="block font-semibold text-ink">
            {p.nombre}
            {p.id === yo.id && <span className="ml-1.5 text-xs font-normal text-ink-soft">(tú)</span>}
          </span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {p.cargo || "Sin cargo"} · desde {formatearFecha(p.creadoEn.slice(0, 10))}
          </span>
        </>
      ),
    },
    {
      clave: "acceso",
      titulo: "Acceso",
      celda: (p) => {
        if (p.general) return <Chip tono="info">{tituloGeneral(p.general)}</Chip>;
        const suyos = datos.accesos.filter((a) => a.usuarioId === p.id);
        if (suyos.length === 0) return <span className="text-ink-soft">Sin acceso</span>;
        return (
          <ul className="flex flex-col gap-1">
            {suyos.map((a) => (
              <li key={a.moduloId} className="text-sm">
                <span className="text-ink-soft">{titulos.get(a.moduloId)} · </span>
                <span className="font-semibold text-ink">{tituloNivel(a.nivel)}</span>
                {a.contratos !== null && (
                  <span className="block text-xs text-ink-soft">{textoContratos(a.contratos)}</span>
                )}
              </li>
            ))}
          </ul>
        );
      },
    },
    ...(general
      ? [
          {
            clave: "cargo",
            titulo: "Cargo",
            ancho: "w-56",
            celda: (p: Persona) => (
              <select
                value={p.rol}
                onChange={(e) => void moverCargo(p, e.target.value)}
                aria-label={`Cargo de ${p.nombre}`}
                className="w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink"
              >
                {datos.cargos
                  .filter((c) => c.activo || c.id === p.rol)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titulo}
                    </option>
                  ))}
              </select>
            ),
          },
        ]
      : []),
    {
      clave: "acciones",
      titulo: "",
      derecha: true,
      celda: (p) =>
        // A un Administrador general solo lo toca otro Administrador general.
        p.general && !general ? null : (
          <button
            type="button"
            onClick={() => setViendo(p)}
            className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Accesos
          </button>
        ),
    },
  ];

  return (
    <>
      <Panel
        titulo="Personas"
        nota={
          general
            ? `${datos.personas.length} con cuenta`
            : `Ves el acceso de cada uno a ${misModulos.map((m) => m.titulo).join(" y ")}`
        }
        filtros={filtros}
      >
        {error && (
          <div className="mx-6 mt-5 lg:mx-8">
            <Aviso texto={error} />
          </div>
        )}
        <Tabla
          columnas={columnas}
          filas={datos.personas}
          claveDe={(p) => p.id}
          vacio="Todavía no hay nadie con cuenta."
        />
      </Panel>

      {viendo && (
        <DialogoPersona
          persona={datos.personas.find((p) => p.id === viendo.id) ?? viendo}
          datos={datos}
          yo={yo}
          misModulos={misModulos}
          alCerrar={() => setViendo(null)}
          alGuardado={alGuardado}
        />
      )}
    </>
  );
}

