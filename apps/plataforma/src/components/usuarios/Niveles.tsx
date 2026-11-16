"use client";

import { useState } from "react";
import { Panel } from "../ui/Vista";
import { mensajeParaPersona } from "@/lib/errores";
import { cambiarNivelPermiso, tituloNivel } from "@/lib/usuarios";
import { Aviso, type Comunes } from "./comunes";
import { Switch } from "./Switch";

/* ── Niveles: lo que trae cada uno de fábrica ─────────────────────────────── */

export function Niveles({ datos, filtros, alGuardado }: Comunes) {
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alternar(nivel: "usuario" | "visualizador", permiso: string, si: boolean) {
    setError(null);
    setGuardando(`${nivel}|${permiso}`);
    try {
      await cambiarNivelPermiso(nivel, permiso, si);
      alGuardado();
    } catch (e) {
      setError(mensajeParaPersona(e, "VistaUsuarios"));
    } finally {
      setGuardando(null);
    }
  }

  return (
    <Panel
      titulo="Qué trae cada nivel"
      nota="Lo que viene de fábrica al dar Usuario o Visualizador. Administrador tiene todo el módulo; Personalizado parte de cero. Cambiarlo afecta a todos los que tengan ese nivel."
      filtros={filtros}
    >
      <div className="px-6 py-6 lg:px-8">
        <Aviso texto={error} />
        <div className="flex flex-col gap-8">
          {datos.modulos.map((m) => (
            <section key={m.id}>
              <h3 className="font-display text-lg font-semibold text-ink">{m.titulo}</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-ink-soft">
                      <th className="py-2 font-semibold">Permiso</th>
                      <th className="w-28 py-2 text-center font-semibold">Usuario</th>
                      <th className="w-28 py-2 text-center font-semibold">Visualizador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.permisos
                      .filter((p) => p.moduloId === m.id)
                      .map((p) => (
                        <tr key={p.id} className="border-t border-mist">
                          <td className="py-2.5 pr-4 text-ink">{p.titulo}</td>
                          {(["usuario", "visualizador"] as const).map((n) => (
                            <td key={n} className="py-2.5 text-center">
                              {n === "visualizador" && !p.lectura ? (
                                <span className="text-ink-soft">—</span>
                              ) : (
                                <span className="inline-flex">
                                  <Switch
                                    marcado={datos.nivelPermisos.has(`${n}|${p.id}`)}
                                    ocupado={guardando === `${n}|${p.id}`}
                                    etiqueta={`${p.titulo} para ${tituloNivel(n)}`}
                                    alCambiar={(v) => void alternar(n, p.id, v)}
                                  />
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </Panel>
  );
}

