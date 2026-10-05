"use client";

import { useEffect, useState } from "react";
import { buscarProveedoresEnPagnol } from "@/lib/pagnol/navegador";
import type { ProveedorPagnol } from "@/lib/pagnol/tipos";

/**
 * Buscar el proveedor en Pagnol para enlazarlo a la ficha de Valar.
 *
 * Pagnol es la fuente de verdad de los proveedores; la ficha de Valar se queda
 * porque guarda lo que Pagnol no tiene (banco, cuenta, plazo de pago). Elegir
 * uno completa los datos que Pagnol sí tiene y guarda su id como referencia.
 */

const MINIMO = 3;
const PAUSA_MS = 350;

export function BuscadorProveedorPagnol({
  enlazado,
  alElegir,
  alSoltar,
}: {
  /** El nombre con que quedó enlazado, si ya lo está. */
  enlazado: string | null;
  alElegir: (p: ProveedorPagnol) => void;
  alSoltar: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProveedorPagnol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const texto = q.trim();

  useEffect(() => {
    if (texto.length < MINIMO) return;
    const control = new AbortController();
    const espera = setTimeout(() => {
      setBuscando(true);
      buscarProveedoresEnPagnol(texto, control.signal)
        .then((r) => {
          if (r.ok) {
            setResultados(r.datos.filter((p) => p.activo).slice(0, 8));
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
  }, [texto]);

  if (enlazado) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan/40 bg-cyan/5 px-4 py-3 text-sm">
        <span className="text-ink">
          Enlazado con Pagnol: <strong>{enlazado}</strong>
        </span>
        <button type="button" onClick={alSoltar} className="text-xs font-semibold text-ink-soft hover:text-ink hover:underline">
          Quitar enlace
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-mist-deep bg-mist/30 p-4">
      <label htmlFor="buscar-proveedor-pagnol" className="block text-sm font-semibold text-ink">
        Buscar en Pagnol
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
        Si el proveedor ya está en Pagnol, elígelo: se completan sus datos y la ficha queda enlazada.
      </p>
      <input
        id="buscar-proveedor-pagnol"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Razón social o RUT"
        className="mt-3 w-full rounded-xl border border-mist-deep bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
      />
      {texto.length >= MINIMO && (
        <div className="mt-2">
          {buscando && <p className="text-xs text-ink-soft">Buscando en Pagnol…</p>}
          {error && !buscando && <p className="text-xs text-[#8a5a09]">{error}</p>}
          {!error && !buscando && resultados.length === 0 && (
            <p className="text-xs text-ink-soft">No está en Pagnol. Completa la ficha a mano.</p>
          )}
          {resultados.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-lg border border-mist bg-white">
              {resultados.map((p) => (
                <li key={p.id} className="border-b border-mist last:border-0">
                  <button type="button" onClick={() => alElegir(p)} className="w-full px-3 py-2 text-left hover:bg-mist/50">
                    <span className="block text-sm text-ink">{p.razon_social}</span>
                    <span className="text-[11px] text-ink-soft">
                      {[p.rut ?? "Sin RUT", p.email, p.telefono].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
