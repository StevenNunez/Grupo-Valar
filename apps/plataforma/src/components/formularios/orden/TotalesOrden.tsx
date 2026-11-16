"use client";

import { Etiqueta } from "../../ui/Chip";
import { formatearPesos } from "@/lib/formato";

/** Exenta, descuento y los totales de la orden. */
export function TotalesOrden({
  exenta,
  setExenta,
  descuento,
  setDescuento,
  subtotal,
  neto,
  iva,
  reembolsable,
}: {
  exenta: boolean;
  setExenta: (exenta: boolean) => void;
  descuento: number;
  setDescuento: (porcentaje: number) => void;
  subtotal: number;
  neto: number;
  iva: number;
  reembolsable: number;
}) {
  return (
    <div className="mt-5 flex flex-col items-end gap-1 text-sm">
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={exenta}
          onChange={(e) => setExenta(e.target.checked)}
          className="h-4 w-4 accent-cyan-deep"
        />
        Orden exenta de IVA
        <span className="text-xs font-normal text-ink-soft">(exámenes médicos, capacitación…)</span>
      </label>
      <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        Descuento
        <input
          type="number" min={0} max={99.99} step="any" inputMode="decimal"
          aria-label="Descuento sobre el subtotal, en porcentaje"
          value={descuento === 0 ? "" : descuento}
          placeholder="0"
          onChange={(e) => setDescuento(Math.min(99.99, Math.max(0, Number(e.target.value) || 0)))}
          className="w-20 rounded-lg border border-mist-deep px-2.5 py-1.5 text-right text-sm tabular-nums text-ink focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/20"
        />
        <span className="text-xs font-normal text-ink-soft">% del subtotal</span>
      </label>
      {descuento > 0 && (
        <>
          <p className="text-ink-soft">
            Subtotal <span className="ml-2 tabular-nums">{formatearPesos(subtotal)}</span>
          </p>
          <p className="text-ink-soft">
            Descuento {descuento.toLocaleString("es-CL")}% <span className="ml-2 tabular-nums">−{formatearPesos(subtotal - neto)}</span>
          </p>
        </>
      )}
      <p className="text-ink-soft">
        Neto <span className="ml-2 font-semibold tabular-nums text-ink">{formatearPesos(neto)}</span>
      </p>
      <p className="text-ink-soft">
        {exenta ? "IVA (exento)" : "IVA 19%"} <span className="ml-2 tabular-nums">{formatearPesos(iva)}</span>
      </p>
      <p className="font-display text-lg font-semibold text-ink">
        Total {formatearPesos(neto + iva)}
      </p>
      {reembolsable > 0 && (
        <p className="mt-1">
          <Etiqueta destacada>
            {formatearPesos(reembolsable)} reembolsables — no descuentan del margen
          </Etiqueta>
        </p>
      )}
    </div>
  );
}
