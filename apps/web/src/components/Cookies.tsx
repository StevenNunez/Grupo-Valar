"use client";

import { useEffect, useState } from "react";

/**
 * Preferencias sobre cookies.
 *
 * Hoy el sitio usa solo almacenamiento técnico (recordar que ya viste la intro
 * en esta sesión y esta misma elección), que es necesario para que funcione y no
 * requiere consentimiento. No hay cookies de estadísticas ni de publicidad. El
 * panel igual deja la decisión guardada —`valar-cookies` en el navegador— para
 * que, el día que se agregue una medición, solo cargue si la persona la aceptó:
 * quien la agregue debe leer `cookiesEstadisticasAceptadas()` antes de cargarla.
 */

const CLAVE = "valar-cookies";
export const ABRIR = "valar-abrir-cookies";

type Eleccion = { estadisticas: boolean; fecha: string };

function leer(): Eleccion | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    return v && typeof v.estadisticas === "boolean" ? v : null;
  } catch {
    return null;
  }
}

/** Para quien agregue una medición: solo cargarla si esto es `true`. */
export function cookiesEstadisticasAceptadas() {
  return leer()?.estadisticas === true;
}

export function abrirPreferenciasDeCookies() {
  window.dispatchEvent(new Event(ABRIR));
}

export function Cookies() {
  const [aviso, setAviso] = useState(false);
  const [panel, setPanel] = useState(false);
  const [estadisticas, setEstadisticas] = useState(false);

  useEffect(() => {
    if (!leer()) setAviso(true);
    const abrir = () => {
      setEstadisticas(leer()?.estadisticas ?? false);
      setPanel(true);
    };
    window.addEventListener(ABRIR, abrir);
    return () => window.removeEventListener(ABRIR, abrir);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const cerrarConEsc = (e: KeyboardEvent) => e.key === "Escape" && setPanel(false);
    window.addEventListener("keydown", cerrarConEsc);
    return () => window.removeEventListener("keydown", cerrarConEsc);
  }, [panel]);

  function guardar(aceptaEstadisticas: boolean) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ estadisticas: aceptaEstadisticas, fecha: new Date().toISOString() }));
    } catch {
      // Sin almacenamiento (navegación privada): la elección vale solo hasta cerrar la página.
    }
    setAviso(false);
    setPanel(false);
  }

  return (
    <>
      {aviso && !panel && (
        <div
          role="region"
          aria-label="Aviso de cookies"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-mist-deep bg-white p-5 shadow-[0_18px_50px_-12px_rgba(31,33,36,0.35)] sm:bottom-5 sm:p-6"
        >
          <p className="text-sm leading-relaxed text-ink-soft">
            Este sitio usa solo almacenamiento técnico, necesario para que funcione. No usamos cookies de publicidad
            ni de seguimiento. Puedes revisar y cambiar tus preferencias cuando quieras.{" "}
            <a href="/cookies/" className="font-semibold text-cyan-deep underline underline-offset-2">
              Más información
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => guardar(false)}
              className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
            >
              Entendido
            </button>
            <button
              type="button"
              onClick={() => {
                setEstadisticas(false);
                setPanel(true);
              }}
              className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Preferencias
            </button>
          </div>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/60 p-3 sm:items-center" onClick={() => setPanel(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookies-titulo"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
          >
            <h2 id="cookies-titulo" className="font-display text-xl font-semibold text-ink">
              Preferencias sobre cookies
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Elige qué almacenamiento permites. Tu elección se guarda en este navegador.
            </p>

            <div className="mt-6 space-y-4">
              <Opcion titulo="Necesarias" fija descripcion="Permiten que el sitio funcione: recordar que ya viste la intro en esta visita y guardar esta misma elección. No se pueden desactivar." activa />
              <Opcion
                titulo="Estadísticas"
                descripcion="Medirían cuántas personas visitan el sitio y qué secciones leen. Hoy no usamos ninguna: si algún día la agregamos, solo se activará si la aceptas aquí."
                activa={estadisticas}
                alCambiar={setEstadisticas}
              />
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => guardar(estadisticas)}
                className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
              >
                Guardar preferencias
              </button>
              <button
                type="button"
                onClick={() => setPanel(false)}
                className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
              >
                Cancelar
              </button>
            </div>
            <p className="mt-5 text-xs text-ink-soft/80">
              Detalle en la{" "}
              <a href="/cookies/" className="underline underline-offset-2">
                política de cookies
              </a>{" "}
              y en la{" "}
              <a href="/privacidad/" className="underline underline-offset-2">
                política de privacidad
              </a>
              .
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Opcion({
  titulo,
  descripcion,
  activa,
  fija,
  alCambiar,
}: {
  titulo: string;
  descripcion: string;
  activa: boolean;
  fija?: boolean;
  alCambiar?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-xl border border-mist p-4">
      <div>
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{descripcion}</p>
      </div>
      {fija ? (
        <span className="shrink-0 rounded-full bg-mist px-3 py-1 text-xs font-semibold text-ink-soft">Siempre activas</span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={activa}
          aria-label={titulo}
          onClick={() => alCambiar?.(!activa)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${activa ? "bg-cyan" : "bg-mist-deep"}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${activa ? "translate-x-5" : ""}`} />
        </button>
      )}
    </div>
  );
}
