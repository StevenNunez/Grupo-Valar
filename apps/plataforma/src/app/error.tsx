"use client";

import { useEffect } from "react";

/**
 * Pantalla de error de toda la plataforma.
 *
 * El caso más común no es un fallo del código sino un deploy nuevo: quien tenía la
 * pestaña (o la app instalada) abierta sigue con archivos de la versión anterior, que
 * ya no existen en el servidor, y la página no carga. Recargar lo arregla, así que en
 * ese caso se recarga sola, una única vez (si el error persiste, se muestra el aviso
 * en vez de entrar en un bucle).
 */
const CLAVE = "valar:recarga-por-error";

function esVersionVieja(error: unknown): boolean {
  const texto = `${(error as Error | null)?.name ?? ""} ${(error as Error | null)?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(texto);
}

export default function ErrorDePagina({ error, retry }: { error: unknown; retry: () => void }) {
  const vieja = esVersionVieja(error);

  useEffect(() => {
    console.error(error);
    if (!vieja) return;
    try {
      const ultima = Number(window.sessionStorage.getItem(CLAVE) ?? 0);
      if (Date.now() - ultima < 60_000) return; // Ya se intentó hace poco: no repetir.
      window.sessionStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      /* Sin almacenamiento: mejor no recargar a ciegas. */
      return;
    }
    window.location.reload();
  }, [error, vieja]);

  return (
    <main className="grid min-h-[60svh] place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-mist-deep bg-white p-6 text-center shadow-sm">
        <h1 className="font-display text-lg font-semibold text-ink">
          {vieja ? "Hay una versión nueva" : "No pudimos cargar esta página"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {vieja
            ? "La plataforma se actualizó mientras la tenías abierta. Recarga para seguir."
            : "Puede ser algo pasajero. Reintenta y, si sigue igual, recarga la página."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
          >
            Recargar
          </button>
          {!vieja && (
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
