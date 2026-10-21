"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip } from "./ui/Chip";
import { Dialogo } from "./ui/Formulario";
import { agregarCuotas, cambiarCuota, cargarCuotas, quitarCuota, UMBRAL_CUOTAS, type Cuota, type CuentaPorPagar } from "@/lib/pagos";
import { formatearFecha, formatearPesos } from "@/lib/formato";

/**
 * Los pagos de una factura en cuotas (acuerdo de pago, 0097).
 *
 * Una factura grande se acuerda con el proveedor en partes —p. ej. 15 M + 15 M +
 * el saldo—. Acá se arma ese plan, se programa cada cuota en una semana de pago
 * y se anota cuándo se transfiere. La factura pasa sola a «pagada» cuando lo
 * pagado completa su total.
 */

const hoy = () => new Date().toISOString().slice(0, 10);
const entero = (v: string) => Math.max(0, Math.round(Number(v.replace(/\D/g, "")) || 0));
const campo = "w-full rounded-lg border border-mist-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";
const boton = "rounded-full border border-mist-deep px-3.5 py-1.5 text-xs font-semibold text-ink hover:border-ink disabled:opacity-50";
const botonPrimario = "rounded-full bg-cyan px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-deep disabled:opacity-50";

export function PagosDeFactura({ linea, fechas, puedeProgramar, puedeMarcar, alCerrar, alCambiar }: {
  linea: CuentaPorPagar;
  /** Las próximas fechas de pago semanal, para programar cada cuota. */
  fechas: string[];
  puedeProgramar: boolean;
  puedeMarcar: boolean;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const compraId = linea.compraId as string;
  const [cuotas, setCuotas] = useState<Cuota[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  /** La cuota en la que se está anotando el pago, con lo que se escribe. */
  const [pagando, setPagando] = useState<{ id: string; fecha: string; referencia: string } | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setCuotas(await cargarCuotas(compraId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [compraId]);
  useEffect(() => {
    let vigente = true;
    cargarCuotas(compraId)
      .then((c) => vigente && setCuotas(c))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [compraId]);

  async function hacer(accion: () => Promise<void>) {
    setError(null);
    setTrabajando(true);
    try {
      await accion();
      await recargar();
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  }

  const lista = cuotas ?? [];
  const pagado = lista.filter((c) => c.fechaPago).reduce((t, c) => t + c.monto, 0);
  const sumaPlan = lista.reduce((t, c) => t + c.monto, 0);
  const saldoDelPlan = linea.total - sumaPlan;

  return (
    <Dialogo abierto alCerrar={alCerrar} ancho="max-w-3xl"
      titulo={`Pagos de la factura ${linea.documento ?? ""}`}
      descripcion={`${linea.proveedor} · ${linea.contrato}`}>
      <div className="px-6 pb-6">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Dato etiqueta="Total de la factura" valor={formatearPesos(linea.total)} />
          <Dato etiqueta="Ya pagado" valor={formatearPesos(pagado)} tono="bueno" />
          <Dato etiqueta="Falta pagar" valor={formatearPesos(Math.max(linea.total - pagado, 0))} tono={linea.total - pagado > 0 ? "aviso" : "bueno"} />
        </dl>

        {error && <p role="alert" className="mt-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">{error}</p>}

        {cuotas === null ? (
          <p className="mt-6 text-sm text-ink-soft">Cargando…</p>
        ) : lista.length === 0 ? (
          puedeProgramar || puedeMarcar ? (
            <PlanNuevo linea={linea} trabajando={trabajando}
              alCrear={(c) => hacer(() => agregarCuotas(compraId, c))} />
          ) : (
            <p className="mt-6 text-sm text-ink-soft">Esta factura no tiene un plan de cuotas.</p>
          )
        ) : (
          <>
            <ul className="mt-6 flex flex-col gap-2">
              {lista.map((c) => (
                <li key={c.id} className="rounded-xl border border-mist-deep px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-ink">Cuota {c.numero} · {formatearPesos(c.monto)}</span>
                      <span className="ml-2 align-middle">
                        {c.fechaPago ? <Chip tono="bueno">Pagada el {formatearFecha(c.fechaPago)}</Chip> : <Chip tono="aviso">Por pagar</Chip>}
                      </span>
                      <span className="mt-1 block text-xs text-ink-soft">
                        {c.fechaPago
                          ? c.referencia ? `Referencia ${c.referencia}` : "Sin referencia"
                          : c.fechaProgramada ? `Programada para el ${formatearFecha(c.fechaProgramada)}` : "Sin fecha programada"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!c.fechaPago && puedeProgramar && (
                        <select aria-label={`Fecha de la cuota ${c.numero}`} value={c.fechaProgramada ?? ""} disabled={trabajando}
                          onChange={(e) => hacer(() => cambiarCuota(c.id, { fechaProgramada: e.target.value || null }))}
                          className="rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-xs text-ink">
                          <option value="">Sin fecha</option>
                          {[...new Set([...(c.fechaProgramada ? [c.fechaProgramada] : []), ...fechas])].sort().map((f) => <option key={f} value={f}>{formatearFecha(f)}</option>)}
                        </select>
                      )}
                      {!c.fechaPago && puedeMarcar && (
                        <button type="button" disabled={trabajando} className={botonPrimario}
                          onClick={() => setPagando({ id: c.id, fecha: hoy(), referencia: "" })}>
                          Registrar pago
                        </button>
                      )}
                      {c.fechaPago && puedeMarcar && (
                        <button type="button" disabled={trabajando} className={boton}
                          onClick={() => hacer(() => cambiarCuota(c.id, { fechaPago: null }))}>
                          Deshacer pago
                        </button>
                      )}
                      {puedeProgramar && !c.fechaPago && (
                        quitando === c.id ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            <button type="button" disabled={trabajando} className="font-semibold text-[#a52f24] hover:underline"
                              onClick={() => hacer(async () => { await quitarCuota(c.id); setQuitando(null); })}>Sí, quitar</button>
                            <button type="button" className="text-ink-soft hover:underline" onClick={() => setQuitando(null)}>No</button>
                          </span>
                        ) : (
                          <button type="button" disabled={trabajando} className="text-xs text-ink-soft hover:text-[#a52f24] hover:underline" onClick={() => setQuitando(c.id)}>Quitar</button>
                        )
                      )}
                    </div>
                  </div>
                  {pagando?.id === c.id && (
                    <div className="mt-3 grid gap-3 rounded-lg bg-mist/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="text-xs font-semibold text-ink-soft">Fecha de pago
                        <input type="date" value={pagando.fecha} onChange={(e) => setPagando({ ...pagando, fecha: e.target.value })} className={`${campo} mt-1`} />
                      </label>
                      <label className="text-xs font-semibold text-ink-soft">N° de transferencia (opcional)
                        <input type="text" value={pagando.referencia} onChange={(e) => setPagando({ ...pagando, referencia: e.target.value })} className={`${campo} mt-1`} />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" disabled={trabajando || !pagando.fecha} className={botonPrimario}
                          onClick={() => hacer(async () => { await cambiarCuota(c.id, { fechaPago: pagando.fecha, referencia: pagando.referencia }); setPagando(null); })}>
                          Confirmar
                        </button>
                        <button type="button" className={boton} onClick={() => setPagando(null)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <p className={`mt-3 text-xs ${saldoDelPlan === 0 ? "text-ink-soft" : "text-[#8a5a09]"}`}>
              {saldoDelPlan === 0
                ? "Las cuotas suman exactamente el total de la factura."
                : saldoDelPlan > 0
                  ? `Las cuotas suman ${formatearPesos(sumaPlan)}: faltan ${formatearPesos(saldoDelPlan)} por repartir en cuotas.`
                  : `Las cuotas suman ${formatearPesos(sumaPlan)}: pasan del total por ${formatearPesos(-saldoDelPlan)}.`}
            </p>

            {puedeProgramar && saldoDelPlan > 0 && (
              <CuotaExtra numero={Math.max(...lista.map((c) => c.numero)) + 1} sugerido={saldoDelPlan} fechas={fechas} trabajando={trabajando}
                alAgregar={(c) => hacer(() => agregarCuotas(compraId, [c]))} />
            )}
          </>
        )}

        <p className="mt-5 text-xs text-ink-soft">
          La factura pasa sola a «pagada» cuando lo pagado completa su total, y mientras tanto sigue por su saldo.
          {linea.total >= UMBRAL_CUOTAS ? "" : ` Pagar en cuotas se usa sobre todo desde ${formatearPesos(UMBRAL_CUOTAS)}.`}
        </p>
      </div>
    </Dialogo>
  );
}

function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: "bueno" | "aviso" }) {
  return (
    <div className="rounded-xl border border-mist-deep px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{etiqueta}</dt>
      <dd className={`mt-1 font-display text-lg font-semibold ${tono === "bueno" ? "text-[#1f6b3b]" : tono === "aviso" ? "text-[#8a5a09]" : "text-ink"}`}>{valor}</dd>
    </div>
  );
}

/* ── El plan de cuotas, de una vez ────────────────────────────────────────── */

type CuotaNueva = { numero: number; monto: number; fechaProgramada: string | null; fechaPago?: string | null; referencia?: string };

/**
 * «Cuotas de $15.000.000, en 3»: las dos primeras de ese monto y la última por
 * el saldo, que es como se acuerdan. Si alguna ya se pagó, se anota aquí mismo.
 */
function PlanNuevo({ linea, trabajando, alCrear }: {
  linea: CuentaPorPagar;
  trabajando: boolean;
  alCrear: (c: CuotaNueva[]) => void;
}) {
  const total = linea.total;
  const [monto, setMonto] = useState("");
  const [cantidad, setCantidad] = useState("3");
  const [pagadas, setPagadas] = useState("0");
  const [fechaPago, setFechaPago] = useState(hoy());
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cada = entero(monto);
  const n = Math.min(24, Math.max(2, entero(cantidad)));
  const yaPagadas = Math.min(n - 1, entero(pagadas));

  // Las primeras n−1 por el monto acordado; la última, lo que quede.
  const plan: CuotaNueva[] = [];
  if (cada > 0) {
    let resto = total;
    for (let i = 1; i <= n; i++) {
      const m = i < n ? Math.min(cada, resto) : resto;
      if (m <= 0) break;
      plan.push({ numero: i, monto: m, fechaProgramada: null, fechaPago: i <= yaPagadas ? fechaPago : null, referencia: i <= yaPagadas ? referencia : undefined });
      resto -= m;
    }
  }

  function crear() {
    if (cada <= 0) return setError("Escribe el monto de cada cuota.");
    if (cada >= total) return setError("El monto de la cuota debe ser menor que el total de la factura.");
    if (yaPagadas > 0 && !fechaPago) return setError("Indica la fecha en que se pagaron.");
    setError(null);
    alCrear(plan);
  }

  return (
    <div className="mt-6 rounded-2xl border border-mist-deep p-5">
      <h3 className="font-display text-base font-semibold text-ink">Pagar en cuotas</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Para facturas grandes que se pagan con un acuerdo con el proveedor. Las cuotas son del monto que escribas y la última va por el saldo.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-ink-soft">Monto de cada cuota
          <input inputMode="numeric" value={monto ? entero(monto).toLocaleString("es-CL") : ""} onChange={(e) => setMonto(e.target.value)} placeholder="15.000.000" className={`${campo} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-ink-soft">Cantidad de cuotas
          <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-ink-soft">Ya pagadas
          <input inputMode="numeric" value={pagadas} onChange={(e) => setPagadas(e.target.value)} className={`${campo} mt-1`} />
        </label>
        {yaPagadas > 0 && (
          <>
            <label className="text-xs font-semibold text-ink-soft sm:col-span-1">Fecha en que se pagaron
              <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={`${campo} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-ink-soft sm:col-span-2">N° de transferencia (opcional)
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={`${campo} mt-1`} />
            </label>
          </>
        )}
      </div>

      {plan.length > 0 && (
        <ul className="mt-4 divide-y divide-mist rounded-xl border border-mist-deep text-sm">
          {plan.map((c) => (
            <li key={c.numero} className="flex items-center justify-between px-4 py-2">
              <span className="text-ink">Cuota {c.numero}{c.numero === plan.length && plan.length > 1 ? " · el saldo" : ""}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold text-ink">{formatearPesos(c.monto)}</span>
                {c.fechaPago ? <Chip tono="bueno">Pagada</Chip> : <Chip tono="aviso">Por pagar</Chip>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-[#a52f24]">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={trabajando || plan.length === 0} onClick={crear} className={botonPrimario}>
          {trabajando ? "Guardando…" : "Crear plan de cuotas"}
        </button>
        <span className="text-xs text-ink-soft">Después programas cada cuota en su semana de pago.</span>
      </div>
    </div>
  );
}

/* ── Una cuota más, a mano ────────────────────────────────────────────────── */

function CuotaExtra({ numero, sugerido, fechas, trabajando, alAgregar }: {
  numero: number;
  sugerido: number;
  fechas: string[];
  trabajando: boolean;
  alAgregar: (c: CuotaNueva) => void;
}) {
  const [monto, setMonto] = useState(String(sugerido));
  const [fecha, setFecha] = useState("");
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-mist-deep p-4">
      <label className="text-xs font-semibold text-ink-soft">Agregar la cuota {numero}
        <input inputMode="numeric" value={entero(monto).toLocaleString("es-CL")} onChange={(e) => setMonto(e.target.value)} className={`${campo} mt-1 w-40`} />
      </label>
      <label className="text-xs font-semibold text-ink-soft">Fecha de pago
        <select value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${campo} mt-1 w-40`}>
          <option value="">Sin fecha</option>
          {fechas.map((f) => <option key={f} value={f}>{formatearFecha(f)}</option>)}
        </select>
      </label>
      <button type="button" disabled={trabajando || entero(monto) <= 0} className={botonPrimario}
        onClick={() => alAgregar({ numero, monto: entero(monto), fechaProgramada: fecha || null })}>
        Agregar
      </button>
    </div>
  );
}
