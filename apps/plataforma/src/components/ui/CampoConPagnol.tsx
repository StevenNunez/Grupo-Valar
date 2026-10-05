"use client";

import { useEffect, useState } from "react";
import { buscarMaterialesEnPagnol } from "@/lib/pagnol/navegador";
import type { MaterialPagnol } from "@/lib/pagnol/tipos";

/**
 * Un campo de descripción que sugiere materiales del catálogo de Pagnol.
 *
 * Pagnol es la fuente de verdad del catálogo de Valar (contrato en
 * docs/integracion-pagnol-valar.md): al elegir un material, la línea toma su
 * nombre y unidad, y guarda solo su id como referencia. Escribir a mano sigue
 * funcionando igual: las sugerencias son una ayuda, no un requisito.
 *
 * Busca desde la tercera letra, espera a que se deje de escribir y cancela la
 * búsqueda anterior. Si Pagnol no responde, avisa en una línea y el campo
 * sigue sirviendo.
 */

const MINIMO = 3;
const PAUSA_MS = 350;
const MOSTRAR = 6;

/** La unidad de Pagnol es texto libre ("Unidad", "Metro"); la línea usa la abreviatura. */
export function unidadDesdePagnol(texto: string) {
  const t = texto.trim().toLowerCase();
  const tabla: [RegExp, string][] = [
    [/^unidad(es)?$|^un$|^u$/, "UN"],
    [/^metros?$|^m$/, "M"],
    [/^metros? cuadrados?$|^m2$/, "M2"],
    [/^metros? c[uú]bicos?$|^m3$/, "M3"],
    [/^kilos?$|^kilogramos?$|^kg$/, "KG"],
    [/^litros?$|^lt$|^l$/, "LT"],
    [/^pares?$/, "PAR"],
    [/^cajas?$/, "CJ"],
    [/^rollos?$/, "ROLLO"],
    [/^sets?$|^juegos?$/, "SET"],
    [/^galones?$/, "GL"],
  ];
  return tabla.find(([re]) => re.test(t))?.[1] ?? (texto.trim().toUpperCase().slice(0, 8) || "UN");
}

export function CampoConPagnol({
  valor,
  alCambiar,
  alElegir,
  enlazado,
  className,
  placeholder,
  ariaLabel,
  list,
  onPaste,
}: {
  valor: string;
  /** Escribir a mano. Quien lo usa suelta la referencia a Pagnol si la había. */
  alCambiar: (texto: string) => void;
  alElegir: (material: MaterialPagnol) => void;
  /** El código del material enlazado, para mostrarlo bajo el campo. */
  enlazado?: string | null;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Un `datalist` propio (el catálogo de artículos de Valar) sigue funcionando. */
  list?: string;
  onPaste?: React.ClipboardEventHandler<HTMLInputElement>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [buscado, setBuscado] = useState("");
  const [resultados, setResultados] = useState<MaterialPagnol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [escribio, setEscribio] = useState(false);

  const q = valor.trim();
  const debeBuscar = abierto && escribio && q.length >= MINIMO && q !== buscado;

  useEffect(() => {
    if (!debeBuscar) return;
    const control = new AbortController();
    const espera = setTimeout(() => {
      setBuscando(true);
      buscarMaterialesEnPagnol(q, control.signal)
        .then((r) => {
          setBuscado(q);
          if (r.ok) {
            setResultados(r.datos.filter((m) => m.activo).slice(0, MOSTRAR));
            setError(null);
          } else {
            setResultados([]);
            setError(r.error);
          }
        })
        .catch(() => undefined) // cancelada por una búsqueda más nueva
        .finally(() => setBuscando(false));
    }, PAUSA_MS);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [debeBuscar, q]);

  const mostrar = abierto && escribio && q.length >= MINIMO && (resultados.length > 0 || error || buscando);

  return (
    <div className="relative">
      <input
        aria-label={ariaLabel}
        list={list}
        value={valor}
        placeholder={placeholder}
        onPaste={onPaste}
        onChange={(e) => {
          setEscribio(true);
          alCambiar(e.target.value);
        }}
        onFocus={() => setAbierto(true)}
        // Con pausa: si se hizo clic en una sugerencia, el clic llega antes de cerrar.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => e.key === "Escape" && setAbierto(false)}
        className={className}
      />
      {enlazado && <span className="mt-1 block text-[11px] text-cyan-deep">Pagnol · {enlazado}</span>}

      {mostrar && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-mist-deep bg-white shadow-lg">
          <p className="border-b border-mist px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Catálogo Pagnol{buscando ? " · buscando…" : ""}
          </p>
          {error ? (
            <p className="px-3 py-2 text-xs text-[#8a5a09]">{error}</p>
          ) : (
            <ul>
              {resultados.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setEscribio(false);
                      setAbierto(false);
                      alElegir(m);
                    }}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-mist/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{m.nombre}</span>
                      <span className="block text-[11px] text-ink-soft">
                        {m.codigo} · {m.unidad_medida}
                        {m.categoria ? ` · ${m.categoria}` : ""}
                      </span>
                    </span>
                    {m.stock_actual !== null && (
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">stock {m.stock_actual.toLocaleString("es-CL")}</span>
                    )}
                  </button>
                </li>
              ))}
              {!buscando && resultados.length === 0 && (
                <li className="px-3 py-2 text-xs text-ink-soft">Sin coincidencias en Pagnol. Puedes dejarlo escrito a mano.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
