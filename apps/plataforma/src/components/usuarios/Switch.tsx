"use client";



/* ── El switch ────────────────────────────────────────────────────────────── */

export function Switch({
  marcado,
  ocupado,
  etiqueta,
  alCambiar,
}: {
  marcado: boolean;
  ocupado: boolean;
  etiqueta: string;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={marcado}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={() => alCambiar(!marcado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        marcado ? "bg-cyan" : "bg-mist-deep"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          marcado ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
