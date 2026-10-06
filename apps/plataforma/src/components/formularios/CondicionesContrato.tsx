"use client";

import { useState } from "react";
import { Ancho } from "../ui/Formulario";
import {
  conIva,
  conIvaUf,
  equiposArrendados,
  honorarioEstimado,
  montoMensualArriendo,
  sumaHitos,
  type Condiciones,
  type Equipo,
  type Hito,
  type ItemPrecio,
  type Servicio,
} from "@/lib/condiciones";
import type { FormaContrato, Moneda } from "@/lib/control-de-gestion";
import { formatearNumero, formatearPesos, formatearUf } from "@/lib/formato";
import { catalogoCamposEdp } from "@/lib/plantillas-edp";

/**
 * Lo que pide el contrato según su forma de contratación (lib/condiciones.ts).
 *
 * Todo es opcional: el contrato se crea aunque no se sepan todavía sus
 * tarifas. Todos los montos se escriben NETOS; el IVA y el total con IVA se
 * muestran solos al lado.
 */

const celda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";

/**
 * Un número escrito en una celda. Con decimales (UF, porcentajes) se acepta
 * "39,4" y "39.4"; si hay coma, los puntos son de miles ("1.200,5").
 */
function leer(texto: string, decimales: boolean) {
  const t = texto.trim();
  const limpio = !decimales ? t.replace(/\D/g, "") : t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mientras se escribe, la celda muestra exactamente lo tecleado (si no, "39,"
 * se volvería "39" antes de poner el decimal). Al salir, se formatea.
 */
function CeldaNumero({ valor, alCambiar, decimales = false, etiqueta }: { valor: number; alCambiar: (n: number) => void; decimales?: boolean; etiqueta: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const formateado = valor === 0 ? "" : decimales ? String(valor).replace(".", ",") : valor.toLocaleString("es-CL");
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      value={texto ?? formateado}
      placeholder="0"
      onFocus={() => setTexto(formateado)}
      onBlur={() => setTexto(null)}
      onChange={(e) => {
        setTexto(e.target.value);
        alCambiar(leer(e.target.value, decimales));
      }}
      className={`${celda} text-right tabular-nums`}
    />
  );
}

/** Neto → IVA → total, en la moneda del contrato. */
export function NetoConIva({ neto, moneda, etiqueta = "Neto" }: { neto: number; moneda: Moneda; etiqueta?: string }) {
  if (!neto) return null;
  const uf = moneda === "UF";
  const { iva, total } = uf ? conIvaUf(neto) : conIva(neto);
  const f = (n: number) => (uf ? `${formatearUf(n)} UF` : formatearPesos(n));
  return (
    <p className="text-sm text-ink-soft">
      {etiqueta} <strong className="text-ink">{f(neto)}</strong> · IVA 19% <strong className="text-ink">{f(iva)}</strong> ·
      Total <strong className="text-ink">{f(total)}</strong>
    </p>
  );
}

function Titulo({ children, nota }: { children: React.ReactNode; nota?: string }) {
  return (
    <Ancho>
      <div className="border-t border-mist pt-5">
        <h3 className="font-display text-sm font-semibold text-ink">{children}</h3>
        {nota && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{nota}</p>}
      </div>
    </Ancho>
  );
}

function BotonAgregar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-2 rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink">
      {children}
    </button>
  );
}

