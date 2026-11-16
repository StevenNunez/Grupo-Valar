"use client";

import { Chip } from "../ui/Chip";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { semaforo, textoSemaforo, type Evolucion } from "@/lib/dashboard";
import { formatearMonto, mesLargo } from "@/lib/formato";

/* ── Tabla de evolución ───────────────────────────────────────────────────── */

type FilaEvolucion = Evolucion & { meta: number };

export function TablaEvolucion({ evolucion, meta }: { evolucion: Evolucion[]; meta: number }) {
  const filas: FilaEvolucion[] = evolucion.map((e) => ({ ...e, meta }));
  const venta = evolucion.reduce((t, e) => t + e.consolidado.venta, 0);
  const costo = evolucion.reduce((t, e) => t + e.consolidado.costo, 0);

  const columnas: Columna<FilaEvolucion>[] = [
    {
      clave: "mes",
      titulo: "Mes",
      encabezado: true,
      celda: (f) => <span className="font-semibold text-ink">{mesLargo(f.periodo)}</span>,
    },
    {
      clave: "venta",
      titulo: "Ventas netas",
      derecha: true,
      celda: (f) => <span className="text-ink-soft">{formatearMonto(f.consolidado.venta)}</span>,
    },
    {
      clave: "costo",
      titulo: "Costos",
      derecha: true,
      celda: (f) => <span className="text-ink-soft">{formatearMonto(f.consolidado.costo)}</span>,
    },
    {
      clave: "extra",
      titulo: "De ello parada de planta",
      derecha: true,
      celda: (f) => {
        const extra = f.consolidado.costoParadaPlanta;
        return <span className="text-ink-soft">{extra > 0 ? formatearMonto(extra) : "—"}</span>;
      },
    },
    {
      clave: "margen",
      titulo: "Resultado",
      derecha: true,
      celda: (f) => (
        <span className="font-semibold text-ink">{formatearMonto(f.consolidado.margen)}</span>
      ),
    },
    {
      clave: "pct",
      titulo: "Rentabilidad",
      derecha: true,
      celda: (f) => {
        const luz = semaforo(f.consolidado.margenPct, f.meta);
        const color =
          luz === "bueno"
            ? "text-exito"
            : luz === "aviso"
              ? "text-alerta"
              : "text-peligro";
        return (
          <span className={`font-semibold ${color}`}>{f.consolidado.margenPct.toFixed(1)}%</span>
        );
      },
    },
    {
      clave: "estado",
      titulo: "Estado",
      celda: (f) => {
        const luz = semaforo(f.consolidado.margenPct, f.meta);
        return <Chip tono={luz}>{textoSemaforo[luz]}</Chip>;
      },
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.periodo}
      vacio="Sin meses cargados."
      pie={
        <>
          <Total>Total del período</Total>
          <Total derecha>{formatearMonto(venta)}</Total>
          <Total derecha>{formatearMonto(costo)}</Total>
          <Total derecha>{formatearMonto(venta - costo)}</Total>
          <Total derecha>
            {venta > 0 ? `${(((venta - costo) / venta) * 100).toFixed(1)}%` : "—"}
          </Total>
          <Total />
        </>
      }
    />
  );
}

