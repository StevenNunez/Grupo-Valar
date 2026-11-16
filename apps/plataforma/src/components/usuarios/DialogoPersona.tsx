"use client";

import { useState } from "react";
import { Dialogo } from "../ui/Formulario";
import { Filtro } from "../ui/Vista";
import { mensajeParaPersona } from "@/lib/errores";
import type { Usuario as Yo } from "@/lib/sesion";
import {
  cambiarCargo,
  cambiarGeneral,
  cambiarNombre,
  guardarAcceso,
  quitarAcceso,
  type Modulo,
  type Persona,
} from "@/lib/usuarios";
import { Aviso, borradorDe, puedoDarTodos, tituloGeneral, type Borrador, type Datos } from "./comunes";
import { EditorAcceso } from "./EditorAcceso";

/* ── El acceso de una persona ─────────────────────────────────────────────── */

export function DialogoPersona({
  persona,
  datos,
  yo,
  misModulos,
  alCerrar,
  alGuardado,
}: {
  persona: Persona;
  datos: Datos;
  yo: Yo;
  misModulos: Modulo[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  /* Sin esto, guardar no mostraba nada y parecía que no había pasado: el
     cambio quedaba en la base, pero nadie se enteraba. */
  const [guardado, setGuardado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const soyYo = persona.id === yo.id;
  const general = yo.general !== null;
  const [nombre, setNombre] = useState(persona.nombre);
  const [rol, setRol] = useState(persona.rol);

  const [borradores, setBorradores] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(
      misModulos.map((m) => [
        m.id,
        borradorDe(datos.accesos.find((a) => a.usuarioId === persona.id && a.moduloId === m.id)),
      ]),
    ),
  );

  async function hacer(accion: () => Promise<void>, aviso = "Guardado.") {
    setError(null);
    setGuardado(null);
    setOcupado(true);
    try {
      await accion();
      setGuardado(aviso);
      alGuardado();
    } catch (e) {
      setError(mensajeParaPersona(e, "VistaUsuarios"));
    } finally {
      setOcupado(false);
    }
  }

  async function guardarModulo(modulo: string) {
    const b = borradores[modulo];
    const habia = datos.accesos.some((a) => a.usuarioId === persona.id && a.moduloId === modulo);
    await hacer(async () => {
      if (b.nivel === null) {
        if (habia) await quitarAcceso(persona.id, modulo);
        return;
      }
      await guardarAcceso({
        usuarioId: persona.id,
        moduloId: modulo,
        nivel: b.nivel,
        permisos: b.permisos,
        contratos: b.contratos,
      });
    }, `${moduloTitulo(modulo)} guardado. ${persona.nombre} lo ve apenas vuelva a la pestaña o recargue la página.`);
  }

  const moduloTitulo = (id: string) => misModulos.find((m) => m.id === id)?.titulo ?? id;

  const opcionesGeneral: { id: "ninguno" | "administrador" | "soporte"; titulo: string }[] = [
    { id: "ninguno", titulo: "Por módulo" },
    { id: "administrador", titulo: "Administrador general" },
    ...(yo.general === "soporte" ? [{ id: "soporte" as const, titulo: "Soporte" }] : []),
  ];

  return (
    <Dialogo
      titulo={`Accesos de ${persona.nombre}`}
      descripcion={`${persona.cargo || "Sin cargo"}. El cargo es un título; lo que puede hacer lo decide su acceso a cada módulo.`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      <div className="max-h-[66vh] overflow-y-auto px-6 py-6">
        <Aviso texto={error} />
        {guardado && (
          <p role="status" className="mb-4 rounded-xl bg-exito-suave px-4 py-3 text-sm font-medium text-exito">
            {guardado}
          </p>
        )}

        {soyYo && (
          <p className="mb-5 rounded-xl bg-alerta-suave px-4 py-3 text-sm text-alerta">
            No puedes cambiar tu propio acceso: es la forma más corta de quedarse fuera, o de darse
            más. Pídeselo a otro administrador.
          </p>
        )}

        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Datos de la persona</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-semibold text-ink-soft">
              Nombre
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={ocupado}
                className="mt-1 w-full rounded-lg border border-mist-deep bg-white px-3 py-2 text-sm font-normal text-ink"
              />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              Cargo
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                disabled={ocupado}
                className="mt-1 w-full rounded-lg border border-mist-deep bg-white px-3 py-2 text-sm font-normal text-ink"
              >
                {datos.cargos
                  .filter((c) => c.activo || c.id === persona.rol)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titulo}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={ocupado || !nombre.trim() || (nombre.trim() === persona.nombre && rol === persona.rol)}
              onClick={() =>
                void hacer(async () => {
                  if (nombre.trim() !== persona.nombre) await cambiarNombre(persona.id, nombre);
                  if (rol !== persona.rol) await cambiarCargo(persona.id, rol);
                }, "Datos guardados.")
              }
              className="rounded-full bg-cyan-deep px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-50"
            >
              Guardar datos
            </button>
          </div>
        </section>

        {general && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Acceso general
            </h3>
            <div className="mt-3">
              <Filtro
                etiqueta="Acceso general"
                opciones={opcionesGeneral}
                valor={persona.general ?? "ninguno"}
                alCambiar={(v) => {
                  if (soyYo || ocupado) return;
                  void hacer(() => cambiarGeneral(persona.id, v === "ninguno" ? null : v));
                }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              El Administrador general ve y hace todo, en todos los módulos.
              {yo.general === "soporte" && " Soporte además entra a todas las empresas."}
            </p>
          </section>
        )}

        {persona.general ? (
          <p className="rounded-xl border border-mist-deep px-4 py-3 text-sm text-ink-soft">
            Como {tituloGeneral(persona.general)} ve y hace todo: los accesos por módulo no aplican.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {misModulos.map((m) => (
              <section key={m.id} className="rounded-2xl border border-mist-deep p-5">
                <EditorAcceso
                  modulo={m}
                  datos={datos}
                  puedeTodos={puedoDarTodos(yo, datos, m.id)}
                  valor={borradores[m.id]}
                  deshabilitado={soyYo || ocupado}
                  alCambiar={(b) => setBorradores((x) => ({ ...x, [m.id]: b }))}
                />
                {!soyYo && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void guardarModulo(m.id)}
                      className="rounded-full bg-cyan-deep px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-60"
                    >
                      {ocupado ? "Guardando…" : `Guardar ${m.titulo}`}
                    </button>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-mist px-6 py-5">
        <button
          type="button"
          onClick={alCerrar}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Cerrar
        </button>
      </div>
    </Dialogo>
  );
}

