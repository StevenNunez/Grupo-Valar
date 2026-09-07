"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { IconoModulo } from "./IconoModulo";
import { empresa } from "@/lib/empresa";
import { modulos } from "@/lib/modulos";
import { useSesion } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

/**
 * Marco de la plataforma: menú de módulos, barra superior y control de sesión.
 *
 * El guard de abajo es comodidad, no seguridad: evita mostrar un panel vacío a
 * quien no inició sesión. Lo que protege los datos son las políticas RLS de
 * Postgres —aunque alguien se salte esta pantalla, la base no le devuelve una
 * sola fila sin una sesión válida.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const sesion = useSesion();

  useEffect(() => {
    if (sesion.estado === "sin-sesion") router.replace("/");
  }, [sesion.estado, router]);

  useEffect(() => {
    document.body.style.overflow = menuAbierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAbierto]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  // Antes de saber si hay sesión no pintamos el contenido: evita el parpadeo de
  // la plataforma para quien va a terminar en el login.
  if (sesion.estado !== "con-sesion") {
    return (
      <div className="grid min-h-svh place-items-center bg-mist/40">
        <p className="text-sm text-ink-soft">Verificando sesión…</p>
      </div>
    );
  }

  const { usuario } = sesion;

  return (
    <div className="min-h-svh bg-mist/40 lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Menú lateral */}
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

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Módulos
          </p>
          <ul className="mt-4 flex flex-col gap-1">
            {modulos.map((m) => {
              const activo = m.activo && pathname.startsWith(m.href.replace(/\/$/, ""));

              if (!m.activo) {
                return (
                  <li key={m.id}>
                    <span
                      aria-disabled="true"
                      title="Módulo en preparación"
                      className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/30"
                    >
                      <IconoModulo icono={m.icono} className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{m.titulo}</span>
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        Pronto
                      </span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={m.id}>
                  <Link
                    href={m.href}
                    onClick={() => setMenuAbierto(false)}
                    aria-current={activo ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      activo
                        ? "bg-cyan text-white font-semibold"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <IconoModulo icono={m.icono} className="h-5 w-5 shrink-0" />
                    {m.titulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="text-xs text-white/40">
            Uso interno · {new Date().getFullYear()}
          </p>
          {/* Otro dominio: enlace normal, no `next/link`. */}
          <a
            href={empresa.sitioUrl}
            className="mt-2 inline-block text-xs text-white/60 transition-colors hover:text-white"
          >
            ← Ir al sitio público
          </a>
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

      {/* Columna de contenido */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-17 items-center justify-between gap-4 border-b border-mist-deep bg-white/90 px-5 backdrop-blur-md lg:px-10">
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

          <div className="flex min-w-0 flex-1 items-center justify-end gap-4">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold text-ink">{usuario.nombre}</p>
              <p className="truncate text-xs text-ink-soft">{usuario.cargo}</p>
            </div>
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan text-sm font-semibold text-white"
            >
              {usuario.iniciales}
            </span>
            <span className="hidden h-8 w-px bg-mist-deep sm:block" aria-hidden="true" />
            <button
              type="button"
              onClick={salir}
              className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Salir
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
