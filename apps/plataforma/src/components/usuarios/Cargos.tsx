"use client";

import { useState } from "react";
import { Chip } from "../ui/Chip";
import { CampoTexto, Campos, Dialogo, Pie, useFormulario } from "../ui/Formulario";
import { Tabla, type Columna } from "../ui/Tabla";
import { Panel } from "../ui/Vista";
import { guardarCargo, type Cargo } from "@/lib/usuarios";
import type { Comunes } from "./comunes";
import { Switch } from "./Switch";

/* ── Cargos ───────────────────────────────────────────────────────────────── */

export function Cargos({ datos, filtros, alGuardado }: Comunes) {
  const [editando, setEditando] = useState<Cargo | "nuevo" | null>(null);
  const cuantos = (id: string) => datos.personas.filter((p) => p.rol === id).length;

  const columnas: Columna<Cargo>[] = [
    {
      clave: "titulo",
      titulo: "Cargo",
      encabezado: true,
      celda: (c) => (
        <>
          <span className="block font-semibold text-ink">{c.titulo}</span>
          {c.descripcion && <span className="mt-0.5 block text-xs text-ink-soft">{c.descripcion}</span>}
        </>
      ),
    },
    {
      clave: "personas",
      titulo: "Personas",
      derecha: true,
      celda: (c) => <span className="text-ink-soft">{cuantos(c.id)}</span>,
    },
    {
      clave: "estado",
      titulo: "",
      celda: (c) => (c.activo ? null : <Chip tono="neutro">Desactivado</Chip>),
    },
    {
      clave: "acciones",
      titulo: "",
      derecha: true,
      celda: (c) => (
        <button
          type="button"
          onClick={() => setEditando(c)}
          className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Editar
        </button>
      ),
    },
  ];

  return (
    <>
      <Panel
        titulo="Cargos"
        nota="Son títulos: dicen quién es cada persona, no qué puede hacer."
        filtros={
          <>
            {filtros}
            <button
              type="button"
              onClick={() => setEditando("nuevo")}
              className="rounded-full bg-cyan-deep px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-hondo"
            >
              Nuevo cargo
            </button>
          </>
        }
      >
        <Tabla columnas={columnas} filas={datos.cargos} claveDe={(c) => c.id} vacio="No hay cargos." />
      </Panel>

      {editando && (
        <DialogoCargo
          cargo={editando === "nuevo" ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardado={() => {
            setEditando(null);
            alGuardado();
          }}
        />
      )}
    </>
  );
}

function DialogoCargo({
  cargo,
  alCerrar,
  alGuardado,
}: {
  cargo: Cargo | null;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario({
    titulo: cargo?.titulo ?? "",
    descripcion: cargo?.descripcion ?? "",
    activo: cargo?.activo ?? true,
  });

  return (
    <Dialogo
      titulo={cargo ? `Editar ${cargo.titulo}` : "Nuevo cargo"}
      descripcion="Si le cambias el nombre, cambia en todas las personas que lo tienen."
      abierto
      alCerrar={alCerrar}
      ancho="max-w-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          f.enviar(() => guardarCargo({ id: cargo?.id, ...f.datos }), alGuardado);
        }}
      >
        <Campos>
          <CampoTexto etiqueta="Nombre" requerido marcador="Jefe de Bodega" {...f.campo("titulo")} />
          <CampoTexto
            etiqueta="Descripción"
            marcador="Recibe y despacha materiales en faena."
            {...f.campo("descripcion")}
          />
          <label className="flex items-center justify-between gap-4 rounded-xl border border-mist-deep px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-ink">Activo</span>
              <span className="block text-xs text-ink-soft">
                Uno desactivado no se ofrece al invitar; quien ya lo tiene, lo conserva.
              </span>
            </span>
            <Switch
              marcado={f.datos.activo}
              ocupado={false}
              etiqueta="Cargo activo"
              alCambiar={(v) => f.cambiar("activo", v)}
            />
          </label>
        </Campos>
        <Pie error={f.error} guardando={f.guardando} alCancelar={alCerrar} />
      </form>
    </Dialogo>
  );
}

