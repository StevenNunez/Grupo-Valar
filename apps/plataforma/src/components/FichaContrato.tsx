"use client";

import { useEffect, useState } from "react";
import { BotonAdjuntos } from "./ui/Adjuntos";
import { Chip, type Tono } from "./ui/Chip";
import { NetoConIva } from "./formularios/CondicionesContrato";
import { cargarAnexos, estadosAnexo, nombreTipoAnexo, type Anexo, type EstadoAnexo } from "@/lib/anexos";
import {
  equiposArrendados,
  honorarioEstimado,
  montoMensualArriendo,
  sumaHitos,
} from "@/lib/condiciones";
import { monedas, type Contrato, type Moneda } from "@/lib/control-de-gestion";
import { formatearFecha, formatearNumero, formatearPesos, formatearUf } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import { catalogoCamposEdp, plantillasEdp } from "@/lib/plantillas-edp";

/**
 * La ficha de un contrato y la de sus anexos, para leerlas en la tarjeta sin
 * entrar a editar. Un anexo es, en la práctica, un contrato nuevo sobre el
 * original: se muestra con la misma estructura (qué es, cuánto, hasta cuándo,
 * su documento).
 */

const enMoneda = (n: number, moneda: Moneda) => (moneda === "UF" ? `${formatearUf(n)} UF` : formatearPesos(Math.round(n)));

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{children}</h4>;
}

/* ── El contrato ──────────────────────────────────────────────────────────── */

/* ── Resultado por anexo (0059) ───────────────────────────────────────────── */

type FilaResultado = { anexoId: string | null; nombre: string; venta: number; costo: number; margen: number };

/**
 * Venta, costo y margen de la base y de cada anexo, de todo el período. Sale de
 * `resultado_por_anexo`, con las mismas reglas que el Dashboard (lo
 * reembolsable no es costo). Solo se muestra si el contrato tiene anexos.
 */
