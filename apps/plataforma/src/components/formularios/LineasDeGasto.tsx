"use client";

import { useState } from "react";
import { Etiqueta } from "../ui/Chip";
import { tiposCompra, type TipoCompra } from "@/lib/egresos";
import { formatearPesos } from "@/lib/formato";
import { leerPegado } from "@/lib/pegado";

/**
 * Las líneas de un documento de gasto: descripción, cantidad, precio, categoría
 * y si es reembolsable. Se pegan desde la planilla y la categoría o el tipo se
 * aplican a todas de una vez; después se corrigen las excepciones.
 */

export type LineaGasto = {
  /** Solo para React: las líneas se reemplazan enteras al guardar. */
  clave: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  categoria_id: string;
  tipo: TipoCompra;
};

let correlativo = 0;
export function lineaVacia(parcial: Partial<LineaGasto> = {}): LineaGasto {
  correlativo += 1;
  return {
    clave: `l-${correlativo}`,
    descripcion: "",
    unidad: "UN",
    cantidad: 1,
    precio_unitario: 0,
    categoria_id: "",
    tipo: "ordinario",
    ...parcial,
  };
}

export const netoLinea = (l: LineaGasto) => Math.round(l.cantidad * l.precio_unitario);

export function LineasDeGasto({
  lineas,
  alCambiar,
  categorias,
  afectaIva,
}: {
  lineas: LineaGasto[];
  alCambiar: (lineas: LineaGasto[]) => void;
  /** Las categorías del contrato elegido. */
  categorias: { id: string; nombre: string }[];
  /** Si la categoría lleva IVA; sin categoría, sí. */
  afectaIva: (categoriaId: string) => boolean;
}) {
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState("");
  const pegadas = leerPegado(texto);

  const cambiar = (clave: string, campo: keyof LineaGasto, valor: unknown) =>
    alCambiar(lineas.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));

  function agregar(filas: ReturnType<typeof leerPegado>) {
    const conAlgo = lineas.filter((l) => l.descripcion.trim());
    alCambiar([
      ...conAlgo,
      ...filas.map((f) => lineaVacia({ descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad, precio_unitario: f.precioUnitario })),
    ]);
    setTexto("");
    setPegando(false);
  }

  function alPegarEnCelda(e: React.ClipboardEvent<HTMLInputElement>) {
    const t = e.clipboardData.getData("text");
    if (!t.includes("\t") && !t.includes("\n")) return;
    const filas = leerPegado(t);
    if (filas.length === 0) return;
    e.preventDefault();
    agregar(filas);
  }

  const neto = lineas.reduce((t, l) => t + netoLinea(l), 0);
  const iva = lineas.reduce((t, l) => t + (afectaIva(l.categoria_id) ? Math.round(netoLinea(l) * 0.19) : 0), 0);
  const reembolsable = lineas.filter((l) => l.tipo === "reembolsable").reduce((t, l) => t + netoLinea(l), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-ink">Líneas del documento</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPegando((p) => !p)} aria-expanded={pegando}
            className="rounded-full border border-cyan px-4 py-2 text-sm font-semibold text-cyan-deep hover:bg-cyan/5">
            Pegar desde la planilla
          </button>
          <button type="button" onClick={() => alCambiar([...lineas, lineaVacia()])}
            className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
            Agregar línea
          </button>
        </div>
      </div>

      {pegando && (
        <div className="mb-4 rounded-xl border border-mist-deep bg-mist/30 p-4">
          <label className="block text-sm font-semibold text-ink" htmlFor="pegado-gasto">Pega las filas del documento</label>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Copia las filas de la planilla (descripción, unidad, cantidad, precio). El encabezado y las filas vacías se ignoran.
          </p>
          <textarea id="pegado-gasto" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
            className={`${claseCelda} mt-3 font-mono text-xs`} />
          {pegadas.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-soft">
                {pegadas.length} líneas · neto {formatearPesos(pegadas.reduce((t, x) => t + Math.round(x.cantidad * x.precioUnitario), 0))}
              </span>
              <button type="button" onClick={() => agregar(pegadas)}
                className="rounded-full bg-cyan px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-deep">
                Agregar {pegadas.length} líneas
              </button>
            </div>
          )}
        </div>
      )}

      {lineas.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span className="font-semibold uppercase tracking-[0.1em]">A todas las líneas:</span>
          <select aria-label="Categoría para todas las líneas" value=""
            onChange={(e) => e.target.value && alCambiar(lineas.map((l) => ({ ...l, categoria_id: e.target.value === "-" ? "" : e.target.value })))}
            className="rounded-full border border-mist-deep bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft">
            <option value="">Categoría…</option>
            <option value="-">— Sin categoría —</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select aria-label="Tipo para todas las líneas" value=""
            onChange={(e) => e.target.value && alCambiar(lineas.map((l) => ({ ...l, tipo: e.target.value as TipoCompra })))}
            className="rounded-full border border-mist-deep bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft">
            <option value="">Tipo…</option>
            {tiposCompra.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
              <th className="py-2 pr-3">Descripción</th>
              <th className="w-40 py-2 pr-3">Categoría</th>
              <th className="w-20 py-2 pr-3">UM</th>
              <th className="w-24 py-2 pr-3 text-right">Cant.</th>
              <th className="w-32 py-2 pr-3 text-right">P. unitario</th>
              <th className="w-36 py-2 pr-3">Tipo</th>
              <th className="w-28 py-2 text-right">Neto</th>
              <th className="w-10 py-2" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.clave} className="border-b border-mist last:border-0">
                <td className="py-2 pr-3">
                  <input aria-label="Descripción" value={l.descripcion} onPaste={alPegarEnCelda}
                    onChange={(e) => cambiar(l.clave, "descripcion", e.target.value)} className={claseCelda} />
                </td>
                <td className="py-2 pr-3">
                  <select aria-label="Categoría" value={l.categoria_id} onChange={(e) => cambiar(l.clave, "categoria_id", e.target.value)} className={claseCelda}>
                    <option value="">— Sin categoría —</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input aria-label="Unidad" value={l.unidad} onChange={(e) => cambiar(l.clave, "unidad", e.target.value)} className={claseCelda} />
                </td>
                <td className="py-2 pr-3">
                  <input aria-label="Cantidad" type="number" min="0" step="any" value={l.cantidad}
                    onChange={(e) => cambiar(l.clave, "cantidad", Number(e.target.value) || 0)}
                    className={`${claseCelda} text-right tabular-nums`} />
                </td>
                <td className="py-2 pr-3">
                  <input aria-label="Precio unitario" type="text" inputMode="numeric" placeholder="0"
                    value={l.precio_unitario === 0 ? "" : l.precio_unitario.toLocaleString("es-CL")}
                    onChange={(e) => cambiar(l.clave, "precio_unitario", Number(e.target.value.replace(/\D/g, "")) || 0)}
                    className={`${claseCelda} text-right tabular-nums`} />
                </td>
                <td className="py-2 pr-3">
                  <select aria-label="Tipo" value={l.tipo} onChange={(e) => cambiar(l.clave, "tipo", e.target.value)} className={claseCelda}>
                    {tiposCompra.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                  </select>
                </td>
                <td className="py-2 text-right font-semibold tabular-nums text-ink">{formatearPesos(netoLinea(l))}</td>
                <td className="py-2 text-right">
                  <button type="button" aria-label="Quitar línea" onClick={() => alCambiar(lineas.filter((x) => x.clave !== l.clave))}
                    className="rounded-lg p-1.5 text-ink-soft hover:bg-[#fdeeec] hover:text-[#a52f24]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col items-end gap-1 text-sm">
        <p className="text-ink-soft">Neto <span className="ml-2 font-semibold tabular-nums text-ink">{formatearPesos(neto)}</span></p>
        <p className="text-ink-soft">IVA según categorías <span className="ml-2 tabular-nums">{formatearPesos(iva)}</span></p>
        {reembolsable > 0 && (
          <p className="mt-1"><Etiqueta destacada>{formatearPesos(reembolsable)} reembolsables — no descuentan del margen</Etiqueta></p>
        )}
      </div>
    </div>
  );
}

export const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20";
