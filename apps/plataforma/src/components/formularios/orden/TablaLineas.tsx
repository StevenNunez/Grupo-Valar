"use client";

import { CampoConPagnol, unidadDesdePagnol } from "../../ui/CampoConPagnol";
import { CampoPrecio } from "../../ui/CampoPrecio";
import { tiposCompra } from "@/lib/egresos";
import { formatearPesos, formatearPesosUnitario, formatearUf } from "@/lib/formato";
import { claseCelda, type Linea } from "./borrador";

/** Las líneas de la orden, editables en la misma tabla (tarjetas en el teléfono). */
export function TablaLineas({
  lineas,
  setLineas,
  opcionesCategoria,
  enUf,
  valorUf,
  listaEnPesos,
  cambiar,
  quitar,
  alPegarEnCelda,
}: {
  lineas: Linea[];
  setLineas: React.Dispatch<React.SetStateAction<Linea[]>>;
  opcionesCategoria: { id: string; titulo: string }[];
  enUf: boolean;
  valorUf: number;
  /** El precio de lista en pesos: el escrito, o el de UF convertido con la UF de la orden. */
  listaEnPesos: (l: Linea) => number;
  cambiar: (id: string, campo: keyof Linea, valor: unknown) => void;
  quitar: (linea: Linea) => void;
  alPegarEnCelda: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="lineas-movil w-full md:min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
            <th className="py-2 pr-3">Descripción</th>
            <th className="w-40 py-2 pr-3">Categoría</th>
            <th className="w-20 py-2 pr-3">UM</th>
            <th className="w-24 py-2 pr-3 text-right">Cant.</th>
            <th className="w-32 py-2 pr-3 text-right">{enUf ? "P. unitario (UF)" : "P. unitario"}</th>
            <th className="w-36 py-2 pr-3">Tipo</th>
            <th className="w-28 py-2 text-right">Total</th>
            <th className="w-10 py-2" />
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.id} className="border-b border-mist last:border-0">
              <td data-label="Descripción" data-ancho className="py-2 pr-3">
                <CampoConPagnol
                  ariaLabel="Descripción"
                  valor={l.descripcion}
                  // Escribir a mano suelta la referencia: ya no es ese material.
                  alCambiar={(v) =>
                    setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, descripcion: v, pagnol_material_id: "", pagnol_codigo: "" } : x)))
                  }
                  alElegir={(m) =>
                    setLineas((ls) =>
                      ls.map((x) =>
                        x.id === l.id
                          ? { ...x, descripcion: m.nombre, unidad: unidadDesdePagnol(m.unidad_medida), pagnol_material_id: m.id, pagnol_codigo: m.codigo }
                          : x,
                      ),
                    )
                  }
                  enlazado={l.pagnol_material_id ? l.pagnol_codigo || "enlazado" : null}
                  onPaste={alPegarEnCelda}
                  placeholder="Disco de corte 4½″"
                  className={claseCelda}
                />
              </td>
              <td data-label="Categoría" className="py-2 pr-3">
                <select
                  value={l.categoria_id}
                  onChange={(e) => cambiar(l.id, "categoria_id", e.target.value)}
                  className={claseCelda}
                >
                  {opcionesCategoria.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.titulo}
                    </option>
                  ))}
                </select>
              </td>
              <td data-label="UM" className="py-2 pr-3">
                <input
                  value={l.unidad}
                  onChange={(e) => cambiar(l.id, "unidad", e.target.value)}
                  className={claseCelda}
                />
              </td>
              <td data-label="Cant." className="py-2 pr-3">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={l.cantidad}
                  onChange={(e) => cambiar(l.id, "cantidad", Number(e.target.value) || 0)}
                  className={`${claseCelda} text-right tabular-nums`}
                />
              </td>
              <td data-label={enUf ? "P. unitario (UF)" : "P. unitario"} className="py-2 pr-3">
                <CampoPrecio
                  valor={enUf ? l.precio_uf : l.precio_unitario}
                  alCambiar={(n) => cambiar(l.id, enUf ? "precio_uf" : "precio_unitario", n)}
                  className={`${claseCelda} text-right tabular-nums`}
                />
                {enUf && l.precio_uf > 0 && valorUf > 0 && (
                  <p className="mt-0.5 text-right text-xs tabular-nums text-ink-soft">
                    = {formatearPesosUnitario(listaEnPesos(l))}
                  </p>
                )}
              </td>
              <td data-label="Tipo" className="py-2 pr-3">
                <select
                  value={l.tipo}
                  onChange={(e) => cambiar(l.id, "tipo", e.target.value)}
                  className={claseCelda}
                >
                  {tiposCompra.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titulo}
                    </option>
                  ))}
                </select>
              </td>
              <td data-label="Total" className="py-2 text-right font-semibold tabular-nums text-ink">
                {formatearPesos(Math.round(l.cantidad * listaEnPesos(l)))}
                {enUf && l.precio_uf > 0 && (
                  <p className="text-xs font-normal text-ink-soft">{formatearUf(l.cantidad * l.precio_uf)} UF</p>
                )}
              </td>
              <td data-acciones className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => quitar(l)}
                  aria-label="Quitar ítem"
                  className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-peligro-suave hover:text-peligro"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
