"use client";

import { useState } from "react";
import { PanelFiniquitos } from "./Finiquitos";
import { Dialogo } from "./ui/Formulario";
import { Contenido } from "./ui/Vista";
import { useConsulta } from "@/lib/consulta";
import {
  cargarCierre,
  cerrarContrato,
  guardarObservacionesCierre,
  reabrirContrato,
  type DatosCierre,
} from "@/lib/cierre-contrato";
import type { Contrato } from "@/lib/control-de-gestion";
import { formatearFecha, formatearMonto, mesLargo } from "@/lib/formato";
import { usePuede } from "@/lib/sesion";

/**
 * Ficha de cierre económico de un contrato.
 *
 * Es otra pantalla que la ficha operativa: acá no se mide el mes, se cierra la
 * cuenta. Ingresos totales, costos acumulados y finiquitos pagados dan el
 * resultado y la rentabilidad finales. Cerrar solo cambia la vista del
 * contrato: no borra ni mueve ningún registro, y su venta histórica sigue en
 * los informes.
 */

const hoy = () => new Date().toISOString().slice(0, 10);

const claseBoton =
  "rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60";

export function FichaCierre({
  contrato,
  alCerrar,
  alCambiar,
}: {
  contrato: Contrato;
  alCerrar: () => void;
  /** Recarga la lista de contratos cuando el estado cambió. */
  alCambiar: () => void;
}) {
  const { estado, recargar } = useConsulta<DatosCierre>(() => cargarCierre(contrato.id));
  const yaCerrado = contrato.vigencia === "cerrado" || contrato.vigencia === "cancelado";
  const puedeEditar = usePuede("contratos.editar");
  const [observaciones, setObservaciones] = useState(contrato.cierreObservaciones);
  const [fecha, setFecha] = useState(contrato.cerradoEn ?? hoy());
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async (accion: () => Promise<void>, cerrarDespues: boolean) => {
    setTrabajando(true);
    setError(null);
    try {
      await accion();
      alCambiar();
      if (cerrarDespues) alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setTrabajando(false);
      setConfirmando(false);
    }
  };

  return (
    <Dialogo
      abierto
      alCerrar={alCerrar}
      ancho="max-w-5xl"
      titulo={yaCerrado ? `Cierre · ${contrato.nombre}` : `Cerrar contrato · ${contrato.nombre}`}
      descripcion={`${contrato.id} · ${contrato.cliente}${contrato.cerradoEn ? ` · cerrado el ${formatearFecha(contrato.cerradoEn)}` : ""}`}
    >
      <div className="px-6 py-6">
        <Contenido consulta={estado}>
          {(d) => (
            <>
              <Cifras d={d} />

              <section className="mt-6" aria-labelledby="cierre-meses">
                <h3 id="cierre-meses" className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Mes a mes
                </h3>
                {d.meses.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">Este contrato no tiene ventas ni costos cargados.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-mist-deep">
                    <table className="w-full text-sm">
                      <thead className="bg-mist/50 text-left text-xs text-ink-soft">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Mes</th>
                          <th className="px-4 py-2 text-right font-semibold">Ingresos</th>
                          <th className="px-4 py-2 text-right font-semibold">Costos</th>
                          <th className="px-4 py-2 text-right font-semibold">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.meses.map((m) => (
                          <tr key={m.periodo} className="border-t border-mist">
                            <td className="px-4 py-2 text-ink">{mesLargo(m.periodo)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-soft">{formatearMonto(m.venta)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-soft">{formatearMonto(m.costo)}</td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">
                              {formatearMonto(m.venta - m.costo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="mt-6" aria-labelledby="cierre-finiquitos">
                <h3 id="cierre-finiquitos" className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Finiquitos del contrato
                </h3>
                <p className="mb-3 text-sm text-ink-soft">
                  Se imputan acá y restan del resultado final. No forman parte del costo mensual ni de la
                  rentabilidad del Dashboard.
                </p>
                <PanelFiniquitos
                  de="contratos"
                  filas={d.listaFiniquitos}
                  contratos={d.contratos}
                  categorias={d.categorias}
                  alCambiar={recargar}
                />
              </section>

              <section className="mt-6">
                <label htmlFor="cierre-obs" className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Observaciones del cierre
                </label>
                <textarea
                  id="cierre-obs"
                  rows={3}
                  value={observaciones}
                  disabled={!puedeEditar}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Diferencias, antecedentes, acuerdos con el mandante…"
                  className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20 disabled:bg-mist/50"
                />
              </section>
            </>
          )}
        </Contenido>
      </div>

      <div className="border-t border-mist px-6 py-5">
        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {puedeEditar && yaCerrado && contrato.vigencia === "cerrado" && (
            <button
              type="button"
              disabled={trabajando}
              onClick={() => ejecutar(() => reabrirContrato(contrato.id), true)}
              className={`${claseBoton} mr-auto text-[#a52f24] hover:bg-[#fdeeec]`}
            >
              Reabrir contrato
            </button>
          )}
          {puedeEditar && !yaCerrado && (
            <label className="mr-auto flex items-center gap-2 text-sm text-ink-soft">
              Fecha de cierre
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded-xl border border-mist-deep bg-white px-3 py-2 text-ink outline-none focus:border-cyan"
              />
            </label>
          )}
          <button
            type="button"
            onClick={alCerrar}
            className={`${claseBoton} border border-mist-deep text-ink-soft hover:border-ink hover:text-ink`}
          >
            Cerrar ventana
          </button>
          {puedeEditar && yaCerrado && (
            <button
              type="button"
              disabled={trabajando}
              onClick={() => ejecutar(() => guardarObservacionesCierre(contrato.id, observaciones), false)}
              className={`${claseBoton} bg-cyan text-white hover:bg-cyan-deep`}
            >
              {trabajando ? "Guardando…" : "Guardar observaciones"}
            </button>
          )}
          {puedeEditar && !yaCerrado && !confirmando && (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className={`${claseBoton} bg-cyan text-white hover:bg-cyan-deep`}
            >
              Cerrar contrato
            </button>
          )}
          {puedeEditar && !yaCerrado && confirmando && (
            <button
              type="button"
              disabled={trabajando || !fecha}
              onClick={() => ejecutar(() => cerrarContrato(contrato.id, fecha, observaciones), true)}
              className={`${claseBoton} bg-[#a52f24] text-white hover:bg-[#8c261d]`}
            >
              {trabajando ? "Cerrando…" : "Confirmar: pasa a Cerrados"}
            </button>
          )}
        </div>
        {!yaCerrado && confirmando && (
          <p className="mt-3 text-right text-xs text-ink-soft">
            Sale de los vigentes y del Dashboard operativo. No se borra nada: lo puedes reabrir.
          </p>
        )}
      </div>
    </Dialogo>
  );
}

function Cifras({ d }: { d: DatosCierre }) {
  const pct = d.rentabilidadPct;
  const tono = pct === null ? "" : pct < 0 ? "text-[#a52f24]" : "text-[#0e7a4f]";
  const items: { etiqueta: string; valor: string; nota?: string; clase?: string }[] = [
    { etiqueta: "Ingresos totales", valor: formatearMonto(d.ingresos), nota: "Estados de pago netos" },
    {
      etiqueta: "Costos acumulados",
      valor: formatearMonto(d.costos),
      nota: d.reembolsable > 0 ? `${formatearMonto(d.reembolsable)} reembolsables aparte` : "Compras, servicios y personal",
    },
    {
      etiqueta: "Finiquitos pagados",
      valor: formatearMonto(d.finiquitos),
      nota: `${d.listaFiniquitos.length} ${d.listaFiniquitos.length === 1 ? "finiquito" : "finiquitos"}`,
    },
    {
      etiqueta: "Resultado económico",
      valor: formatearMonto(d.resultado),
      nota: "Ingresos − costos − finiquitos",
      clase: d.resultado < 0 ? "text-[#a52f24]" : "text-ink",
    },
    {
      etiqueta: "Rentabilidad final",
      valor: pct === null ? "—" : `${pct.toFixed(1)}%`,
      nota: pct === null ? "Sin ventas" : "Sobre los ingresos",
      clase: tono,
    },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((i) => (
        <div key={i.etiqueta} className="rounded-2xl border border-mist-deep bg-white p-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{i.etiqueta}</dt>
          <dd className={`mt-2 font-display text-xl font-semibold tabular-nums ${i.clase ?? "text-ink"}`}>{i.valor}</dd>
          {i.nota && <dd className="mt-1 text-xs text-ink-soft">{i.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}
