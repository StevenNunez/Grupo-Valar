"use client";

import { Chip } from "../ui/Chip";
import type { Alerta } from "@/lib/dashboard";
import { mesLargo } from "@/lib/formato";

/* ── Alertas de desviación ────────────────────────────────────────────────── */

export function PanelAlertas({ alertas, nombreDe }: { alertas: Alerta[]; nombreDe: (id: string) => string }) {
  if (alertas.length === 0) return null;
  return (
    <section aria-labelledby="alertas" className="mb-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-7">
      <h2 id="alertas" className="font-display text-lg font-semibold text-ink">
        Desviaciones detectadas
      </h2>
      <p className="mb-4 mt-1 text-sm text-ink-soft">
        Informativo: meses que se mueven distinto del anterior. Es una señal de dónde mirar, no un error.
      </p>
      <ul className="flex flex-col gap-3">
        {alertas.map((a) => (
          <li key={a.periodo + a.titulo} className="rounded-xl bg-mist/50 p-4">
            <p className="text-sm font-semibold text-ink">
              <Chip tono={a.nivel === "critico" ? "critico" : "aviso"}>{mesLargo(a.periodo)}</Chip>{" "}
              <span className="ml-1">{a.titulo}</span>
            </p>
            <p className="mt-1.5 text-sm text-ink-soft">
              {a.detalle}
              {a.contratoId && <> Mayor peso: <strong className="text-ink">{nombreDe(a.contratoId)}</strong>.</>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

