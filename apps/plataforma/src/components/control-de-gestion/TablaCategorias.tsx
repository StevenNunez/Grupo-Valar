"use client";

import { useMemo } from "react";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import {
  acumularCategorias,
  type CategoriaAcumulada,
  type FilaCategoria,
  type PersonalDividido,
} from "@/lib/dashboard";
import { formatearMonto } from "@/lib/formato";

/* ── Costo por categoría ──────────────────────────────────────────────────── */

export function TablaCategorias({
  categorias,
  contratoFiltro,
  meses,
  periodosVisibles,
  personal,
}: {
  categorias: FilaCategoria[];
  contratoFiltro: string | string[];
  meses: number;
  periodosVisibles: string[];
  personal: PersonalDividido;
}) {
  // El mismo cálculo que imprime el informe: vive en la librería para que la
  // hoja y la pantalla no puedan discrepar.
  const filas = useMemo(
    () => acumularCategorias(categorias, contratoFiltro, meses, periodosVisibles),
    [categorias, contratoFiltro, meses, periodosVisibles],
  );

  const maximo = Math.max(...filas.map((f) => Math.max(f.real, f.presupuesto)), 1);
  const totalReal = filas.reduce((t, f) => t + f.real, 0);
  const totalPpto = filas.reduce((t, f) => t + f.presupuesto, 0);

  const columnas: Columna<CategoriaAcumulada>[] = [
    {
      clave: "categoria",
      titulo: "Categoría",
      encabezado: true,
      celda: (f) => (
        <>
          <span className="block font-semibold text-ink">{f.categoria}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{f.contratoId}</span>
        </>
      ),
    },
    {
      clave: "barra",
      titulo: "Real vs. presupuesto",
      ancho: "w-56",
      celda: (f) => {
        const sobre = f.presupuesto > 0 && f.real > f.presupuesto;
        return (
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-mist">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(f.real / maximo) * 100}%`,
                background: sobre ? "#a52f24" : "#137e9e",
              }}
            />
            {/* Marca del presupuesto: dónde debería haberse detenido. */}
            {f.presupuesto > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-full w-[2px] bg-ink"
                style={{
                  left: `${Math.min((f.presupuesto / maximo) * 100, 100)}%`,
                }}
              />
            )}
          </div>
        );
      },
    },
    {
      clave: "real",
      titulo: "Real",
      derecha: true,
      celda: (f) => <span className="font-semibold text-ink">{formatearMonto(f.real)}</span>,
    },
    {
      clave: "ppto",
      titulo: "Presupuesto",
      derecha: true,
      celda: (f) => (
        <span className="text-ink-soft">
          {f.presupuesto > 0 ? formatearMonto(f.presupuesto) : "—"}
        </span>
      ),
    },
    {
      clave: "consumo",
      titulo: "Consumo",
      derecha: true,
      celda: (f) => {
        if (f.presupuesto === 0) return <span className="text-ink-soft">—</span>;
        const pct = (f.real / f.presupuesto) * 100;
        const color =
          pct > 110 ? "text-peligro" : pct > 100 ? "text-alerta" : "text-exito";
        return <span className={`font-semibold ${color}`}>{pct.toFixed(0)}%</span>;
      },
    },
  ];

  return (
    <>
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.id}
      vacio="Sin categorías con movimiento."
      pie={
        <>
          <Total colSpan={2}>Total</Total>
          <Total derecha>{formatearMonto(totalReal)}</Total>
          <Total derecha>{formatearMonto(totalPpto)}</Total>
          <Total derecha>
            {totalPpto > 0 ? `${((totalReal / totalPpto) * 100).toFixed(0)}%` : "—"}
          </Total>
        </>
      }
    />
    {personal.total > 0 && (
      <p className="mt-4 rounded-xl bg-mist/50 p-4 text-sm text-ink-soft">
        <strong className="text-ink">Personal {formatearMonto(personal.total)}</strong> = ordinario{" "}
        <strong className="text-ink">{formatearMonto(personal.ordinario)}</strong> + parada de planta{" "}
        <strong className="text-ink">{formatearMonto(personal.paradaPlanta)}</strong>
        {" "}(solo la parada de planta es extraordinaria).
      </p>
    )}
    </>
  );
}

