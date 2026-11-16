"use client";

import { sumar, type Contrato } from "@/lib/dashboard";
import { formatearPesos } from "@/lib/formato";

/* ── Conclusiones ─────────────────────────────────────────────────────────── */

export function Conclusiones({
  contratos,
  total,
}: {
  contratos: Contrato[];
  total: ReturnType<typeof sumar>;
}) {
  if (contratos.length === 0) return null;

  const masRentable = [...contratos].sort((a, b) => b.totales.margenPct - a.totales.margenPct)[0];
  const masAporta = [...contratos].sort((a, b) => b.aporteMargen - a.aporteMargen)[0];

  return (
    <section className="mt-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8">
      <h2 className="font-display text-lg font-semibold text-ink">En resumen</h2>
      <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-soft">
        <li>
          El contrato más rentable es{" "}
          <strong className="font-semibold text-ink">{masRentable.nombre}</strong>, con{" "}
          {masRentable.totales.margenPct.toFixed(1)}% sobre ventas.
        </li>
        {contratos.length > 1 && (
          <li>
            El que más aporta al margen es{" "}
            <strong className="font-semibold text-ink">{masAporta.nombre}</strong>: pone el{" "}
            {masAporta.aporteMargen.toFixed(0)}% del resultado con el{" "}
            {masAporta.aporteVenta.toFixed(0)}% de las ventas.
          </li>
        )}
        <li>
          Utilidad del período:{" "}
          <strong className="font-semibold text-ink">{formatearPesos(total.margen)}</strong>.
        </li>
        {total.reembolsable > 0 && (
          <li>
            Hay {formatearPesos(total.reembolsable)} en gastos reembolsables que se le cobran al
            mandante, y por eso no descuentan del margen.
          </li>
        )}
      </ul>
    </section>
  );
}

