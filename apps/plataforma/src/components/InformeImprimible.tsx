"use client";

import { LogoMark } from "./Logo";
import { FirmaTeoLabs } from "./FirmaTeoLabs";
import { empresa } from "@/lib/empresa";
import {
  semaforo,
  textoSemaforo,
  type CategoriaAcumulada,
  type Contrato,
  type Evolucion,
  type Totales,
} from "@/lib/dashboard";
import { formatearFecha, formatearPesos, mesLargo } from "@/lib/formato";

/**
 * El informe de control de gestión listo para imprimir o guardar como PDF.
 *
 * Es la hoja que se lleva a la reunión: el mismo número que muestra el
 * Dashboard, con la marca de Valar, ordenado para leerse en papel y firmado por
 * quien lo emitió.
 *
 * No genera el PDF por su cuenta ni carga una librería para eso: usa la
 * impresión del navegador, que ya sabe hacer PDF —"Guardar como PDF" en el
 * cuadro de imprimir— y no necesita servidor. Es el mismo camino de la orden de
 * compra (`OrdenImprimible`), y las reglas de `@media print` de `globals.css`
 * dejan en la hoja solo esto.
 *
 * Refleja los filtros que estén puestos en pantalla: si se está mirando un
 * contrato o los últimos tres meses, eso es lo que sale impreso, y el
 * encabezado lo dice.
 */

