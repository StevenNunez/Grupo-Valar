"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarraSuperior } from "./BarraSuperior";
import { FirmaTeoLabs } from "./FirmaTeoLabs";
import { IconoSeccion } from "./IconoSeccion";
import { Logo } from "./Logo";
import {
  esSubseccionActiva,
  rutaVedada,
  seccionDe,
  seccionesVisibles,
  type Seccion,
} from "@/lib/secciones";
import { entraDirecto } from "@/lib/modulos";
import { administra, entraA, puede, useUsuario } from "@/lib/sesion";

/**
 * Marco de un módulo: barra lateral con sus secciones y, colgando de las que
 * tienen varias vistas, sus subsecciones.
 *
 * La barra lateral vive acá y no en /modulos/ a propósito: el índice de módulos
 * es un lanzador, y las tarjetas ya dicen a dónde llevan.
 */
export function MarcoModulo({
  modulo,
  titulo,
  secciones: todas,
  children,
}: {
  /** El id de `lib/modulos`: con él se sabe si la persona entra. */
  modulo: string;
  titulo: string;
  /** El menú del módulo. Cada uno trae el suyo desde `lib/secciones`. */
  secciones: Seccion[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const usuario = useUsuario();
  const ve = (permiso: string) => puede(usuario, permiso);
  // El menú muestra solo lo que la persona ve. Es comodidad: el muro es el RLS.
  const secciones = seccionesVisibles(todas, ve);
  const sinAcceso = !entraA(usuario, modulo)
    ? "No tienes acceso a este módulo."
    : rutaVedada(todas, pathname, ve)
      ? "No tienes acceso a esta sección."
      : null;
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Qué sección se desplegó a mano. `null` = manda la que esté activa.
  const [desplegada, setDesplegada] = useState<string | null>(null);
  const seccion = seccionDe(secciones, pathname);

  useEffect(() => {
    document.body.style.overflow = menuAbierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAbierto]);

  return (
    <div className="min-h-svh bg-mist/40 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col bg-ink text-white transition-transform duration-300 lg:sticky lg:top-0 lg:h-svh lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-17 items-center justify-between border-b border-white/10 px-6">
          <Link
            href="/modulos/"
            onClick={() => setMenuAbierto(false)}
            className="text-[21px]"
          >
            <Logo />
          </Link>
          <button
            type="button"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
            className="-mr-2 p-2 text-white/70 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label={titulo}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            {titulo}
          </p>

          <ul className="mt-4 flex flex-col gap-1">
            {secciones.map((s) => (
              <EntradaSeccion
                key={s.id}
                seccion={s}
                activa={seccion?.id === s.id}
                pathname={pathname}
                desplegada={desplegada === null ? seccion?.id === s.id : desplegada === s.id}
                alDesplegar={() => setDesplegada(desplegada === s.id ? "" : s.id)}
                alNavegar={() => {
                  setMenuAbierto(false);
                  setDesplegada(null);
                }}
              />
            ))}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-6 py-5">
          {/* Quien entra a un solo módulo y no administra no tiene adónde
              volver: /modulos/ lo mandaría de vuelta acá. Ver `lib/modulos`. */}
          {/* El administrador de un módulo maneja su gente desde acá: si entra
              directo, no pasa por el índice donde está el otro enlace. */}
          {administra(usuario, modulo) && (
            <Link
              href="/usuarios/"
              onClick={() => setMenuAbierto(false)}
              className="mb-3 flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 8.5h5M18.5 6v5" strokeLinecap="round" />
              </svg>
              {usuario.general ? "Usuarios y accesos" : `Usuarios de ${titulo}`}
            </Link>
          )}

          {!entraDirecto(usuario) && (
            <Link
              href="/modulos/"
              onClick={() => setMenuAbierto(false)}
              className="mb-4 inline-flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Todos los módulos
            </Link>
          )}

          {/* La firma va al pie de la barra, como en el sitio público. Sobre el
              fondo oscuro el gradiente del logo se lee bien; el "Desarrollado
              por" va en blanco tenue para no competir con el menú. */}
          <div>
            <FirmaTeoLabs tono="text-white/45" />
          </div>
        </div>
      </aside>

      {menuAbierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuAbierto(false)}
          className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-col">
        <BarraSuperior
          izquierda={
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
              className="-ml-2 p-2 text-ink lg:hidden"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="round" />
              </svg>
            </button>
          }
        />

        <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-6xl">
            {sinAcceso ? (
              <div className="rounded-2xl border border-mist-deep bg-white px-6 py-10 text-center">
                <p className="font-display text-xl font-semibold text-ink">{sinAcceso}</p>
                <p className="mt-2 text-sm text-ink-soft">
                  Si la necesitas, pídesela al administrador de {titulo}.
                </p>
                <Link
                  href={entraDirecto(usuario) ?? "/modulos/"}
                  className="mt-6 inline-flex rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  Volver al inicio
                </Link>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Una sección del menú y, si tiene, sus subsecciones.
 *
 * La sección se pinta en cyan solo cuando no tiene subsecciones: si las tiene,
 * el cyan se lo lleva la subsección abierta y la sección queda en blanco. Así
 * el color marca siempre un único lugar, el que se está viendo.
 */
function EntradaSeccion({
  seccion,
  activa,
  pathname,
  desplegada,
  alDesplegar,
  alNavegar,
}: {
  seccion: Seccion;
  activa: boolean;
  pathname: string;
  desplegada: boolean;
  alDesplegar: () => void;
  alNavegar: () => void;
}) {
  const tieneHijas = !!seccion.subsecciones?.length;
  const resaltada = activa && !tieneHijas;

  return (
    <li>
      <div className="flex items-center">
        <Link
          href={seccion.href}
          onClick={alNavegar}
          aria-current={resaltada ? "page" : undefined}
          className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
            resaltada
              ? "bg-cyan font-semibold text-white"
              : activa
                ? "font-semibold text-white"
                : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          <IconoSeccion icono={seccion.icono} className="h-5 w-5 shrink-0" />
          {seccion.titulo}
        </Link>

        {tieneHijas && (
          <button
            type="button"
            onClick={alDesplegar}
            aria-expanded={desplegada}
            aria-label={`${desplegada ? "Contraer" : "Desplegar"} ${seccion.titulo}`}
            className="ml-1 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
              className={`transition-transform duration-200 ${desplegada ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {tieneHijas && desplegada && (
        /* La línea vertical hace de sangría visual: deja claro que lo de abajo
           cuelga de la sección y no es otra sección más. */
        <ul className="ml-[1.42rem] mt-1 flex flex-col gap-0.5 border-l border-white/12 pl-3">
          {seccion.subsecciones!.map((sub) => {
            const activaSub = esSubseccionActiva(pathname, sub.href);
            return (
              <li key={sub.href}>
                <Link
                  href={sub.href}
                  onClick={alNavegar}
                  aria-current={activaSub ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-[13px] transition-colors ${
                    activaSub
                      ? "bg-cyan font-semibold text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {sub.titulo}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
