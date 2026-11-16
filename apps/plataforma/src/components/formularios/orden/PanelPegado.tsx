"use client";

import { formatearPesos, formatearPesosUnitario } from "@/lib/formato";
import type { FilaPegada } from "@/lib/pegado";
import { claseCelda } from "./borrador";

/** Pegar filas de la planilla: el texto, la vista previa de cómo se leyó y el botón que las agrega. */
export function PanelPegado({
  textoPegado,
  setTextoPegado,
  filasPegadas,
  agregarPegadas,
}: {
  textoPegado: string;
  setTextoPegado: (texto: string) => void;
  filasPegadas: FilaPegada[];
  agregarPegadas: (filas: FilaPegada[]) => void;
}) {
  return (
    <div className="mb-5 rounded-xl border border-mist-deep bg-mist/30 p-4">
      <label className="block text-sm font-semibold text-ink" htmlFor="pegado-oc">
        Pega las filas de la OC
      </label>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        En la planilla, selecciona las filas de ítems (de la columna ÍTEM a TOTALES) y cópialas. Las filas vacías y el
        encabezado se ignoran. Revisa abajo cómo quedó antes de agregarlas.
      </p>
      <textarea
        id="pegado-oc"
        rows={4}
        value={textoPegado}
        onChange={(e) => setTextoPegado(e.target.value)}
        placeholder={"1\tBOTIN MAXWORK TRAIL. AISL. P, CAFÉ, 40\tUN\t1\t$ 29,900\t$ 29,900"}
        className={`${claseCelda} mt-3 font-mono text-xs`}
      />
      {filasPegadas.length > 0 && (
        <div className="mt-3">
          <ul className="max-h-48 overflow-y-auto rounded-lg border border-mist bg-white text-xs">
            {filasPegadas.map((fila, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-mist px-3 py-1.5 last:border-0">
                <span className="truncate text-ink">{fila.descripcion}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {fila.cantidad.toLocaleString("es-CL")} {fila.unidad} × {formatearPesosUnitario(fila.precioUnitario)} ={" "}
                  <strong className="text-ink">{formatearPesos(Math.round(fila.cantidad * fila.precioUnitario))}</strong>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-soft">
              {filasPegadas.length} ítems · neto{" "}
              {formatearPesos(filasPegadas.reduce((t, x) => t + Math.round(x.cantidad * x.precioUnitario), 0))}
            </span>
            <button
              type="button"
              onClick={() => agregarPegadas(filasPegadas)}
              className="rounded-full bg-cyan-deep px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-hondo"
            >
              Agregar {filasPegadas.length} ítems
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
