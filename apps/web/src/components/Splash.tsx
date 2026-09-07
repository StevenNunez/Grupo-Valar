"use client";

import { useEffect, useRef, useState } from "react";
import { MARK_A, MARK_V, MARK_VIEWBOX } from "./Logo";

/** Tramos de la intro, en milisegundos. */
const LETTER_START = 1250; // cuándo empieza a escribirse VALAR
const LETTER_STEP = 150; // separación entre una letra y la siguiente
const DWELL = 2750; // desde que se pinta hasta que arranca la salida
const FLIGHT = 820; // el isotipo vuela hasta el logo del header
const FLIGHT_SOFT = 320; // con movimiento reducido no vuela: solo se funde

const LETRAS = [..."VALAR"];

/**
 * Intro de marca: fondo oscuro, la V entra desde arriba y la A (la misma V
 * invertida) desde abajo, se encajan al centro, aparece VALAR y el isotipo
 * viaja hasta su lugar en el header mientras se descubre la portada.
 *
 * Se muestra una vez por sesión. El contenido real de la página ya está en el
 * HTML detrás del velo, así que esto no afecta al SEO ni a los buscadores.
 */
export function Splash() {
  const [visible, setVisible] = useState(true);
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;

    // El script del layout ya decidió antes del primer pintado que no toca
    // (sesión repetida, o el sistema pide menos movimiento). El CSS la tiene
    // en `display:none` desde el principio, así que basta con no animar nada.
    if (root.classList.contains("splash-skip")) return;

    try {
      sessionStorage.setItem("valar-splash", "1");
    } catch {
      // Navegación privada con almacenamiento bloqueado: se verá cada vez.
    }

    root.classList.add("splash-running");
    window.scrollTo(0, 0);

    const abort = new AbortController();
    const timers: number[] = [];
    let closing = false;

    // Con movimiento reducido la marca aparece armada, sin viajes ni vuelo.
    // `?intro=1` es una petición explícita de verla entera, así que manda.
    const suave =
      !root.classList.contains("splash-force") &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    const exit = () => {
      if (closing) return;
      closing = true;

      // FLIP: medimos dónde está el isotipo ahora y dónde está el del header,
      // y lo mandamos exactamente ahí. Sin header medible, cae al fundido.
      const mark = markRef.current;
      const target = suave ? null : document.querySelector("[data-splash-target] svg");
      if (mark && target) {
        const from = mark.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        if (to.width > 0 && from.width > 0) {
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          mark.style.setProperty("--splash-fly-x", `${dx}px`);
          mark.style.setProperty("--splash-fly-y", `${dy}px`);
          mark.style.setProperty("--splash-fly-scale", `${to.width / from.width}`);
        }
      }

      root.classList.add("splash-out");
      timers.push(
        window.setTimeout(() => {
          abort.abort();
          root.classList.remove("splash-running", "splash-out");
          setVisible(false);
        }, suave ? FLIGHT_SOFT : FLIGHT),
      );
    };

    // La animación CSS arrancó al pintar, no al hidratar. Si React llegó tarde
    // (habitual en `next dev`) descontamos lo que ya lleva corrido, en vez de
    // sumar otra espera encima y dejar la marca congelada al centro.
    const glyph = markRef.current?.querySelector(".splash-glyph");
    const started = glyph?.getAnimations()[0]?.startTime;
    const now = document.timeline.currentTime;
    const elapsed =
      typeof started === "number" && typeof now === "number" ? now - started : 0;

    timers.push(window.setTimeout(exit, Math.max(0, DWELL - elapsed)));

    // Cualquier gesto se salta la intro: nadie tiene que esperarla.
    const opts = { signal: abort.signal };
    window.addEventListener("pointerdown", exit, opts);
    window.addEventListener("keydown", exit, opts);
    window.addEventListener("wheel", exit, { ...opts, passive: true });
    window.addEventListener("touchstart", exit, { ...opts, passive: true });

    return () => {
      timers.forEach(clearTimeout);
      abort.abort();
      root.classList.remove("splash-running", "splash-out");
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-veil" />

      <div className="splash-stage">
        <div className="splash-mark" ref={markRef}>
          <svg className="splash-glyph splash-glyph-v" viewBox={MARK_VIEWBOX}>
            <path d={MARK_V} />
          </svg>
          <svg className="splash-glyph splash-glyph-a" viewBox={MARK_VIEWBOX}>
            <path d={MARK_A} />
          </svg>
        </div>

        {/* Se escribe letra por letra: el retardo de cada una vive aquí. */}
        <div className="splash-word">
          {LETRAS.map((letra, i) => (
            <span
              key={i}
              style={{ animationDelay: `${LETTER_START + i * LETTER_STEP}ms` }}
            >
              {letra}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
