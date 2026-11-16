"use client";

import { useMemo, useState } from "react";
import { Boton } from "../ui/Boton";
import { Chip, type Tono } from "../ui/Chip";
import { Combo } from "../ui/Combo";
import { CampoTexto, Campos, Dialogo, Pie, useFormulario } from "../ui/Formulario";
import { Tabla, type Columna } from "../ui/Tabla";
import { Filtro, Panel } from "../ui/Vista";
import { mensajeParaPersona } from "@/lib/errores";
import { formatearFecha } from "@/lib/formato";
import { cancelarInvitacion, invitar, tituloNivel, type Invitacion, type Nivel } from "@/lib/usuarios";
import { Aviso, puedoDarTodos, sinAcceso, tituloGeneral, type Borrador, type Comunes } from "./comunes";
import { EditorAcceso } from "./EditorAcceso";

/* ── Invitaciones ─────────────────────────────────────────────────────────── */

const tonos: Record<Invitacion["estado"], Tono> = {
  enviada: "info",
  aceptada: "bueno",
  expirada: "aviso",
  cancelada: "neutro",
};

export function Invitaciones({ datos, filtros, alGuardado }: Comunes) {
  const [error, setError] = useState<string | null>(null);
  const cargos = new Map(datos.cargos.map((c) => [c.id, c.titulo]));
  const modulos = new Map(datos.modulos.map((m) => [m.id, m.titulo]));

  async function cancelar(id: string) {
    setError(null);
    try {
      await cancelarInvitacion(id);
      alGuardado();
    } catch (e) {
      setError(mensajeParaPersona(e, "VistaUsuarios"));
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
          <Boton variante="secundario" tamano="chico" onClick={() => cancelar(i.id)} trabajando="Cancelando…">
            Cancelar
          </Boton>
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

export function DialogoInvitar({
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
        /* Enter en un campo no envía: la invitación sale al correo de la persona,
           y quien la arma todavía está eligiendo módulos y permisos. Solo sale
           con el botón. */
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
            e.preventDefault();
          }
        }}
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

