"use client";

import { useEffect, useState } from "react";
import { activarAvisos, esAppInstalada, esIos, pushSoportado, registrarServiceWorker } from "@/lib/push";
import { useUsuario } from "@/lib/sesion";

type EventoInstalacion = Event & { prompt: () => Promise<void> };

/**
 * La primera vez que alguien entra (por persona y por dispositivo) se le explica
 * qué son los avisos y se le deja prepararlos ahí mismo: instalar la app y
 * activar las notificaciones. Si dice «Ahora no», no vuelve a aparecer: la
 * campana de la barra superior tiene los mismos botones cuando los quiera.
 *
 * No aparece si ya tiene los avisos activos en este dispositivo, ni en un
 * navegador que no los permite (salvo iPhone, donde primero hay que instalar la
 * app y se le explica cómo).
 */
export function BienvenidaAvisos() {
  const usuario = useUsuario();
  const clave = `valar:bienvenida-avisos:${usuario.id}`;
  const [visible, setVisible] = useState(false);
  const [instalable, setInstalable] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(true);
  const [ocupada, setOcupada] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ios = esIos();

  useEffect(() => {
    let vigente = true;
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setInstalable(e as EventoInstalacion);
    };
    window.addEventListener("beforeinstallprompt", alOfrecer);

    (async () => {
      let visto = false;
      try {
        visto = window.localStorage.getItem(clave) === "1";
      } catch {
        /* Sin almacenamiento: se muestra, y como mucho se repite. */
      }
      if (visto) return;
      const ya = typeof Notification !== "undefined" && Notification.permission === "granted";
      if (ya) {
        const reg = await registrarServiceWorker();
        if (await reg?.pushManager.getSubscription()) return;
      }
      // iPhone sin instalar: no hay push todavía, pero sí hay algo que explicar.
      if (!pushSoportado() && !ios) return;
      if (vigente) {
        setInstalada(esAppInstalada());
        setVisible(true);
      }
    })();

    return () => {
      vigente = false;
      window.removeEventListener("beforeinstallprompt", alOfrecer);
    };
  }, [clave, ios]);

  function cerrar() {
    try {
      window.localStorage.setItem(clave, "1");
    } catch {
      /* Da igual: solo evita repetirlo. */
    }
    setVisible(false);
  }

  async function activar() {
    setOcupada(true);
    setError(null);
    const fallo = await activarAvisos();
    setOcupada(false);
    if (fallo) setError(fallo);
    else setListo(true);
  }

  async function instalar() {
    if (!instalable) return;
    await instalable.prompt();
    setInstalable(null);
  }

  if (!visible) return null;

  const primerNombre = usuario.nombre.split(" ")[0];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-end bg-ink/50 p-3 sm:place-items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="bienvenida-titulo">
      <div className="max-h-[92svh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-cyan/10 text-cyan-deep" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </div>

        <h2 id="bienvenida-titulo" className="mt-4 font-display text-xl font-semibold text-ink">
          Hola, {primerNombre}: activa tus avisos
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          La plataforma te avisa cuando algo espera por ti, aunque no la tengas abierta: una solicitud por aprobar,
          una aprobada que hay que cotizar, o una que sigue sin resolverse.
        </p>

        <ul className="mt-4 space-y-3 text-sm text-ink">
          <li className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">1</span>
            <span>
              <strong>La campana</strong> de arriba guarda todos tus avisos. Los que no has leído llevan un número rojo.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">2</span>
            <span>
              <strong>Las notificaciones</strong> llegan al teléfono o al computador. Si algo es urgente o vence hoy, te lo
              vuelve a recordar cada pocas horas, solo de 8:00 a 20:00.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">3</span>
            <span>
              <strong>Instala la app</strong> para tenerla como una aplicación más, con su ícono.
              {ios && !instalada && (
                <>
                  {" "}
                  En iPhone: toca <strong>Compartir</strong> → <strong>Agregar a inicio</strong> y abre Valar desde ese ícono;
                  después activa los avisos desde la campana.
                </>
              )}
            </span>
          </li>
        </ul>

        {listo ? (
          <p role="status" className="mt-5 rounded-xl bg-exito-suave px-4 py-3 text-sm font-medium text-exito">
            ✓ Listo: los avisos quedaron activados en este dispositivo.
          </p>
        ) : (
          error && (
            <p role="alert" className="mt-5 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
              {error}
            </p>
          )
        )}

        <div className="mt-6 flex flex-col gap-2">
          {!listo && pushSoportado() && (
            <button
              type="button"
              disabled={ocupada}
              onClick={() => void activar()}
              className="rounded-full bg-cyan-deep px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-50"
            >
              {ocupada ? "Activando…" : "Activar avisos en este dispositivo"}
            </button>
          )}
          {!instalada && instalable && (
            <button
              type="button"
              onClick={() => void instalar()}
              className="rounded-full border border-ink/20 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink"
            >
              Instalar la app
            </button>
          )}
          <button
            type="button"
            onClick={cerrar}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            {listo ? "Entendido" : "Ahora no"}
          </button>
        </div>
        {!listo && (
          <p className="mt-1 text-center text-xs text-ink-soft">Lo puedes hacer después desde la campana de arriba.</p>
        )}
      </div>
    </div>
  );
}
