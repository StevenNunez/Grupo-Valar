"use client";

import { Chip } from "../ui/Chip";
import { semaforo, textoSemaforo, type Contrato } from "@/lib/dashboard";
import { formatearMonto } from "@/lib/formato";

/* ── Tarjeta por contrato ─────────────────────────────────────────────────── */

export function TarjetaContrato({ contrato }: { contrato: Contrato }) {
  const { totales, meta } = contrato;
  const luz = semaforo(totales.margenPct, meta);
  const color = luz === "bueno" ? "#0e7a4f" : luz === "aviso" ? "#8a5a09" : "#a52f24";

  return (
    <article className="rounded-2xl border border-mist-deep bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">{contrato.nombre}</h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            {contrato.padreId
              ? `Anexo · ${contrato.cliente || contrato.padreId}`
              : `${contrato.cliente} · ${contrato.id}`}
          </p>
        </div>
        <Chip tono={luz}>{textoSemaforo[luz]}</Chip>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        {[
          ["Ventas", formatearMonto(totales.venta)],
          ["Costos", formatearMonto(totales.costo)],
          ["Resultado", formatearMonto(totales.margen)],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {etiqueta}
            </dt>
            <dd className="mt-1.5 font-display text-lg font-semibold text-ink">{valor}</dd>
          </div>
        ))}
      </dl>

      {/* Rentabilidad contra la meta: la marca fija dice dónde está el listón. */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Rentabilidad
          </span>
          <span className="font-display text-2xl font-semibold" style={{ color }}>
            {totales.margenPct.toFixed(1)}%
          </span>
        </div>

        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-mist">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.min(Math.max(totales.margenPct, 0), 100)}%`,
              background: color,
            }}
          />
        </div>
        <div className="relative mt-1 h-4">
          <span
            className="absolute -translate-x-1/2 text-xs text-ink-soft"
            style={{ left: `${Math.min(meta, 100)}%` }}
          >
            ▲ meta {meta}%
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Aporta el {contrato.aporteMargen.toFixed(0)}% del margen total con el{" "}
        {contrato.aporteVenta.toFixed(0)}% de las ventas.
      </p>
    </article>
  );
}

