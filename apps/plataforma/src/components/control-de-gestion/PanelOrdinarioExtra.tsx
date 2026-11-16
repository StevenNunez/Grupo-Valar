"use client";

import Link from "next/link";
import type { Totales } from "@/lib/dashboard";
import { formatearMonto } from "@/lib/formato";
import { totalOficina, type EgresoOficina } from "@/lib/oficina-central";

/**
 * Ordinario contra extraordinario. Sirve para cruzar el estado de pago
 * extraordinario con lo que realmente costó la parada de planta: sin esto, un
 * indicador bajo no se puede explicar. El único costo extraordinario son las HH
 * de parada de planta; todo lo demás (incluidas las otras HH extra) es ordinario.
 */
export function PanelOrdinarioExtra({ total }: { total: Totales }) {
  const costoExtra = total.costoParadaPlanta;
  /* Cuánto del EP extraordinario se fue en la parada de planta. */
  const usoExtra = total.ventaExtraordinaria > 0 ? (costoExtra / total.ventaExtraordinaria) * 100 : null;
  const resultadoOrd = total.ventaOrdinaria - total.costoOrdinario;
  const resultadoExtra = total.ventaExtraordinaria - costoExtra;
  const pct = (resultado: number, venta: number) => (venta > 0 ? `${((resultado / venta) * 100).toFixed(1)}%` : "—");
  const color = (n: number) => (n < 0 ? "text-peligro" : "text-ink");
  const horas = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`;
  const { hh } = total;
  /* Lo que se trabajó en parada contra lo que el EP extraordinario cobra. */
  const sinCobrar = hh.horasCobradas > 0 ? Math.max(0, hh.horasParada - hh.horasCobradas) : 0;
  const tarifaCobrada = hh.horasCobradas > 0 ? total.ventaExtraordinaria / hh.horasCobradas : 0;
  const costoPorHora = hh.horasParada > 0 ? costoExtra / hh.horasParada : 0;
  const pctDe = (parte: number, todo: number) => (todo > 0 ? `${((parte / todo) * 100).toFixed(1)}%` : "—");

  /* Cada columna cuenta su historia en tres cifras; el detalle va entre paréntesis. */
  const cifra = (titulo: string, valor: string, detalle: string | null, rojo = false) => (
    <div key={titulo} className="flex items-baseline justify-between gap-3 border-b border-mist-deep/60 py-3 last:border-0">
      <dt className="text-sm font-semibold text-ink">{titulo}</dt>
      <dd className={`text-right font-display text-lg font-semibold ${rojo ? "text-peligro" : "text-ink"}`}>
        {valor}
        {detalle && <span className="ml-2 text-sm font-normal text-ink-soft">({detalle})</span>}
      </dd>
    </div>
  );

  /* Motivos que forman el sobrecosto, con lo que pesa cada uno. */
  const motivos = [
    { id: "reemplazo", titulo: "Reemplazos por vacaciones o licencias", valor: hh.reemplazo },
    { id: "feriado", titulo: "Feriados compensados", valor: hh.feriado },
    { id: "apoyo", titulo: "Apoyo oficina", valor: hh.apoyo },
    { id: "otras", titulo: "Otras", valor: hh.otras },
    { id: "sinMotivo", titulo: "Sin motivo indicado", valor: hh.sinMotivo },
  ].filter((m) => m.valor > 0);

  return (
    <section aria-labelledby="ord-extra" className="mb-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8">
      <h2 id="ord-extra" className="font-display text-lg font-semibold text-ink">Ordinario y extraordinario</h2>
      <p className="mb-5 mt-1 text-sm text-ink-soft">
        Solo las HH de parada de planta son costo extraordinario; todo lo demás (planta, reemplazos, licencias, feriados
        compensados, apoyo oficina, compras y servicios) es ordinario.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Ordinario</h3>
          <dl>
            {cifra("Venta", formatearMonto(total.ventaOrdinaria), null)}
            {cifra("Costo", formatearMonto(total.costoOrdinario), hh.sobrecosto > 0 ? `sobrecosto ${formatearMonto(hh.sobrecosto)}` : null)}
            {cifra("Resultado", formatearMonto(resultadoOrd), pct(resultadoOrd, total.ventaOrdinaria), resultadoOrd < 0)}
          </dl>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Extraordinario</h3>
          <dl>
            {cifra("Venta", formatearMonto(total.ventaExtraordinaria), hh.horasCobradas > 0 ? `${horas(hh.horasCobradas)} cobradas` : null)}
            {cifra("Costo", formatearMonto(costoExtra), hh.horasParada > 0 ? `${horas(hh.horasParada)} trabajadas` : null)}
            {cifra("Resultado", formatearMonto(resultadoExtra), pct(resultadoExtra, total.ventaExtraordinaria), resultadoExtra < 0)}
            {sinCobrar > 0 && cifra("No cobrado", formatearMonto(sinCobrar * tarifaCobrada), `${horas(sinCobrar)} sin cobrar`, true)}
          </dl>
        </div>
      </div>

      {/* Qué causa las desviaciones: de dónde sale el sobrecosto y cuánto pesa la parada contra su EP. */}
      <div className="mt-6 border-t border-mist-deep pt-5">
        <h3 className="font-display text-base font-semibold text-ink">Desviaciones y su causa</h3>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-mist/50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-ink">Sobrecosto ordinario · horas extra no cobradas</span>
              <span className={`font-semibold ${hh.sobrecosto > 0 ? "text-peligro" : "text-ink"}`}>{formatearMonto(hh.sobrecosto)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              HH extra que no van en el estado de pago extraordinario (todo menos parada de planta)
              {hh.sobrecosto > 0 ? ` · ${pctDe(hh.sobrecosto, total.costoOrdinario)} del costo ordinario · ${horas(hh.horasOrdinarias)} extra` : ""}.
            </p>
            {hh.sobrecosto > 0 && total.ventaOrdinaria > 0 && (
              <dl className="mt-3 grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-soft">Pesa sobre la venta ordinaria</dt>
                  <dd className="font-semibold text-peligro">{pctDe(hh.sobrecosto, total.ventaOrdinaria)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-soft">Margen ordinario sin el sobrecosto</dt>
                  <dd className="font-semibold text-ink">
                    {pct(resultadoOrd + hh.sobrecosto, total.ventaOrdinaria)}
                    <span className="ml-1 text-xs font-normal text-ink-soft">
                      (hoy {pct(resultadoOrd, total.ventaOrdinaria)} · {formatearMonto(resultadoOrd + hh.sobrecosto)})
                    </span>
                  </dd>
                </div>
              </dl>
            )}
            {motivos.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Sin horas extra ordinarias en el período.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {motivos.map((m) => (
                  <li key={m.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-ink">{m.titulo}</span>
                      <span className="font-semibold tabular-nums text-ink">
                        {formatearMonto(m.valor)}
                        <span className="ml-2 text-xs font-normal text-ink-soft">{pctDe(m.valor, hh.sobrecosto)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white" aria-hidden="true">
                      <span className="block h-full rounded-full bg-alerta" style={{ width: `${hh.sobrecosto > 0 ? Math.min((m.valor / hh.sobrecosto) * 100, 100) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Lo extraordinario de un vistazo: cuánto del EP extraordinario se fue en la parada. */}
          <div className="rounded-xl bg-mist/50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-ink">Parada de planta contra el EP extraordinario</span>
              <span className={`font-semibold ${usoExtra !== null && usoExtra > 100 ? "text-peligro" : "text-ink"}`}>
                {usoExtra === null ? (costoExtra > 0 ? "Sin EP extraordinario" : "Sin parada de planta") : `${usoExtra.toFixed(0)}% del EP`}
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white" role="img"
              aria-label={usoExtra === null ? "Sin datos para comparar" : `La parada de planta equivale al ${usoExtra.toFixed(0)}% del EP extraordinario`}>
              <span className="block h-full rounded-full" style={{ width: `${Math.min(usoExtra ?? 0, 100)}%`, background: usoExtra !== null && usoExtra > 100 ? "#a52f24" : "#9c5518" }} />
            </div>
            {sinCobrar > 0 && (
              <dl className="mt-3 grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-soft">Horas trabajadas · cobradas · sin cobrar</dt>
                  <dd className="font-semibold text-ink">
                    {horas(hh.horasParada)} · {horas(hh.horasCobradas)} · <span className="text-peligro">{horas(sinCobrar)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-soft">Dejado de ganar (a {formatearMonto(tarifaCobrada)} la hora cobrada)</dt>
                  <dd className="font-semibold text-peligro">
                    {formatearMonto(sinCobrar * tarifaCobrada)}
                    <span className="ml-1 text-xs font-normal text-ink-soft">(esas horas costaron {formatearMonto(sinCobrar * costoPorHora)})</span>
                  </dd>
                </div>
              </dl>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              EP extraordinario {formatearMonto(total.ventaExtraordinaria)} · parada de planta {formatearMonto(costoExtra)}
              {total.ventaExtraordinaria > 0 ? ` · ${resultadoExtra >= 0 ? "sobra" : "falta"} ${formatearMonto(Math.abs(resultadoExtra))}` : ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Indicadores paralelos: Oficina Central y Finiquitos, más chicos que los cuatro
 * principales y con colores propios (oscuro y violeta) para que no se lean como
 * parte del resultado de los contratos.
 */
export function IndicadoresParalelos({
  filas, personal, margenContratos, finiquitos, conOficina, activosDeContratos,
}: { filas: EgresoOficina[]; personal: number; margenContratos: number; finiquitos: number; conOficina: boolean; activosDeContratos: { total: number; contratos: number } }) {
  // La nómina de la oficina es gasto operativo: sin ella el resultado se ve mejor de lo que es.
  const operativos = totalOficina(filas.filter((fila) => !fila.esActivo)) + personal;
  const activosDirectos = totalOficina(filas.filter((fila) => fila.esActivo));
  // Lo que Oficina Central gastó en activos. Lo de contratos cerrados no entra: ahí ya se gastó.
  const activos = activosDirectos;
  const consolidado = margenContratos - (conOficina ? operativos : 0) - finiquitos;

  const mini = (etiqueta: string, valor: string, nota: string, oscuro: boolean, rojo = false) => (
    <div key={etiqueta} className="min-w-[9.5rem] flex-1">
      <dt className={`text-xs font-semibold uppercase tracking-[0.14em] ${oscuro ? "text-white/60" : "text-realce"}`}>{etiqueta}</dt>
      <dd className={`mt-1.5 font-display text-lg font-semibold leading-none ${rojo ? (oscuro ? "text-peligro-claro" : "text-peligro") : oscuro ? "text-white" : "text-realce"}`}>{valor}</dd>
      <dd className={`mt-1 text-xs ${oscuro ? "text-white/60" : "text-ink-soft"}`}>{nota}</dd>
    </div>
  );

  return (
    <section aria-label="Oficina Central y finiquitos" className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-0">
      {conOficina && (
        <div className="rounded-2xl bg-noche p-5 text-white lg:rounded-r-none">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Oficina Central</h2>
            <Link href="/control-de-gestion/egresos/oficina-central/" className="text-xs font-semibold text-white/70 hover:text-white hover:underline">Ver movimientos →</Link>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-4">
            {mini("Gastos operativos", formatearMonto(operativos), "Compras, arriendos, personal", true)}
            {mini("Compra de activos", formatearMonto(activos), "Inversión, fuera del resultado", true)}
            {mini("Total egresos", formatearMonto(operativos + activos), `${filas.length} movimientos`, true)}
          </dl>
          {activosDeContratos.total > 0 && (
            <p className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-xs leading-relaxed text-white/80">
              <strong className="text-white">Activos de contratos cerrados: {formatearMonto(activosDeContratos.total)}</strong>
              {" "}· se gastaron en {activosDeContratos.contratos === 1 ? "un contrato" : `${activosDeContratos.contratos} contratos`} y hoy son de la empresa.
              Valorizados acá; no suman a los egresos de Oficina Central ni restan al contrato.{" "}
              <Link href="/control-de-gestion/activos/" className="font-semibold text-white underline">Ver activos →</Link>
            </p>
          )}
          {(filas.length > 0 || personal > 0) && (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
              {[...new Set(filas.map((f) => f.categoria))].map((id) => {
                const delGrupo = filas.filter((f) => f.categoria === id);
                return <span key={id}>{delGrupo[0].categoriaTitulo}: <strong className="text-white/90">{formatearMonto(totalOficina(delGrupo))}</strong></span>;
              })}
              {personal > 0 && <span>Personal: <strong className="text-white/90">{formatearMonto(personal)}</strong></span>}
            </p>
          )}
        </div>
      )}
      {/* Línea de separación entre Oficina Central y Finiquitos. */}
      {conOficina && <div aria-hidden="true" className="hidden w-px bg-mist-deep lg:mx-0 lg:block" />}
      <div className={`rounded-2xl border border-realce-borde bg-realce-suave p-5 ${conOficina ? "lg:rounded-l-none" : "lg:col-span-3"}`}>
        <h2 className="mb-4 font-display text-base font-semibold text-realce">Finiquitos · informativo</h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-4">
          {mini("Finiquitos pagados", formatearMonto(finiquitos), "No son costo del contrato; se imputan al cerrarlo", false)}
          {conOficina && mini("Resultado consolidado", formatearMonto(consolidado), "Contratos − oficina − finiquitos", false, consolidado < 0)}
        </dl>
      </div>
    </section>
  );
}

