"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProveedorUsuario, useSesion } from "@/lib/sesion";

/**
 * Resuelve la sesión una sola vez para todo el panel y la reparte por contexto.
 *
 * Es comodidad, no seguridad: evita mostrar pantallas vacías a quien no inició
 * sesión. Lo que protege los datos son las políticas RLS —aunque alguien se
 * salte esto, Postgres no le devuelve una sola fila.
 */
export function Guardia({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sesion = useSesion();

  useEffect(() => {
    if (sesion.estado === "sin-sesion") router.replace("/");
  }, [sesion.estado, router]);

  /* Mientras se confirma la sesión (solo la primera vez de la pestaña: después
     abre con el perfil guardado), el esqueleto del marco y no un cartel. */
  if (sesion.estado !== "con-sesion") return <EsqueletoDelMarco />;

  return <ProveedorUsuario value={sesion.usuario}>{children}</ProveedorUsuario>;
}

/** La forma de la plataforma —barra superior, menú lateral, tarjetas y tabla— en gris. */
function EsqueletoDelMarco() {
  return (
    <div className="min-h-svh bg-mist/30" aria-busy="true" aria-live="polite">
      <span className="sr-only">Abriendo la plataforma…</span>
      <div className="flex h-16 items-center justify-between border-b border-mist-deep bg-white px-4 sm:px-6">
        <div className="h-7 w-28 animate-pulse rounded-lg bg-mist" />
        <div className="h-9 w-9 animate-pulse rounded-full bg-mist" />
      </div>
      <div className="flex">
        <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r border-mist-deep bg-white p-5 lg:flex">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-xl bg-mist/70" />
          ))}
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-8">
          <div className="h-9 w-64 max-w-full animate-pulse rounded-lg bg-mist" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-mist/70" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-mist-deep bg-white" />
            ))}
          </div>
          <div className="mt-6 h-96 animate-pulse rounded-2xl border border-mist-deep bg-white" />
        </main>
      </div>
    </div>
  );
}
