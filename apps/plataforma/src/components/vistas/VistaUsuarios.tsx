"use client";

import { useMemo, useState } from "react";
import { Chip, type Tono } from "../ui/Chip";
import { Combo } from "../ui/Combo";
import { CampoTexto, Campos, Dialogo, Pie, useFormulario } from "../ui/Formulario";
import { Tabla, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha } from "@/lib/formato";
import { administra, administraAlgo, useUsuario, type Usuario as Yo } from "@/lib/sesion";
import {
  cambiarCargo,
  cambiarGeneral,
  cambiarNivelPermiso,
  cancelarInvitacion,
  cargarAccesos,
  cargarCargos,
  cargarInvitaciones,
  cargarModulos,
  cargarNivelPermisos,
  cargarPermisos,
  cargarPersonas,
  efectivos,
  guardarAcceso,
  guardarCargo,
  invitar,
  niveles,
  quitarAcceso,
  tituloNivel,
  type Acceso,
  type Cargo,
  type General,
  type Invitacion,
  type Modulo,
  type Nivel,
  type Permiso,
  type Persona,
} from "@/lib/usuarios";

/**
 * Usuarios y accesos.
 *
 * EL CARGO Y EL ACCESO SON DOS COSAS. El cargo (Supervisor, Contador…) es un
 * título y no da permisos. El acceso se da módulo por módulo: Administrador,
 * Usuario, Visualizador o Personalizado, y con todos los contratos o solo
 * algunos. Ver la migración 0042.
 *
 * QUIÉN VE ESTA PANTALLA. El Administrador general la ve entera. El
 * administrador de un módulo ve a la gente y maneja el acceso SOLO a sus
 * módulos: las pestañas de cargos, niveles y "quién ve qué" no le aparecen,
 * y aunque las forzara, la base no lo deja escribir ahí.
 */

type Datos = {
  personas: Persona[];
  cargos: Cargo[];
  modulos: Modulo[];
  permisos: Permiso[];
  nivelPermisos: Set<string>;
  accesos: Acceso[];
  contratos: ContratoBreve[];
  invitaciones: Invitacion[];
};

async function cargar(): Promise<Datos> {
  const [personas, cargos, modulos, permisos, nivelPermisos, accesos, contratos, invitaciones] =
    await Promise.all([
      cargarPersonas(),
      cargarCargos(),
      cargarModulos(),
      cargarPermisos(),
      cargarNivelPermisos(),
      cargarAccesos(),
      /* Los contratos que ve QUIEN MIRA: son justo los que puede dar. Un
         administrador limitado a Carpas no ve los demás en la lista. */
      cargarContratosBreve(),
      cargarInvitaciones().catch(() => [] as Invitacion[]),
    ]);
  return { personas, cargos, modulos, permisos, nivelPermisos, accesos, contratos, invitaciones };
}

type Pestana = "personas" | "quien" | "cargos" | "niveles" | "invitaciones";