function ResultadoPorAnexo({ c }: { c: Contrato }) {
  const [filas, setFilas] = useState<FilaResultado[] | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([
      supabase.from("resultado_por_anexo").select("anexo_id, venta, costo, margen").eq("contrato_id", c.id),
      cargarAnexos(c.id),
    ]).then(([r, anexos]) => {
      if (!vigente || r.error) return;
      const suma = new Map<string, FilaResultado>();
      const nombre = (id: string | null) => {
        const a = anexos.find((x) => x.id === id);
        return id === null ? "Contrato base" : a ? `Anexo N°${a.numero}${a.nombre ? ` · ${a.nombre}` : ""}` : id;
      };
      for (const a of anexos.filter((x) => x.estado === "vigente")) suma.set(a.id, { anexoId: a.id, nombre: nombre(a.id), venta: 0, costo: 0, margen: 0 });
      for (const f of r.data ?? []) {
        const clave = (f.anexo_id as string | null) ?? "";
        const fila = suma.get(clave) ?? { anexoId: (f.anexo_id as string | null) ?? null, nombre: nombre((f.anexo_id as string | null) ?? null), venta: 0, costo: 0, margen: 0 };
        fila.venta += Number(f.venta);
        fila.costo += Number(f.costo);
        fila.margen += Number(f.margen);
        suma.set(clave, fila);
      }
      if (!suma.has("")) suma.set("", { anexoId: null, nombre: "Contrato base", venta: 0, costo: 0, margen: 0 });
      setFilas([...suma.values()].sort((x, y) => (x.anexoId === null ? -1 : y.anexoId === null ? 1 : x.nombre.localeCompare(y.nombre))));
    });
    return () => {
      vigente = false;
    };
  }, [c.id, c.costoReal, c.facturado, c.anexos]);

  if (!filas || filas.length < 2) return null;
  const total = filas.reduce((t, f) => ({ venta: t.venta + f.venta, costo: t.costo + f.costo, margen: t.margen + f.margen }), { venta: 0, costo: 0, margen: 0 });
  const pct = (m: number, v: number) => (v > 0 ? `${((m / v) * 100).toFixed(1)}%` : "—");

  return (
    <>
      <Subtitulo>Resultado por anexo · todo el período, neto</Subtitulo>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            <th className="py-1 pr-2" />
            <th className="py-1 pr-2 text-right">Venta</th>
            <th className="py-1 pr-2 text-right">Costo</th>
            <th className="py-1 pr-2 text-right">Margen</th>
            <th className="py-1 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.anexoId ?? "base"} className="border-t border-mist-deep/50">
              <td className="py-1 pr-2 text-ink">{f.nombre}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-ink-soft">{formatearPesos(f.venta)}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-ink-soft">{formatearPesos(f.costo)}</td>
              <td className={`py-1 pr-2 text-right tabular-nums font-semibold ${f.margen < 0 ? "text-[#a52f24]" : "text-ink"}`}>{formatearPesos(f.margen)}</td>
              <td className="py-1 text-right tabular-nums text-ink-soft">{pct(f.margen, f.venta)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink/20 font-semibold">
            <td className="py-1 pr-2 text-ink">Total contrato</td>
            <td className="py-1 pr-2 text-right tabular-nums text-ink">{formatearPesos(total.venta)}</td>
            <td className="py-1 pr-2 text-right tabular-nums text-ink">{formatearPesos(total.costo)}</td>
            <td className="py-1 pr-2 text-right tabular-nums text-ink">{formatearPesos(total.margen)}</td>
            <td className="py-1 text-right tabular-nums text-ink-soft">{pct(total.margen, total.venta)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export function DetalleContrato({ c, alEditar }: { c: Contrato; alEditar?: () => void }) {
  const plantilla = plantillasEdp.find((p) => p.id === c.plantillaEdp)?.titulo ?? c.plantillaEdp;
  const camposMarcados = catalogoCamposEdp.flatMap((g) => g.campos).filter((x) => c.camposEdp.includes(x.clave));
  const k = c.condiciones;
  const a = c.forma === "arriendo" ? k.arriendo : undefined;
  const p = c.forma === "precios_unitarios" ? k.precios_unitarios : undefined;
  const s = c.forma === "suma_alzada" ? k.suma_alzada : undefined;
  const d = c.forma === "administracion_delegada" ? k.administracion_delegada : undefined;
  const equipos = (a?.equipos ?? []).filter((e) => e.tipo || e.cantidad || e.tarifa);
  const servicios = (a?.servicios ?? []).filter((x) => x.tarifa > 0);
  const itemizado = (p?.itemizado ?? []).filter((x) => x.concepto || x.precio);
  const sinCondiciones =
    equipos.length === 0 && servicios.length === 0 && itemizado.length === 0 &&
    !p?.dotacion && !p?.hh_mensuales && !(s?.hitos ?? []).length && !s?.anticipo_pct && !s?.retencion_pct && !d?.costo_estimado;

  return (
    <div className="mt-3 rounded-xl bg-mist/40 p-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato etiqueta="Monto total">{c.presupuesto ? formatearPesos(c.presupuesto) : "Sin monto total"}</Dato>
        <Dato etiqueta="Moneda">{monedas.find((m) => m.id === c.moneda)?.titulo ?? c.moneda}</Dato>
        <Dato etiqueta="Plantilla de EDP">{plantilla}</Dato>
      </dl>
      {c.presupuesto > 0 && <div className="mt-2"><NetoConIva neto={c.presupuesto} moneda="CLP" /></div>}
      {c.plantillaEdp === "configurable" && (
        <p className="mt-2 text-xs text-ink-soft">
          Campos del EDP: {camposMarcados.length ? camposMarcados.map((x) => x.etiqueta).join(", ") : "ninguno marcado"}.
        </p>
      )}

      {equipos.length > 0 && (
        <>
          <Subtitulo>Equipos arrendados</Subtitulo>
          <table className="mt-1 w-full text-sm">
            <tbody>
              {equipos.map((e, i) => (
                <tr key={i} className="border-b border-mist-deep/50 last:border-0">
                  <td className="py-1 pr-2 text-ink">{e.tipo || "Sin tipo"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-ink-soft">{formatearNumero(e.cantidad)} ×</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-ink-soft">{enMoneda(e.tarifa, c.moneda)}/mes</td>
                  <td className="py-1 text-right tabular-nums text-ink">{enMoneda(e.cantidad * e.tarifa, c.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-ink-soft">{formatearNumero(equiposArrendados(a))} equipos.</p>
          <NetoConIva neto={montoMensualArriendo(a)} moneda={c.moneda} etiqueta="Arriendo mensual neto" />
        </>
      )}
      {servicios.length > 0 && (
        <>
          <Subtitulo>Servicios con tarifa</Subtitulo>
          <p className="mt-1 text-sm text-ink">{servicios.map((x) => `${x.concepto} ${enMoneda(x.tarifa, c.moneda)}`).join(" · ")}</p>
        </>
      )}

      {p && (p.dotacion > 0 || p.hh_mensuales > 0 || itemizado.length > 0) && (
        <>
          <Subtitulo>Dotación e itemizado</Subtitulo>
          {(p.dotacion > 0 || p.hh_mensuales > 0) && (
            <p className="mt-1 text-sm text-ink">
              {p.dotacion > 0 && `${formatearNumero(p.dotacion)} personas`}
              {p.dotacion > 0 && p.hh_mensuales > 0 && " · "}
              {p.hh_mensuales > 0 && `${formatearNumero(p.hh_mensuales)} HH al mes`}
            </p>
          )}
          {itemizado.length > 0 && (
            <table className="mt-1 w-full text-sm">
              <tbody>
                {itemizado.map((x, i) => (
                  <tr key={i} className="border-b border-mist-deep/50 last:border-0">
                    <td className="py-1 pr-2 text-ink">{x.concepto}</td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">{enMoneda(x.precio, c.moneda)} / {x.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {s && (s.anticipo_pct > 0 || s.retencion_pct > 0 || s.hitos.length > 0) && (
        <>
          <Subtitulo>Forma de pago</Subtitulo>
          {(s.anticipo_pct > 0 || s.retencion_pct > 0) && (
            <p className="mt-1 text-sm text-ink">Anticipo {formatearNumero(s.anticipo_pct)}% · Retención {formatearNumero(s.retencion_pct)}%</p>
          )}
          {s.hitos.length > 0 && (
            <ul className="mt-1 text-sm">
              {s.hitos.map((h, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-mist-deep/50 py-1 last:border-0">
                  <span className="text-ink">{h.nombre || `Hito ${i + 1}`}</span>
                  <span className="tabular-nums text-ink-soft">
                    {formatearNumero(h.porcentaje)}%{h.fecha ? ` · ${formatearFecha(h.fecha)}` : ""}
                    {c.presupuesto > 0 ? ` · ${formatearPesos(Math.round((c.presupuesto * h.porcentaje) / 100))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {s.hitos.length > 0 && sumaHitos(s) !== 100 && (
            <p className="mt-1 text-xs text-[#8a5a09]">Los hitos suman {formatearNumero(sumaHitos(s))}%.</p>
          )}
        </>
      )}

      {d && d.costo_estimado > 0 && (
        <>
          <Subtitulo>Costo y honorario</Subtitulo>
          <p className="mt-1 text-sm text-ink">
            Costo estimado {enMoneda(d.costo_estimado, c.moneda)} · Honorario {formatearNumero(d.honorario_pct)}%
            {d.tope > 0 ? ` · Tope ${enMoneda(d.tope, c.moneda)}` : ""}
          </p>
          <NetoConIva neto={d.costo_estimado + honorarioEstimado(d)} moneda={c.moneda} etiqueta="Costo + honorario neto" />
        </>
      )}

      <ResultadoPorAnexo c={c} />

      {sinCondiciones && (
        <p className="mt-3 text-xs text-ink-soft">
          Todavía no tiene cargado lo propio de su forma de contratación.
          {alEditar && (
            <button type="button" onClick={alEditar} className="ml-1 font-semibold text-cyan-deep hover:underline">Completarlo</button>
          )}
        </p>
      )}
    </div>
  );
}

/* ── Sus anexos ───────────────────────────────────────────────────────────── */

const tonoAnexo: Record<EstadoAnexo, Tono> = { vigente: "bueno", borrador: "aviso", anulado: "neutro" };

/**
 * Los anexos, cada uno como su propia ficha. Se piden al abrir y se vuelven a
 * pedir si el contrato cambia (un anexo nuevo cambia su conteo y sus montos).
 * Crear o editar sigue en su ventana, donde están sus campos.
 */
export function AnexosDesplegados({
  c,
  alGestionar,
  alVerAdjuntos,
}: {
  c: Contrato;
  alGestionar: () => void;
  alVerAdjuntos: (anexo: Anexo) => void;
}) {
  const [lista, setLista] = useState<Anexo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarAnexos(c.id)
      .then((a) => vigente && setLista(a))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [c.id, c.anexos, c.montoAnexos, c.diasAnexos]);

  return (
    <div className="mt-3 rounded-xl bg-mist/40 p-3">
      {error ? (
        <p className="text-xs text-[#a52f24]">{error}</p>
      ) : lista === null ? (
        <p className="text-xs text-ink-soft">Cargando anexos…</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-ink-soft">Este contrato no tiene anexos.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((a) => (
            <li key={a.id} className="rounded-xl border border-mist-deep bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-ink">
                    Anexo N° {a.numero}{a.nombre ? ` · ${a.nombre}` : ""}
                  </p>
                  <p className="text-xs font-semibold text-ink-soft">{nombreTipoAnexo[a.tipo]}</p>
                  {a.descripcion && <p className="mt-0.5 text-sm text-ink-soft">{a.descripcion}</p>}
                </div>
                <Chip tono={tonoAnexo[a.estado]}>{estadosAnexo.find((e) => e.id === a.estado)?.titulo ?? a.estado}</Chip>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Dato etiqueta="Fecha">{formatearFecha(a.fecha)}</Dato>
                <Dato etiqueta="Monto">
                  {a.monto !== 0 ? `${a.monto > 0 ? "+" : "−"}${formatearPesos(Math.abs(a.monto))}` : "—"}
                </Dato>
                <Dato etiqueta="Plazo">{a.diasPlazo !== 0 ? `${a.diasPlazo > 0 ? "+" : "−"}${Math.abs(a.diasPlazo)} días` : "—"}</Dato>
                <Dato etiqueta="Nuevo término">{a.nuevaFechaTermino ? formatearFecha(a.nuevaFechaTermino) : "—"}</Dato>
              </dl>
              {a.monto > 0 && <div className="mt-2"><NetoConIva neto={a.monto} moneda="CLP" etiqueta="Monto neto del anexo" /></div>}
              {a.observaciones && <p className="mt-2 text-xs leading-relaxed text-ink-soft">{a.observaciones}</p>}

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-mist pt-2">
                <span className="text-xs text-ink-soft">{a.documento ? `Documento ${a.documento}` : "Sin N° de documento"}</span>
                <BotonAdjuntos onClick={() => alVerAdjuntos(a)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={alGestionar} className="mt-3 text-xs font-semibold text-cyan-deep hover:underline">
        Crear o editar anexos →
      </button>
    </div>
  );
}
