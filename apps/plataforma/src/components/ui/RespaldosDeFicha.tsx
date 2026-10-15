"use client";

import { useEffect, useState } from "react";
import { cargarAdjuntos, enlaceDeAdjunto, EVENTO_RESPALDOS, formatearPeso, type Adjunto } from "@/lib/adjuntos";

/**
 * Los respaldos de un registro, a la vista en su ficha: qué archivo está
 * asociado, con "Ver adjunto" y "Descargar" a un clic, sin entrar al diálogo de
 * adjuntos. Se refresca solo cuando se sube o se borra un respaldo.
 */
export function RespaldosDeFicha({ tabla, registroId }: { tabla: string; registroId: string }) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () => {
      cargarAdjuntos(tabla, registroId)
        .then((a) => {
          if (!vigente) return;
          setAdjuntos(a);
          setError(null);
        })
        .catch((e) => {
          if (vigente) setError(e instanceof Error ? e.message : String(e));
        });
    };
    cargar();
    window.addEventListener(EVENTO_RESPALDOS, cargar);
    return () => {
      vigente = false;
      window.removeEventListener(EVENTO_RESPALDOS, cargar);
    };
  }, [tabla, registroId]);

  async function abrir(adjunto: Adjunto, descargar: boolean) {
    setError(null);
    /* Para ver, la pestaña se abre en el clic y se llena después: así el
       navegador no la toma por una ventana emergente. */
    const ventana = descargar ? null : window.open("", "_blank");
    try {
      const url = await enlaceDeAdjunto(adjunto, descargar);
      if (ventana) ventana.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      ventana?.close();
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (adjuntos === null && !error) return null;

  return (
    <div className="mt-3 border-t border-mist pt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Documentos adjuntos</p>
      {error && <p role="alert" className="mt-1.5 text-xs text-[#a52f24]">{error}</p>}
      {adjuntos && adjuntos.length === 0 && (
        <p className="mt-1.5 text-xs text-ink-soft">Todavía no hay documentos adjuntos.</p>
      )}
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {(adjuntos ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist/50 px-3 py-2 text-xs">
            <span className="min-w-0 truncate font-semibold text-ink" title={a.nombre}>
              {a.nombre} <span className="font-normal text-ink-soft">· {formatearPeso(a.tamano)}</span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button type="button" onClick={() => void abrir(a, false)} className="rounded-full border border-mist-deep bg-white px-3 py-1 font-semibold text-ink hover:border-ink">
                Ver adjunto
              </button>
              <button type="button" onClick={() => void abrir(a, true)} className="rounded-full border border-mist-deep bg-white px-3 py-1 font-semibold text-ink hover:border-ink">
                Descargar
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
