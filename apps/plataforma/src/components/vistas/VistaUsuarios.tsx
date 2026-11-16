"use client";

import { useState } from "react";
import { Cargos } from "../usuarios/Cargos";
import type { Datos } from "../usuarios/comunes";
import { DialogoInvitar, Invitaciones } from "../usuarios/Invitaciones";
import { Niveles } from "../usuarios/Niveles";
import { Personas } from "../usuarios/Personas";
import { QuienVeQue } from "../usuarios/QuienVeQue";
import { Contenido, Encabezado, Filtro, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve } from "@/lib/contratos";
import { administra, administraAlgo, useUsuario } from "@/lib/sesion";
import {
  cargarAccesos,
  cargarCargos,
  cargarInvitaciones,
  cargarModulos,
  cargarNivelPermisos,
  cargarPermisos,
  cargarPersonas,
  type Invitacion,
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
      cargarContratosBreve({ conOficina: true }),
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
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-deep px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo"
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