export function VistaUsuarios() {
  const yo = useUsuario();
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const [pestana, setPestana] = useState<Pestana>("personas");
  const [invitando, setInvitando] = useState(false);

  const general = yo.general !== null;

  // Quien no administra nada no tiene qué hacer acá (y la base no le dejaría).
  if (!administraAlgo(yo)) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-mist-deep bg-white px-6 py-10 text-center">
        <p className="font-display text-xl font-semibold text-ink">Esta pantalla es de los administradores.</p>
        <p className="mt-2 text-sm text-ink-soft">
          Si necesitas más acceso, pídeselo al administrador de tu módulo.
        </p>
      </div>
    );
  }

  const pestanas: { id: Pestana; titulo: string }[] = [
    { id: "personas", titulo: "Personas" },
    ...(general
      ? ([
          { id: "quien", titulo: "Quién ve qué" },
          { id: "cargos", titulo: "Cargos" },
          { id: "niveles", titulo: "Niveles" },
        ] as const)
      : []),
    { id: "invitaciones", titulo: "Invitaciones" },
  ];
  const filtros = (
    <Filtro etiqueta="Vista" opciones={pestanas} valor={pestana} alCambiar={setPestana} />
  );

  return (
    <>
      <Encabezado
        titulo={general ? "Usuarios y accesos" : "Usuarios de mis módulos"}
        descripcion={
          general
            ? "Quién entra, a qué módulos y con qué nivel. El cargo es solo un título: lo que cada uno puede hacer lo decide su acceso."
            : "La gente de los módulos que administras. Puedes invitar, cambiar su nivel y elegir qué contratos ve."
        }
        acciones={
          <button
            type="button"
            onClick={() => setInvitando(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Invitar
          </button>
        }
      />

      <Contenido consulta={estado}>
        {(datos) => {
          const misModulos = datos.modulos.filter((m) => administra(yo, m.id));
          const generales = datos.personas.filter((p) => p.general !== null).length;
          const comunes = { datos, yo, misModulos, filtros, alGuardado: recargar };

          return (
            <>
              <Resumen
                datos={[
                  {
                    etiqueta: general ? "Personas con cuenta" : "En mis módulos",
                    valor: String(
                      general
                        ? datos.personas.length
                        : new Set(
                            datos.accesos
                              .filter((a) => misModulos.some((m) => m.id === a.moduloId))
                              .map((a) => a.usuarioId),
                          ).size,
                    ),
                    nota: `${datos.cargos.filter((c) => c.activo).length} cargos definidos`,
                  },
                  {
                    etiqueta: "Administradores generales",
                    valor: String(generales),
                    nota: "Ven y hacen todo",
                    acento: generales === 0 ? "critico" : undefined,
                  },
                  {
                    etiqueta: "Invitaciones vivas",
                    valor: String(datos.invitaciones.filter((i) => i.estado === "enviada").length),
                    nota: "Esperando que las acepten",
                  },
                ]}
              />

              {pestana === "personas" && <Personas {...comunes} />}
              {pestana === "quien" && general && <QuienVeQue {...comunes} />}
              {pestana === "cargos" && general && <Cargos {...comunes} />}
              {pestana === "niveles" && general && <Niveles {...comunes} />}
              {pestana === "invitaciones" && <Invitaciones {...comunes} />}

              {invitando && (
                <DialogoInvitar
                  {...comunes}
                  alCerrar={() => setInvitando(false)}
                  alGuardado={() => {
                    setInvitando(false);
                    recargar();
                  }}
                />
              )}
            </>
          );
        }}
      </Contenido>
    </>
  );
}

type Comunes = {
  datos: Datos;
  yo: Yo;
  misModulos: Modulo[];
  filtros: React.ReactNode;
  alGuardado: () => void;
};

function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]">
      {texto}
    </p>
  );
}

const tituloGeneral = (g: General) => (g === "soporte" ? "Soporte" : "Administrador general");

/** "Todos los contratos" o "C-TORRES, C-MISC". */
function textoContratos(contratos: string[] | null) {
  if (contratos === null) return "Todos los contratos";
  if (contratos.length === 0) return "Ningún contrato";
  return contratos.length <= 3 ? contratos.join(", ") : `${contratos.length} contratos`;
}

/* ── Personas ─────────────────────────────────────────────────────────────── */

function Personas({ datos, yo, misModulos, filtros, alGuardado }: Comunes) {
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
      setError(e instanceof Error ? e.message : String(e));
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

/* ── El acceso de una persona ─────────────────────────────────────────────── */

type Borrador = { nivel: Nivel | null; permisos: string[]; contratos: string[] | null };

const sinAcceso: Borrador = { nivel: null, permisos: [], contratos: null };

function borradorDe(acceso: Acceso | undefined): Borrador {
  return acceso
    ? { nivel: acceso.nivel, permisos: acceso.permisos, contratos: acceso.contratos }
    : sinAcceso;
}

/** Si quien mira puede dar "todos los contratos" en ese módulo. */
function puedoDarTodos(yo: Yo, datos: Datos, modulo: string) {
  if (yo.general) return true;
  const mio = datos.accesos.find((a) => a.usuarioId === yo.id && a.moduloId === modulo);
  return mio?.contratos === null;
}

function DialogoPersona({
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
  const [ocupado, setOcupado] = useState(false);
  const soyYo = persona.id === yo.id;
  const general = yo.general !== null;

  const [borradores, setBorradores] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(
      misModulos.map((m) => [
        m.id,
        borradorDe(datos.accesos.find((a) => a.usuarioId === persona.id && a.moduloId === m.id)),
      ]),
    ),
  );

  async function hacer(accion: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      alGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    });
  }

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

        {soyYo && (
          <p className="mb-5 rounded-xl bg-[#fdf4e6] px-4 py-3 text-sm text-[#8a5a09]">
            No puedes cambiar tu propio acceso: es la forma más corta de quedarse fuera, o de darse
            más. Pídeselo a otro administrador.
          </p>
        )}

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
                      className="rounded-full bg-cyan px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-60"
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

