"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { calza } from "@/lib/articulos";

/**
 * Un selector con buscador, para las listas que ya no caben en un desplegable.
 *
 * EXISTE POR LOS 80 PROVEEDORES. Un `<select>` con esa cantidad obliga a
 * recorrer la lista con la rueda del mouse buscando un nombre que uno ya sabe
 * cuál es. Acá se escriben tres letras y queda uno.
 *
 * Busca **palabra por palabra**, sin acentos y por cualquier parte del texto:
 * "sabinco" encuentra "Atco Sabinco", que es como uno se acuerda del proveedor,
 * y "atco 76" encuentra al mismo por nombre y RUT aunque estén separados. Se
 * comparte con el catálogo de artículos (`calza`, en `lib/articulos`) para que
 * los dos buscadores se comporten igual.
 *
 * Se maneja con el teclado —flechas para moverse, Enter para elegir, Escape
 * para cerrar— porque quien carga veinte líneas seguidas no suelta el teclado.
 */

export type OpcionCombo = {
  id: string;
  titulo: string;
  /** Segunda línea: el RUT, el rubro, el código. Entra en la búsqueda. */
  nota?: string;
};

export function Combo({
  etiqueta,
  opciones,
  valor,
  alCambiar,
  marcador = "Escribe para buscar…",
  ayuda,
  requerido,
  vacio = "Nada calza con lo que escribiste.",
}: {
  etiqueta: string;
  opciones: OpcionCombo[];
  valor: string;
  alCambiar: (id: string) => void;
  marcador?: string;
  ayuda?: string;
  requerido?: boolean;
  vacio?: string;
}) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resaltada, setResaltada] = useState(0);

  const elegida = opciones.find((o) => o.id === valor);

  const visibles = useMemo(
    () => opciones.filter((o) => calza(busqueda, `${o.titulo} ${o.nota ?? ""}`)),
    [opciones, busqueda],
  );

  // Un clic fuera cierra sin elegir, y deja lo que ya estaba elegido.
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", alClic);
    return () => document.removeEventListener("mousedown", alClic);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setBusqueda("");
    setResaltada(0);
  }

  function elegir(opcion: OpcionCombo) {
    alCambiar(opcion.id);
    cerrar();
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        return;
      }
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setResaltada((r) => {
        if (visibles.length === 0) return 0;
        return (r + paso + visibles.length) % visibles.length;
      });
      return;
    }

    if (e.key === "Enter") {
      if (abierto && visibles[resaltada]) {
        // Dentro de un formulario, Enter elige la opción y no envía todavía.
        e.preventDefault();
        elegir(visibles[resaltada]);
      }
      return;
    }

    if (e.key === "Escape" && abierto) {
      e.preventDefault();
      cerrar();
    }
  }

  return (
    <div ref={caja}>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft"
      >
        {etiqueta}
        {requerido && <span className="ml-1 text-cyan-deep">*</span>}
      </label>

      <div className="relative mt-2">
        <input
          id={id}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          /* Cerrado muestra lo elegido; abierto, lo que se está escribiendo.
             Así no hace falta borrar el nombre anterior para buscar otro. */
          value={abierto ? busqueda : (elegida?.titulo ?? "")}
          placeholder={elegida ? elegida.titulo : marcador}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setResaltada(0);
            if (!abierto) setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          className="w-full rounded-xl border border-mist-deep bg-white px-4 py-3 pr-10 text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
        />

        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-soft">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        {abierto && (
          <ul
            id={`${id}-lista`}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-mist-deep bg-white py-1 shadow-lg"
          >
            {visibles.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-soft">{vacio}</li>
            )}

            {visibles.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === valor}
                  onMouseEnter={() => setResaltada(i)}
                  onClick={() => elegir(o)}
                  className={`flex w-full flex-col items-start px-4 py-2 text-left text-sm transition-colors ${
                    i === resaltada ? "bg-mist" : ""
                  }`}
                >
                  <span className={o.id === valor ? "font-semibold text-ink" : "text-ink"}>
                    {o.titulo}
                  </span>
                  {o.nota && <span className="text-xs text-ink-soft">{o.nota}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ayuda && <p className="mt-1.5 text-xs text-ink-soft">{ayuda}</p>}
    </div>
  );
}
