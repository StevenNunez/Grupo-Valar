"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Un recuadro para firmar con el dedo, el lápiz o el mouse.
 *
 * Dibuja sobre un canvas con eventos de puntero (sirven igual para táctil y
 * mouse) y entrega la firma como PNG de fondo transparente, recortada a la
 * tinta y con un tamaño acotado: es lo que se estampa en los PDF.
 */

export type PadDeFirmaRef = {
  /** La firma como `data:image/png;base64,…`, o null si el recuadro está vacío. */
  aPng: () => string | null;
  limpiar: () => void;
};

const ALTO = 190;
const TINTA = "#14213d";
/** Ancho máximo de la imagen que se guarda: sobra para un PDF y pesa poco. */
const ANCHO_MAXIMO = 640;

export const PadDeFirma = forwardRef<PadDeFirmaRef, { alCambiar?: (hayTrazo: boolean) => void }>(function PadDeFirma({ alCambiar }, ref) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [hayTrazo, setHayTrazo] = useState(false);

  /* El canvas se ajusta al ancho disponible y a la densidad de la pantalla. */
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    function ajustar() {
      if (!c) return;
      const ratio = window.devicePixelRatio || 1;
      const ancho = c.parentElement?.clientWidth ?? 520;
      c.width = Math.round(ancho * ratio);
      c.height = Math.round(ALTO * ratio);
      c.style.width = `${ancho}px`;
      c.style.height = `${ALTO}px`;
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.lineWidth = 2.4;
      g.strokeStyle = TINTA;
      setHayTrazo(false);
      alCambiar?.(false);
    }
    ajustar();
    const observador = new ResizeObserver(ajustar);
    if (c.parentElement) observador.observe(c.parentElement);
    return () => observador.disconnect();
    // `alCambiar` no entra a propósito: reajustar borraría la firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const p = punto(e);
    ultimo.current = p;
    // Un toque sin movimiento deja un punto.
    const g = e.currentTarget.getContext("2d");
    if (g) {
      g.beginPath();
      g.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      g.fillStyle = TINTA;
      g.fill();
    }
    if (!hayTrazo) {
      setHayTrazo(true);
      alCambiar?.(true);
    }
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current || !ultimo.current) return;
    const g = e.currentTarget.getContext("2d");
    if (!g) return;
    const p = punto(e);
    const medio = { x: (ultimo.current.x + p.x) / 2, y: (ultimo.current.y + p.y) / 2 };
    g.beginPath();
    g.moveTo(ultimo.current.x, ultimo.current.y);
    g.quadraticCurveTo(ultimo.current.x, ultimo.current.y, medio.x, medio.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    ultimo.current = p;
  }

  function terminar() {
    dibujando.current = false;
    ultimo.current = null;
  }

  function limpiar() {
    const c = lienzo.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.restore();
    setHayTrazo(false);
    alCambiar?.(false);
  }

  useImperativeHandle(ref, () => ({
    limpiar,
    aPng() {
      const c = lienzo.current;
      const g = c?.getContext("2d");
      if (!c || !g) return null;
      const { width: an, height: al } = c;
      const datos = g.getImageData(0, 0, an, al).data;
      let x0 = an, y0 = al, x1 = -1, y1 = -1;
      for (let y = 0; y < al; y++) {
        for (let x = 0; x < an; x++) {
          if (datos[(y * an + x) * 4 + 3] > 10) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return null;
      // Recorte a la tinta, con un margen, y reducido si hace falta.
      const margen = Math.round(8 * (window.devicePixelRatio || 1));
      x0 = Math.max(0, x0 - margen); y0 = Math.max(0, y0 - margen);
      x1 = Math.min(an - 1, x1 + margen); y1 = Math.min(al - 1, y1 + margen);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const escala = Math.min(1, ANCHO_MAXIMO / w);
      const salida = document.createElement("canvas");
      salida.width = Math.max(1, Math.round(w * escala));
      salida.height = Math.max(1, Math.round(h * escala));
      salida.getContext("2d")?.drawImage(c, x0, y0, w, h, 0, 0, salida.width, salida.height);
      return salida.toDataURL("image/png");
    },
  }));

  return (
    <div className="relative rounded-xl border border-dashed border-mist-deep bg-white">
      <canvas
        ref={lienzo}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
        aria-label="Recuadro para dibujar tu firma"
        className="block w-full cursor-crosshair touch-none rounded-xl"
      />
      {!hayTrazo && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink-soft/70">Firma aquí</span>
      )}
      <span aria-hidden="true" className="pointer-events-none absolute bottom-9 left-6 right-6 border-b border-mist-deep" />
    </div>
  );
});