/**
 * Nivel, switches y contratos de UN módulo. Lo usan el diálogo de la persona y
 * el de invitar: la regla es la misma en los dos lados.
 */
function EditorAcceso({
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
                        {incluido && <p className="text-[11px] text-ink-soft">Viene con {tituloNivel(nivel)}</p>}
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

/* ── Quién ve qué ─────────────────────────────────────────────────────────── */

function QuienVeQue({ datos, filtros }: Comunes) {
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

/* ── Cargos ───────────────────────────────────────────────────────────────── */

function Cargos({ datos, filtros, alGuardado }: Comunes) {
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
              className="rounded-full bg-cyan px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-deep"
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

/* ── Niveles: lo que trae cada uno de fábrica ─────────────────────────────── */

function Niveles({ datos, filtros, alGuardado }: Comunes) {
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alternar(nivel: "usuario" | "visualizador", permiso: string, si: boolean) {
    setError(null);
    setGuardando(`${nivel}|${permiso}`);
    try {
      await cambiarNivelPermiso(nivel, permiso, si);
      alGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

/* ── Invitaciones ─────────────────────────────────────────────────────────── */

const tonos: Record<Invitacion["estado"], Tono> = {
  enviada: "info",
  aceptada: "bueno",
  expirada: "aviso",
  cancelada: "neutro",
};

function Invitaciones({ datos, filtros, alGuardado }: Comunes) {
  const [error, setError] = useState<string | null>(null);
  const cargos = new Map(datos.cargos.map((c) => [c.id, c.titulo]));
  const modulos = new Map(datos.modulos.map((m) => [m.id, m.titulo]));

  async function cancelar(id: string) {
    setError(null);
    try {
      await cancelarInvitacion(id);
      alGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const columnas: Columna<Invitacion>[] = [
    {
      clave: "correo",
      titulo: "Correo",
      encabezado: true,
      celda: (i) => (
        <>
          <span className="block font-semibold text-ink">{i.correo}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {[i.nombre, cargos.get(i.rol) ?? i.rol].filter(Boolean).join(" · ")}
          </span>
        </>
      ),
    },
    {
      clave: "acceso",
      titulo: "Acceso",
      celda: (i) => (
        <span className="text-sm text-ink-soft">
          {i.accesos.length === 0
            ? "—"
            : i.accesos
                .map((a) =>
                  a.general
                    ? tituloGeneral(a.general)
                    : `${modulos.get(a.modulo ?? "") ?? a.modulo} · ${a.nivel ? tituloNivel(a.nivel) : ""}`,
                )
                .join(" / ")}
        </span>
      ),
    },
    {
      clave: "enviada",
      titulo: "Enviada",
      celda: (i) => (
        <>
          <span className="block text-ink-soft">{formatearFecha(i.enviadaEn.slice(0, 10))}</span>
          {i.estado === "enviada" && (
            <span className="mt-0.5 block text-xs text-ink-soft">
              vence {formatearFecha(i.venceEn.slice(0, 10))}
            </span>
          )}
        </>
      ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      celda: (i) => <Chip tono={tonos[i.estado]}>{i.estado}</Chip>,
    },
    {
      clave: "acciones",
      titulo: "",
      derecha: true,
      celda: (i) =>
        i.estado === "enviada" ? (
          <button
            type="button"
            onClick={() => void cancelar(i.id)}
            className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Cancelar
          </button>
        ) : null,
    },
  ];

  return (
    <Panel
      titulo="Invitaciones"
      nota="Una invitación vive 7 días. Una puerta que no caduca queda abierta para siempre."
      filtros={filtros}
    >
      {error && (
        <div className="mx-6 mt-5 lg:mx-8">
          <Aviso texto={error} />
        </div>
      )}
      <Tabla
        columnas={columnas}
        filas={datos.invitaciones}
        claveDe={(i) => i.id}
        vacio="Todavía no se ha invitado a nadie."
      />
    </Panel>
  );
}

function DialogoInvitar({
  datos,
  yo,
  misModulos,
  alCerrar,
  alGuardado,
}: Comunes & { alCerrar: () => void }) {
  const cargosActivos = datos.cargos.filter((c) => c.activo);
  const f = useFormulario({
    correo: "",
    nombre: "",
    rol: cargosActivos.find((c) => c.id === "lectura")?.id ?? cargosActivos[0]?.id ?? "",
  });
  const [general, setGeneral] = useState<"ninguno" | "administrador" | "soporte">("ninguno");
  /* Por defecto entra como Usuario a los módulos del que invita, que es lo que
     se pidió: "usuario, por defecto a los módulos a invitar". Si el que invita
     está limitado a algunos contratos, parte sin ninguno elegido. */
  const [borradores, setBorradores] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(
      misModulos.map((m, i) => [
        m.id,
        i === 0 || misModulos.length === 1
          ? { nivel: "usuario" as Nivel, permisos: [], contratos: puedoDarTodos(yo, datos, m.id) ? null : [] }
          : sinAcceso,
      ]),
    ),
  );

  const conAcceso = useMemo(
    () => Object.entries(borradores).filter(([, b]) => b.nivel !== null),
    [borradores],
  );

  return (
    <Dialogo
      titulo="Invitar a alguien"
      descripcion="Le llega un correo con un enlace para entrar y poner su clave. La invitación vence en 7 días."
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          f.enviar(async () => {
            if (general === "ninguno" && conAcceso.length === 0) {
              throw new Error("Elige al menos un módulo al que entre.");
            }
            for (const [modulo, b] of conAcceso) {
              if (b.contratos !== null && b.contratos.length === 0) {
                const titulo = datos.modulos.find((m) => m.id === modulo)?.titulo;
                throw new Error(`En ${titulo}: elige al menos un contrato, o todos.`);
              }
            }
            await invitar({
              correo: f.datos.correo,
              nombre: f.datos.nombre,
              rol: f.datos.rol,
              general: general === "ninguno" ? null : general,
              accesos:
                general === "ninguno"
                  ? conAcceso.map(([modulo, b]) => ({
                      modulo,
                      nivel: b.nivel!,
                      permisos: b.permisos,
                      contratos: b.contratos,
                    }))
                  : [],
            });
          }, alGuardado);
        }}
      >
        <div className="max-h-[66vh] overflow-y-auto">
          <Campos>
            <CampoTexto
              etiqueta="Correo"
              requerido
              marcador="nombre@grupovalar.cl"
              ayuda="Ahí le llega el enlace de acceso."
              {...f.campo("correo")}
            />
            <CampoTexto etiqueta="Nombre" marcador="Eduardo Barra" {...f.campo("nombre")} />
            <Combo
              etiqueta="Cargo"
              requerido
              opciones={cargosActivos.map((c) => ({
                id: c.id,
                titulo: c.titulo,
                nota: c.descripcion ?? undefined,
              }))}
              valor={f.datos.rol}
              alCambiar={(v) => f.cambiar("rol", v)}
              ayuda="Es su título. Lo que puede hacer lo decide el acceso de abajo."
            />
          </Campos>

          <div className="flex flex-col gap-5 px-6 pb-6">
            {yo.general && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Acceso general
                </p>
                <div className="mt-2">
                  <Filtro
                    etiqueta="Acceso general"
                    opciones={[
                      { id: "ninguno" as const, titulo: "Por módulo" },
                      { id: "administrador" as const, titulo: "Administrador general" },
                      ...(yo.general === "soporte" ? [{ id: "soporte" as const, titulo: "Soporte" }] : []),
                    ]}
                    valor={general}
                    alCambiar={setGeneral}
                  />
                </div>
              </section>
            )}

            {general === "ninguno" &&
              misModulos.map((m) => (
                <section key={m.id} className="rounded-2xl border border-mist-deep p-5">
                  <EditorAcceso
                    modulo={m}
                    datos={datos}
                    puedeTodos={puedoDarTodos(yo, datos, m.id)}
                    valor={borradores[m.id]}
                    alCambiar={(b) => setBorradores((x) => ({ ...x, [m.id]: b }))}
                  />
                </section>
              ))}
          </div>
        </div>

        <Pie
          error={f.error}
          guardando={f.guardando}
          alCancelar={alCerrar}
          textoGuardar="Enviar invitación"
        />
      </form>
    </Dialogo>
  );
}

/* ── El switch ────────────────────────────────────────────────────────────── */

function Switch({
  marcado,
  ocupado,
  etiqueta,
  alCambiar,
}: {
  marcado: boolean;
  ocupado: boolean;
  etiqueta: string;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={marcado}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={() => alCambiar(!marcado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        marcado ? "bg-cyan" : "bg-mist-deep"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          marcado ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