export function InformeImprimible({
  total,
  contratos,
  evolucion,
  categorias,
  meta,
  alcance,
  emitidoPor,
}: {
  total: Totales;
  contratos: Contrato[];
  evolucion: Evolucion[];
  categorias: CategoriaAcumulada[];
  meta: number;
  /** Qué se está mirando: "Todos los contratos · últimos 3 meses". */
  alcance: string;
  emitidoPor: string;
}) {
  const luz = semaforo(total.margenPct, meta);
  const desde = evolucion[0];
  const hasta = evolucion[evolucion.length - 1];

  const periodo =
    !desde || !hasta
      ? "—"
      : desde.periodo === hasta.periodo
        ? mesLargo(desde.periodo)
        : `${mesLargo(desde.periodo)} — ${mesLargo(hasta.periodo)}`;

  return (
    <article className="hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-ink lg:p-12">
      {/* Encabezado */}
      <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-auto text-ink" />
          <div>
            <p className="font-display text-base font-semibold leading-tight tracking-[0.1em]">
              {empresa.razonSocial.toUpperCase()}
            </p>
            <p className="text-xs text-ink-soft">RUT {empresa.rut}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="whitespace-nowrap font-display text-2xl font-semibold">
            CONTROL DE GESTIÓN
          </h1>
          <p className="mt-1 text-sm font-semibold">{periodo}</p>
        </div>
      </header>

      <p className="mt-4 text-xs text-ink-soft">
        {alcance} · Cifras netas de IVA · Emitido el {formatearFecha(hoy())} por {emitidoPor}
      </p>

      {/* Consolidado */}
      <section className="mt-6">
        <Titulo>Resultado del período</Titulo>
        <div className="mt-3 grid grid-cols-4 gap-4 border-y border-mist-deep py-4">
          <Cifra etiqueta="Ventas netas" valor={formatearPesos(total.venta)} />
          <Cifra etiqueta="Costos" valor={formatearPesos(total.costo)} />
          <Cifra etiqueta="Resultado" valor={formatearPesos(total.margen)} />
          <Cifra
            etiqueta="Rentabilidad"
            valor={`${total.margenPct.toFixed(1)}%`}
            nota={`${textoSemaforo[luz]} · meta ${meta}%`}
          />
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          {/* Si todavía no hay facturas cargadas, "cobrado: $0" confunde más de
              lo que informa: mejor no decir nada. */}
          {total.cobrado > 0 && <>Cobrado en el período: {formatearPesos(total.cobrado)}.</>}
          {total.reembolsable > 0 && (
            <>
              {" "}
              Además hay {formatearPesos(total.reembolsable)} en gastos reembolsables, que se
              le cobran al mandante y por eso no descuentan del margen.
            </>
          )}
        </p>
      </section>

      {/* Por contrato */}
      {contratos.length > 0 && (
        <section className="mt-7">
          <Titulo>Por contrato</Titulo>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-[10px] font-semibold uppercase tracking-[0.1em]">
                <th className="py-2">Contrato</th>
                <th className="py-2">Cliente</th>
                <th className="py-2 text-right">Ventas</th>
                <th className="py-2 text-right">Costos</th>
                <th className="py-2 text-right">Resultado</th>
                <th className="py-2 text-right">Rent.</th>
                <th className="py-2 text-right">Meta</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id} className="border-b border-mist">
                  <td className="py-2 pr-3">
                    <span className="block font-semibold">{c.nombre}</span>
                    <span className="text-[11px] text-ink-soft">{c.id}</span>
                  </td>
                  <td className="py-2 pr-3 text-ink-soft">{c.cliente}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatearPesos(c.totales.venta)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatearPesos(c.totales.costo)}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {formatearPesos(c.totales.margen)}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {c.totales.margenPct.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">{c.meta}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink font-semibold">
                <td className="py-2" colSpan={2}>
                  Consolidado
                </td>
                <td className="py-2 text-right tabular-nums">{formatearPesos(total.venta)}</td>
                <td className="py-2 text-right tabular-nums">{formatearPesos(total.costo)}</td>
                <td className="py-2 text-right tabular-nums">{formatearPesos(total.margen)}</td>
                <td className="py-2 text-right tabular-nums">{total.margenPct.toFixed(1)}%</td>
                <td className="py-2 text-right tabular-nums">{meta}%</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Mes a mes */}
      <section className="mt-7">
        <Titulo>Mes a mes</Titulo>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-left text-[10px] font-semibold uppercase tracking-[0.1em]">
              <th className="py-2">Mes</th>
              <th className="py-2 text-right">Ventas</th>
              <th className="py-2 text-right">Costos</th>
              <th className="py-2 text-right">Resultado</th>
              <th className="py-2 text-right">Rent.</th>
              <th className="py-2 text-right">Contra la meta</th>
            </tr>
          </thead>
          <tbody>
            {evolucion.map((m) => {
              const brecha = m.consolidado.margenPct - meta;
              return (
                <tr key={m.periodo} className="border-b border-mist">
                  <td className="py-2 font-semibold">{mesLargo(m.periodo)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatearPesos(m.consolidado.venta)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatearPesos(m.consolidado.costo)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatearPesos(m.consolidado.margen)}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {m.consolidado.margenPct.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {/* El signo va explícito: en una hoja impresa, un "-2,4"
                        suelto se confunde con un guión. */}
                    {brecha >= 0 ? "+" : "−"}
                    {Math.abs(brecha).toFixed(1)} pts
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Categorías */}
      {categorias.length > 0 && (
        <section className="mt-7 break-inside-avoid">
          <Titulo>Costo por categoría</Titulo>
          <p className="mt-1 text-[11px] text-ink-soft">
            Acumulado del período contra el presupuesto mensual del contrato.
          </p>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-[10px] font-semibold uppercase tracking-[0.1em]">
                <th className="py-2">Categoría</th>
                <th className="py-2">Contrato</th>
                <th className="py-2 text-right">Real</th>
                <th className="py-2 text-right">Presupuesto</th>
                <th className="py-2 text-right">Consumo</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.id} className="border-b border-mist">
                  <td className="py-2 pr-3">{c.categoria}</td>
                  <td className="py-2 pr-3 text-ink-soft">{c.contratoId}</td>
                  <td className="py-2 text-right tabular-nums">{formatearPesos(c.real)}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">
                    {c.presupuesto > 0 ? formatearPesos(c.presupuesto) : "—"}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {c.presupuesto > 0 ? `${((c.real / c.presupuesto) * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Firmas */}
      <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs">
        <div>
          <div className="mx-auto h-12" />
          <p className="border-t border-ink pt-2 font-semibold">{emitidoPor}</p>
          <p className="mt-0.5 text-ink-soft">Elaborado por</p>
        </div>
        <div>
          <div className="mx-auto h-12" />
          <p className="border-t border-ink pt-2 font-semibold">{empresa.representante}</p>
          <p className="mt-0.5 text-ink-soft">Revisado por</p>
        </div>
      </div>

      <p className="mt-8 border-t border-mist pt-3 text-center text-[10px] text-ink-soft">
        {empresa.razonSocial} · {empresa.direccion} · Documento generado por la Plataforma
        Valar desde los datos cargados en Ingresos y Egresos.
      </p>
      {/* La firma va al pie de cada documento que sale de la plataforma. */}
      <div className="mt-8 flex justify-center border-t border-mist pt-3">
        <FirmaTeoLabs />
      </div>
    </article>
  );
}

/** La fecha de hoy en el formato que usa el resto del módulo. */
function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-mist-deep pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </h2>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {etiqueta}
      </p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-[10px] text-ink-soft">{nota}</p>}
    </div>
  );
}