function Quitar({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button type="button" aria-label={etiqueta} onClick={onClick}
      className="rounded-lg p-1.5 text-ink-soft hover:bg-[#fdeeec] hover:text-[#a52f24]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function CondicionesContrato({
  forma,
  moneda,
  condiciones,
  alCambiar,
}: {
  forma: FormaContrato;
  moneda: Moneda;
  condiciones: Condiciones;
  alCambiar: (c: Condiciones) => void;
}) {
  const unidad = moneda === "UF" ? "UF" : "$";
  const decimales = moneda === "UF";

  if (forma === "arriendo") {
    const a = condiciones.arriendo ?? { equipos: [], servicios: [] };
    const poner = (cambio: Partial<typeof a>) => alCambiar({ ...condiciones, arriendo: { ...a, ...cambio } });
    const equipo = (i: number, cambio: Partial<Equipo>) => poner({ equipos: a.equipos.map((e, j) => (j === i ? { ...e, ...cambio } : e)) });
    const servicio = (i: number, cambio: Partial<Servicio>) => poner({ servicios: a.servicios.map((s, j) => (j === i ? { ...s, ...cambio } : s)) });
    const mensual = montoMensualArriendo(a);
    return (
      <>
        <Titulo nota={`Cada tipo de equipo con su cantidad y su tarifa mensual neta, en ${moneda === "UF" ? "UF" : "pesos"}. Opcional.`}>
          Equipos arrendados
        </Titulo>
        <Ancho>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="pb-1 pr-2">Tipo de equipo</th>
                <th className="w-24 pb-1 pr-2 text-right">Cantidad</th>
                <th className="w-32 pb-1 pr-2 text-right">Tarifa mensual ({unidad})</th>
                <th className="w-32 pb-1 text-right">Subtotal</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {a.equipos.map((e, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input aria-label="Tipo de equipo" value={e.tipo} placeholder="Torre de iluminación" onChange={(ev) => equipo(i, { tipo: ev.target.value })} className={celda} /></td>
                  <td className="py-1 pr-2"><CeldaNumero etiqueta="Cantidad" valor={e.cantidad} alCambiar={(n) => equipo(i, { cantidad: n })} /></td>
                  <td className="py-1 pr-2"><CeldaNumero etiqueta="Tarifa mensual" valor={e.tarifa} decimales={decimales} alCambiar={(n) => equipo(i, { tarifa: n })} /></td>
                  <td className="py-1 text-right tabular-nums text-ink">
                    {moneda === "UF" ? `${formatearUf(e.cantidad * e.tarifa)} UF` : formatearPesos(Math.round(e.cantidad * e.tarifa))}
                  </td>
                  <td className="py-1 text-right"><Quitar etiqueta="Quitar equipo" onClick={() => poner({ equipos: a.equipos.filter((_, j) => j !== i) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <BotonAgregar onClick={() => poner({ equipos: [...a.equipos, { tipo: "", cantidad: 0, tarifa: 0 }] })}>Agregar tipo de equipo</BotonAgregar>
          <div className="mt-3 rounded-xl bg-mist/50 px-4 py-3">
            <p className="text-sm text-ink-soft">{formatearNumero(equiposArrendados(a))} equipos en total.</p>
            <NetoConIva neto={mensual} moneda={moneda} etiqueta="Arriendo mensual neto" />
          </div>
        </Ancho>

        <Titulo nota="Lo que se cobra aparte del arriendo, por vez. Opcional.">Servicios con tarifa</Titulo>
        <Ancho>
          <table className="w-full text-sm">
            <tbody>
              {a.servicios.map((s, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input aria-label="Servicio" value={s.concepto} onChange={(ev) => servicio(i, { concepto: ev.target.value })} className={celda} /></td>
                  <td className="w-40 py-1 pr-2"><CeldaNumero etiqueta={`Tarifa de ${s.concepto}`} valor={s.tarifa} decimales={decimales} alCambiar={(n) => servicio(i, { tarifa: n })} /></td>
                  <td className="w-12 py-1 text-xs text-ink-soft">{unidad}</td>
                  <td className="w-8 py-1 text-right"><Quitar etiqueta="Quitar servicio" onClick={() => poner({ servicios: a.servicios.filter((_, j) => j !== i) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <BotonAgregar onClick={() => poner({ servicios: [...a.servicios, { concepto: "", tarifa: 0 }] })}>Agregar servicio</BotonAgregar>
        </Ancho>
      </>
    );
  }

  if (forma === "precios_unitarios") {
    const p = condiciones.precios_unitarios ?? { dotacion: 0, hh_mensuales: 0, itemizado: [] };
    const poner = (cambio: Partial<typeof p>) => alCambiar({ ...condiciones, precios_unitarios: { ...p, ...cambio } });
    const item = (i: number, cambio: Partial<ItemPrecio>) => poner({ itemizado: p.itemizado.map((x, j) => (j === i ? { ...x, ...cambio } : x)) });
    return (
      <>
        <Titulo nota="Lo que se compromete y a qué precio se cobra cada cosa. Opcional.">Dotación e itemizado de precios</Titulo>
        <Ancho>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink">Dotación comprometida
              <CeldaNumero etiqueta="Dotación comprometida" valor={p.dotacion} alCambiar={(n) => poner({ dotacion: n })} />
            </label>
            <label className="text-sm text-ink">HH mensuales estimadas
              <CeldaNumero etiqueta="HH mensuales" valor={p.hh_mensuales} alCambiar={(n) => poner({ hh_mensuales: n })} />
            </label>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="pb-1 pr-2">Cargo o partida</th>
                <th className="w-24 pb-1 pr-2">Unidad</th>
                <th className="w-36 pb-1 pr-2 text-right">Precio neto ({unidad})</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {p.itemizado.map((x, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input aria-label="Cargo o partida" value={x.concepto} placeholder="Maestro primera" onChange={(ev) => item(i, { concepto: ev.target.value })} className={celda} /></td>
                  <td className="py-1 pr-2"><input aria-label="Unidad" value={x.unidad} onChange={(ev) => item(i, { unidad: ev.target.value })} className={celda} /></td>
                  <td className="py-1 pr-2"><CeldaNumero etiqueta="Precio" valor={x.precio} decimales={decimales} alCambiar={(n) => item(i, { precio: n })} /></td>
                  <td className="py-1 text-right"><Quitar etiqueta="Quitar ítem" onClick={() => poner({ itemizado: p.itemizado.filter((_, j) => j !== i) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <BotonAgregar onClick={() => poner({ itemizado: [...p.itemizado, { concepto: "", unidad: "HH", precio: 0 }] })}>Agregar ítem</BotonAgregar>
        </Ancho>
      </>
    );
  }

  if (forma === "suma_alzada") {
    const s = condiciones.suma_alzada ?? { anticipo_pct: 0, retencion_pct: 0, hitos: [] };
    const poner = (cambio: Partial<typeof s>) => alCambiar({ ...condiciones, suma_alzada: { ...s, ...cambio } });
    const hito = (i: number, cambio: Partial<Hito>) => poner({ hitos: s.hitos.map((h, j) => (j === i ? { ...h, ...cambio } : h)) });
    const total = sumaHitos(s);
    return (
      <>
        <Titulo nota="Cómo se paga el precio fijo. Opcional.">Anticipo, retención e hitos de pago</Titulo>
        <Ancho>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink">Anticipo (%)
              <CeldaNumero etiqueta="Anticipo" valor={s.anticipo_pct} decimales alCambiar={(n) => poner({ anticipo_pct: n })} />
            </label>
            <label className="text-sm text-ink">Retención (%)
              <CeldaNumero etiqueta="Retención" valor={s.retencion_pct} decimales alCambiar={(n) => poner({ retencion_pct: n })} />
            </label>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="pb-1 pr-2">Hito</th>
                <th className="w-24 pb-1 pr-2 text-right">%</th>
                <th className="w-40 pb-1 pr-2">Fecha estimada</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {s.hitos.map((h, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input aria-label="Hito" value={h.nombre} placeholder="Entrega de fundaciones" onChange={(ev) => hito(i, { nombre: ev.target.value })} className={celda} /></td>
                  <td className="py-1 pr-2"><CeldaNumero etiqueta="Porcentaje" valor={h.porcentaje} decimales alCambiar={(n) => hito(i, { porcentaje: n })} /></td>
                  <td className="py-1 pr-2"><input aria-label="Fecha estimada" type="date" value={h.fecha} onChange={(ev) => hito(i, { fecha: ev.target.value })} className={celda} /></td>
                  <td className="py-1 text-right"><Quitar etiqueta="Quitar hito" onClick={() => poner({ hitos: s.hitos.filter((_, j) => j !== i) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <BotonAgregar onClick={() => poner({ hitos: [...s.hitos, { nombre: "", porcentaje: 0, fecha: "" }] })}>Agregar hito</BotonAgregar>
          {s.hitos.length > 0 && (
            <p className={`mt-2 text-xs ${total > 100 ? "font-semibold text-[#a52f24]" : "text-ink-soft"}`}>
              Los hitos suman {formatearNumero(total)}%{total > 100 ? ": se pasan del 100%." : total < 100 ? `; faltan ${formatearNumero(100 - total)}%.` : "."}
            </p>
          )}
        </Ancho>
      </>
    );
  }

  const d = condiciones.administracion_delegada ?? { costo_estimado: 0, honorario_pct: 0, tope: 0 };
  const poner = (cambio: Partial<typeof d>) => alCambiar({ ...condiciones, administracion_delegada: { ...d, ...cambio } });
  const honorario = honorarioEstimado(d);
  return (
    <>
      <Titulo nota="Costo más honorario. Opcional.">Costo y honorario</Titulo>
      <Ancho>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-ink">Costo estimado neto ({unidad})
            <CeldaNumero etiqueta="Costo estimado" valor={d.costo_estimado} decimales={decimales} alCambiar={(n) => poner({ costo_estimado: n })} />
          </label>
          <label className="text-sm text-ink">Honorario (%)
            <CeldaNumero etiqueta="Honorario" valor={d.honorario_pct} decimales alCambiar={(n) => poner({ honorario_pct: n })} />
          </label>
          <label className="text-sm text-ink">Tope del contrato ({unidad})
            <CeldaNumero etiqueta="Tope" valor={d.tope} decimales={decimales} alCambiar={(n) => poner({ tope: n })} />
          </label>
        </div>
        {d.costo_estimado > 0 && (
          <div className="mt-3 rounded-xl bg-mist/50 px-4 py-3">
            <NetoConIva neto={honorario} moneda={moneda} etiqueta="Honorario estimado neto" />
            <NetoConIva neto={d.costo_estimado + honorario} moneda={moneda} etiqueta="Costo + honorario neto" />
          </div>
        )}
      </Ancho>
    </>
  );
}

/** Plantilla configurable: qué campos lleva el EDP de este contrato. */
export function SelectorCamposEdp({ seleccion, alCambiar }: { seleccion: string[]; alCambiar: (s: string[]) => void }) {
  const marcadas = new Set(seleccion);
  const alternar = (clave: string) =>
    alCambiar(marcadas.has(clave) ? seleccion.filter((c) => c !== clave) : [...seleccion, clave]);
  return (
    <Ancho>
      <div className="rounded-xl border border-mist-deep bg-mist/30 p-4">
        <p className="text-sm font-semibold text-ink">Campos del Estado de Pago</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Marca los que lleva el EDP de este contrato. Los montos en UF activan la conversión con la UF del período; las
          retenciones, su desglose. Sin nada marcado, el EDP queda como el General.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {catalogoCamposEdp.map((g) => (
            <fieldset key={g.grupo}>
              <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{g.grupo}</legend>
              {g.campos.map((c) => (
                <label key={c.clave} className="mt-1.5 flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={marcadas.has(c.clave)} onChange={() => alternar(c.clave)} className="h-4 w-4 accent-cyan" />
                  {c.etiqueta}
                  {c.unidad && <span className="text-xs text-ink-soft">({c.unidad})</span>}
                  {c.soloExtraordinario && <span className="text-xs text-ink-soft">· solo extraordinarios</span>}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </div>
    </Ancho>
  );
}
