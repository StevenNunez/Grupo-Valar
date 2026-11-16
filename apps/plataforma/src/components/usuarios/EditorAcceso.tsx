"use client";

import { niveles, tituloNivel, type Modulo, type Nivel, type Permiso } from "@/lib/usuarios";
import { sinAcceso, type Borrador, type Datos } from "./comunes";
import { Switch } from "./Switch";

/**
 * Nivel, switches y contratos de UN módulo. Lo usan el diálogo de la persona y
 * el de invitar: la regla es la misma en los dos lados.
 */
export function EditorAcceso({
  modulo,
  datos,
  puedeTodos,
  valor,
  deshabilitado,
  alCambiar,
}: {
  modulo: Modulo;
  datos: Datos;
  puedeTodos: boolean;
  valor: Borrador;
  deshabilitado?: boolean;
  alCambiar: (b: Borrador) => void;
}) {
  const delModulo = datos.permisos.filter((p) => p.moduloId === modulo.id);
  const nivel = valor.nivel;

  function elegirNivel(n: Nivel | null) {
    if (n === null) return alCambiar(sinAcceso);
    // Al pasar a Visualizador se caen los switches de escritura, igual que en la base.
    const permisos =
      n === "visualizador"
        ? valor.permisos.filter((id) => delModulo.find((p) => p.id === id)?.lectura)
        : valor.permisos;
    alCambiar({
      nivel: n,
      permisos,
      contratos: valor.nivel === null && !puedeTodos ? [] : valor.contratos,
    });
  }

  const alternar = (id: string, si: boolean) =>
    alCambiar({
      ...valor,
      permisos: si ? [...valor.permisos, id] : valor.permisos.filter((x) => x !== id),
    });

  const grupos: { titulo: string; lista: Permiso[] }[] = [
    { titulo: "Qué ve", lista: delModulo.filter((p) => p.lectura) },
    ...(nivel === "visualizador"
      ? []
      : [{ titulo: "Qué hace", lista: delModulo.filter((p) => !p.lectura) }]),
  ];

  const todos = valor.contratos === null;

  return (
    <div>
      <h3 className="font-display text-lg font-semibold text-ink">{modulo.titulo}</h3>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Nivel en ${modulo.titulo}`}>
        {[{ id: null, titulo: "Sin acceso" } as { id: Nivel | null; titulo: string }, ...niveles].map((n) => (
          <button
            key={n.id ?? "ninguno"}
            type="button"
            disabled={deshabilitado}
            aria-pressed={nivel === n.id}
            onClick={() => elegirNivel(n.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              nivel === n.id
                ? "bg-ink text-white"
                : "border border-mist-deep text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {n.titulo}
          </button>
        ))}
      </div>
      {nivel && (
        <p className="mt-2 text-xs text-ink-soft">{niveles.find((n) => n.id === nivel)?.nota}</p>
      )}

      {nivel && nivel !== "administrador" && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {grupos.map(({ titulo, lista }) => (
            <div key={titulo}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">{titulo}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {lista.map((p) => {
                  const incluido = datos.nivelPermisos.has(`${nivel}|${p.id}`);
                  const marcado = incluido || valor.permisos.includes(p.id);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-mist-deep px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{p.titulo}</p>
                        {incluido && <p className="text-xs text-ink-soft">Viene con {tituloNivel(nivel)}</p>}
                      </div>
                      <Switch
                        marcado={marcado}
                        ocupado={!!deshabilitado || incluido}
                        etiqueta={`${p.titulo} en ${modulo.titulo}`}
                        alCambiar={(v) => alternar(p.id, v)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {nivel && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Contratos</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {puedeTodos && (
              <button
                type="button"
                disabled={deshabilitado}
                aria-pressed={todos}
                onClick={() => alCambiar({ ...valor, contratos: null })}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                  todos ? "bg-ink text-white" : "border border-mist-deep text-ink-soft hover:border-ink"
                }`}
              >
                Todos, también los que se creen
              </button>
            )}
            <button
              type="button"
              disabled={deshabilitado}
              aria-pressed={!todos}
              onClick={() => alCambiar({ ...valor, contratos: valor.contratos ?? [] })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                !todos ? "bg-ink text-white" : "border border-mist-deep text-ink-soft hover:border-ink"
              }`}
            >
              Solo algunos
            </button>
          </div>

          {!todos && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {datos.contratos.length === 0 && (
                <li className="text-sm text-ink-soft">No hay contratos que puedas dar.</li>
              )}
              {datos.contratos.map((c) => {
                const marcado = valor.contratos!.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-mist-deep px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={deshabilitado}
                        onChange={(e) =>
                          alCambiar({
                            ...valor,
                            contratos: e.target.checked
                              ? [...valor.contratos!, c.id]
                              : valor.contratos!.filter((x) => x !== c.id),
                          })
                        }
                        className="h-4 w-4 accent-cyan"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-ink">{c.id}</span>
                        <span className="block truncate text-xs text-ink-soft">{c.nombre}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

