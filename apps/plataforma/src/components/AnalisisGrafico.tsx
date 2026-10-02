"use client";

import { useState } from "react";
import {
  colorDeContrato,
  costoPorFamilia,
  FAMILIAS,
  nombreFamilia,
  SERIES,
  type Contrato,
  type Evolucion,
  type FilaCategoria,
} from "@/lib/dashboard";
import { formatearMillones, formatearPesos, mesLargo } from "@/lib/formato";

/**
 * Análisis gráfico del Dashboard.
 *
 * Cinco lecturas de los mismos datos que ya están en las tarjetas y las tablas:
 * cuánto pesa cada contrato, cuánto rinde, de qué está hecho su costo y cómo se
 * mueve mes a mes. Nada se calcula acá que no esté también en número en la
 * misma pantalla —el gráfico es para ver la forma, la tabla para leer la cifra.
 *
 * TODO se dibuja con SVG a mano, sin librería de gráficos. No es purismo: la
 * app es un export estático servido por Cloudflare, y una librería de charts
 * pesa más que todo el módulo junto.
 *
 * REGLAS QUE NO CONVIENE ROMPER (salen de la guía de visualización):
 *
 * - **Nunca dos escalas verticales en un mismo gráfico.** Pesos y porcentajes
 *   no comparten eje: van en dos paneles, uno sobre otro, compartiendo los
 *   meses. Superponerlos inventa una correlación que no está en los datos.
 * - **El color sigue al contrato, no a su posición** (`colorDeContrato`). Si
 *   dependiera del orden, filtrar les cambiaría el color a todos.
 * - **Tres colores de serie y ni uno más**, y están validados para daltonismo.
 *   Lo que no cabe se agrupa o se separa en otro gráfico.
 * - **Separación de 2px entre segmentos**, no bordes; ejes y grillas en línea
 *   fina; ninguna cifra sobre cada punto: etiqueta selectiva y el resto al
 *   pasar el mouse.
 */

/*
 * EL ANCHO DEL LIENZO NO ES ARBITRARIO. El SVG se escala al ancho de su tarjeta,
 * y con él se escala su tipografía: un lienzo de 700 dentro de una tarjeta de
 * 520 encoge las etiquetas a 0,74, y el mismo lienzo a lo ancho de la pantalla
 * las agranda a 1,5. Cada gráfico declara un ancho parecido al que va a ocupar
 * —520 en la reja de dos columnas, 1080 a lo ancho— para que todo el módulo
 * tenga el mismo tamaño de letra.
 */
const ANCHO_MEDIO = 520;
const ANCHO_COMPLETO = 1080;

const TINTA = "#1f2124";
const TINTA_SUAVE = "#3a3d42";
const GRILLA = "#e3e6e8";

/* ── Herramientas comunes ─────────────────────────────────────────────────── */

type Globo = { x: number; y: number; titulo: string; lineas: string[] } | null;

/** Contenedor de un gráfico: título, leyenda, lienzo y el globo al pasar el mouse. */
function Lienzo({
  titulo,
  descripcion,
  leyenda,
  globo,
  children,
}: {
  titulo: string;
  descripcion: string;
  leyenda?: { color: string; nombre: string }[];
  globo: Globo;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-mist-deep bg-white p-6 lg:p-7">
      <h3 className="font-display text-base font-semibold text-ink">{titulo}</h3>
      <p className="mt-1 text-sm text-ink-soft">{descripcion}</p>

      {leyenda && (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {leyenda.map((l) => (
            <li key={l.nombre} className="flex items-center gap-2 text-xs text-ink-soft">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: l.color }}
              />
              {l.nombre}
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-4">
        {children}

        {globo && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: `${globo.x}%`, top: `${globo.y}%` }}
          >
            <p className="font-semibold">{globo.titulo}</p>
            {globo.lineas.map((l) => (
              <p key={l} className="mt-0.5 whitespace-nowrap text-white/85">
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Marca invisible que agranda el área sensible al mouse hasta lo cómodo. */
function Sensible({
  x,
  y,
  ancho,
  alto,
  alEntrar,
  alSalir,
}: {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  alEntrar: () => void;
  alSalir: () => void;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(ancho, 1)}
      height={Math.max(alto, 24)}
      fill="transparent"
      onMouseEnter={alEntrar}
      onMouseLeave={alSalir}
      onFocus={alEntrar}
      onBlur={alSalir}
      tabIndex={0}
    />
  );
}

/** Corta un nombre largo para que quepa en el margen del gráfico. */
const corto = (nombre: string, largo = 22) =>
  nombre.length > largo ? `${nombre.slice(0, largo - 1)}…` : nombre;

/* ── 1. Ventas, costos y resultado por contrato ───────────────────────────── */

export function BarrasPorContrato({ contratos }: { contratos: Contrato[] }) {
  const [globo, setGlobo] = useState<Globo>(null);

  const medidas = [
    { clave: "venta", nombre: "Ventas", color: SERIES[0] },
    { clave: "costo", nombre: "Costos", color: SERIES[1] },
    { clave: "margen", nombre: "Resultado", color: SERIES[2] },
  ] as const;

  const ancho = ANCHO_MEDIO;
  const filaAlto = 92;
  const margen = { arriba: 8, derecha: 76, abajo: 20, izquierda: 132 };
  const alto = contratos.length * filaAlto + margen.arriba + margen.abajo;
  const anchoUtil = ancho - margen.izquierda - margen.derecha;

  const valores = contratos.flatMap((c) => [c.totales.venta, c.totales.costo, c.totales.margen]);
  const tope = Math.max(...valores, 1);
  const piso = Math.min(...valores, 0);
  const rango = tope - piso || 1;

  const x = (v: number) => margen.izquierda + ((v - piso) / rango) * anchoUtil;
  const cero = x(0);

  return (
    <Lienzo
      titulo="Ventas, costos y resultado por contrato"
      descripcion="Lo que entró, lo que costó y lo que quedó, en el período que estás mirando."
      leyenda={medidas.map((m) => ({ color: m.color, nombre: m.nombre }))}
      globo={globo}
    >
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label="Ventas, costos y resultado de cada contrato"
      >
        <line x1={cero} y1={margen.arriba} x2={cero} y2={alto - margen.abajo} stroke={GRILLA} />

        {contratos.map((c, fila) => {
          const base = margen.arriba + fila * filaAlto;
          return (
            <g key={c.id}>
              <text x={0} y={base + 20} className="fill-ink text-[13px] font-semibold">
                {corto(c.nombre, 20)}
              </text>
              <text x={0} y={base + 36} className="fill-ink-soft text-[11px]">
                {c.id}
              </text>

              {medidas.map((m, i) => {
                const v = c.totales[m.clave];
                const y = base + 8 + i * 24;
                const izquierda = Math.min(x(v), cero);
                const largo = Math.abs(x(v) - cero);

                return (
                  <g key={m.clave}>
                    {/* Punta redondeada solo del lado del dato; el otro nace en
                        la línea del cero. */}
                    <rect
                      x={izquierda}
                      y={y}
                      width={Math.max(largo, 2)}
                      height={16}
                      rx={4}
                      fill={m.color}
                    />
                    <text
                      x={Math.max(x(v), cero) + 8}
                      y={y + 12}
                      className="fill-ink-soft text-[11px] tabular-nums"
                    >
                      {formatearMillones(v)}
                    </text>
                    <Sensible
                      x={margen.izquierda}
                      y={y - 4}
                      ancho={anchoUtil}
                      alto={24}
                      alEntrar={() =>
                        setGlobo({
                          x: ((izquierda + largo / 2) / ancho) * 100,
                          y: (y / alto) * 100,
                          titulo: `${c.nombre} · ${m.nombre}`,
                          lineas: [formatearPesos(v)],
                        })
                      }
                      alSalir={() => setGlobo(null)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </Lienzo>
  );
}

/* ── 2. Rentabilidad por contrato ─────────────────────────────────────────── */

export function RentabilidadPorContrato({
  contratos,
  meta,
}: {
  contratos: Contrato[];
  meta: number;
}) {
  const [globo, setGlobo] = useState<Globo>(null);

  const ancho = ANCHO_MEDIO;
  const filaAlto = 46;
  const margen = { arriba: 14, derecha: 56, abajo: 30, izquierda: 132 };
  const alto = contratos.length * filaAlto + margen.arriba + margen.abajo;
  const anchoUtil = ancho - margen.izquierda - margen.derecha;

  const tope = Math.max(...contratos.map((c) => c.totales.margenPct), meta, 10) * 1.1;
  const x = (v: number) => margen.izquierda + (Math.max(v, 0) / tope) * anchoUtil;

  return (
    <Lienzo
      titulo="Rentabilidad por contrato"
      descripcion={`Margen sobre ventas de cada contrato contra la meta de ${meta}%.`}
      globo={globo}
    >
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label="Rentabilidad de cada contrato contra la meta"
      >
        <line
          x1={margen.izquierda}
          y1={margen.arriba}
          x2={margen.izquierda}
          y2={alto - margen.abajo}
          stroke={GRILLA}
        />

        {contratos.map((c, fila) => {
          const y = margen.arriba + fila * filaAlto;
          const largo = x(c.totales.margenPct) - margen.izquierda;
          return (
            <g key={c.id}>
              <text x={0} y={y + 20} className="fill-ink text-[13px]">
                {corto(c.nombre)}
              </text>
              <rect
                x={margen.izquierda}
                y={y + 6}
                width={Math.max(largo, 2)}
                height={20}
                rx={4}
                fill={SERIES[0]}
              />
              <text
                x={margen.izquierda + largo + 8}
                y={y + 21}
                className="fill-ink text-[12px] font-semibold tabular-nums"
              >
                {c.totales.margenPct.toFixed(1)}%
              </text>
              <Sensible
                x={margen.izquierda}
                y={y}
                ancho={anchoUtil}
                alto={filaAlto}
                alEntrar={() =>
                  setGlobo({
                    x: ((margen.izquierda + largo / 2) / ancho) * 100,
                    y: ((y + 6) / alto) * 100,
                    titulo: c.nombre,
                    lineas: [
                      `${c.totales.margenPct.toFixed(1)}% sobre ventas`,
                      `${formatearPesos(c.totales.margen)} de resultado`,
                      `Meta ${c.meta}%`,
                    ],
                  })
                }
                alSalir={() => setGlobo(null)}
              />
            </g>
          );
        })}

        {/* La meta: una sola línea de referencia, rotulada una vez. */}
        <line
          x1={x(meta)}
          y1={margen.arriba - 6}
          x2={x(meta)}
          y2={alto - margen.abajo}
          stroke={TINTA}
          strokeWidth={1.5}
        />
        <text
          x={x(meta)}
          y={alto - margen.abajo + 16}
          textAnchor="middle"
          className="fill-ink text-[11px] font-semibold"
        >
          meta {meta}%
        </text>
      </svg>
    </Lienzo>
  );
}

/* ── 3. Participación en las ventas ───────────────────────────────────────── */

export function ParticipacionEnVentas({ contratos }: { contratos: Contrato[] }) {
  const [globo, setGlobo] = useState<Globo>(null);

  const ids = contratos.map((c) => c.id);
  const total = contratos.reduce((t, c) => t + c.totales.venta, 0);
  if (total <= 0) return null;

  const ancho = ANCHO_MEDIO;
  const alto = 92;
  const margen = { izquierda: 0, derecha: 0 };
  const anchoUtil = ancho - margen.izquierda - margen.derecha;
  const HUECO = 2; // separación entre segmentos: nunca un borde

  /* Los tramos se calculan antes de dibujar, no acumulando dentro del map: una
     variable que se va sumando mientras React renderiza es justo lo que rompe
     cuando el render se repite o se interrumpe. */
  const tramos: { contrato: Contrato; x: number; ancho: number }[] = [];
  let recorrido = 0;
  for (const c of contratos) {
    const parte = (c.totales.venta / total) * anchoUtil;
    tramos.push({ contrato: c, x: margen.izquierda + recorrido, ancho: parte });
    recorrido += parte;
  }

  return (
    <Lienzo
      titulo="Participación en las ventas"
      descripcion="Cuánto de la venta consolidada pone cada contrato."
      leyenda={contratos.map((c) => ({
        color: colorDeContrato(c.id, ids),
        nombre: `${c.nombre} · ${c.aporteVenta.toFixed(0)}%`,
      }))}
      globo={globo}
    >
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label="Participación de cada contrato en las ventas consolidadas"
      >
        {tramos.map(({ contrato: c, x, ancho: parte }) => {
          const util = Math.max(parte - HUECO, 2);
          const cabe = util > 90;

          return (
            <g key={c.id}>
              <rect
                x={x}
                y={0}
                width={util}
                height={34}
                rx={4}
                fill={colorDeContrato(c.id, ids)}
              />
              {/* La cifra va dentro solo si cabe con aire; si no, a la leyenda. */}
              {cabe && (
                <text
                  x={x + 12}
                  y={22}
                  className="fill-white text-[12px] font-semibold tabular-nums"
                >
                  {c.aporteVenta.toFixed(0)}%
                </text>
              )}
              <text x={x} y={56} className="fill-ink text-[12px] font-semibold">
                {corto(c.nombre, Math.max(Math.floor(util / 8), 8))}
              </text>
              <text x={x} y={72} className="fill-ink-soft text-[11px] tabular-nums">
                {formatearMillones(c.totales.venta)}
              </text>
              <Sensible
                x={x}
                y={0}
                ancho={util}
                alto={34}
                alEntrar={() =>
                  setGlobo({
                    x: ((x + util / 2) / ancho) * 100,
                    y: 0,
                    titulo: c.nombre,
                    lineas: [
                      `${formatearPesos(c.totales.venta)} de venta`,
                      `${c.aporteVenta.toFixed(1)}% del consolidado`,
                      `Aporta el ${c.aporteMargen.toFixed(0)}% del margen`,
                    ],
                  })
                }
                alSalir={() => setGlobo(null)}
              />
            </g>
          );
        })}
      </svg>
    </Lienzo>
  );
}

/* ── 4. Composición del costo ─────────────────────────────────────────────── */

export function ComposicionDelCosto({
  contratos,
  categorias,
  periodosVisibles,
}: {
  contratos: Contrato[];
  categorias: FilaCategoria[];
  periodosVisibles: string[];
}) {
  const [globo, setGlobo] = useState<Globo>(null);

  const filas = costoPorFamilia(categorias, contratos, periodosVisibles);
  if (filas.length === 0) return null;

  const ancho = ANCHO_MEDIO;
  const filaAlto = 78;
  const margen = { arriba: 6, derecha: 0, abajo: 6, izquierda: 0 };
  const alto = filas.length * filaAlto + margen.arriba + margen.abajo;
  const HUECO = 2;

  return (
    <Lienzo
      titulo="Composición del costo por contrato"
      descripcion="De qué está hecho el costo de cada contrato. El detalle por categoría está en la tabla de abajo."
      leyenda={FAMILIAS.map((f, i) => ({ color: SERIES[i], nombre: nombreFamilia[f] }))}
      globo={globo}
    >
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label="Composición del costo de cada contrato por familia"
      >
        {filas.map((c, fila) => {
          const base = margen.arriba + fila * filaAlto;

          let avance = 0;
          const tramos = FAMILIAS.map((f, i) => {
            const monto = c.porFamilia[f];
            const parte = (monto / c.total) * ancho;
            const x = avance;
            avance += monto > 0 ? parte : 0;
            return { familia: f, color: SERIES[i], monto, x, ancho: parte };
          }).filter((t) => t.monto > 0);

          return (
            <g key={c.contratoId}>
              <text x={0} y={base + 14} className="fill-ink text-[13px] font-semibold">
                {corto(c.nombre, 34)}
              </text>
              <text
                x={ancho}
                y={base + 14}
                textAnchor="end"
                className="fill-ink-soft text-[12px] tabular-nums"
              >
                {formatearMillones(c.total)}
              </text>

              {tramos.map(({ familia: f, color, monto, x, ancho: parte }) => {
                const util = Math.max(parte - HUECO, 2);
                const pct = (monto / c.total) * 100;

                return (
                  <g key={f}>
                    <rect x={x} y={base + 24} width={util} height={26} rx={4} fill={color} />
                    {util > 56 && (
                      <text
                        x={x + 10}
                        y={base + 41}
                        className="fill-white text-[11px] font-semibold tabular-nums"
                      >
                        {pct.toFixed(0)}%
                      </text>
                    )}
                    <Sensible
                      x={x}
                      y={base + 24}
                      ancho={util}
                      alto={26}
                      alEntrar={() =>
                        setGlobo({
                          x: ((x + util / 2) / ancho) * 100,
                          y: ((base + 24) / alto) * 100,
                          titulo: `${c.nombre} · ${nombreFamilia[f]}`,
                          lineas: [
                            formatearPesos(monto),
                            `${pct.toFixed(1)}% del costo del contrato`,
                          ],
                        })
                      }
                      alSalir={() => setGlobo(null)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </Lienzo>
  );
}

/* ── 5. Evolución mensual: resultado y rentabilidad ───────────────────────── */

/**
 * Dos paneles, no un gráfico con dos ejes.
 *
 * Los pesos y el porcentaje no comparten escala: dibujarlos superpuestos obliga
 * a elegir a mano dónde se cruzan las dos escalas, y esa elección arbitraria
 * inventa una relación que los datos no tienen. Van uno encima del otro,
 * alineados por mes, que es como se comparan de verdad.
 */
export function EvolucionMensual({
  evolucion,
  meta,
}: {
  evolucion: Evolucion[];
  meta: number;
}) {
  const [globo, setGlobo] = useState<Globo>(null);

  if (evolucion.length === 0) return null;

  const ancho = ANCHO_COMPLETO;
  const altoBarras = 150;
  const altoLinea = 104;
  const margen = { izquierda: 74, derecha: 20 };
  const separacion = 30; // banda para las etiquetas de mes, entre los dos paneles
  const alto = altoBarras + separacion + altoLinea + 8;
  const anchoUtil = ancho - margen.izquierda - margen.derecha;

  const paso = anchoUtil / evolucion.length;
  // Marca delgada: una barra gruesa pesa más de lo que informa.
  const anchoBarra = Math.min(paso * 0.3, 30);
  const centro = (i: number) => margen.izquierda + paso * i + paso / 2;

  const topeMonto = Math.max(...evolucion.map((e) => e.consolidado.margen), 1);
  const yBarra = (v: number) => altoBarras - (Math.max(v, 0) / topeMonto) * (altoBarras - 16);

  const baseLinea = altoBarras + separacion;
  const topePct = Math.max(...evolucion.map((e) => e.consolidado.margenPct), meta) * 1.15;
  const yLinea = (v: number) => baseLinea + altoLinea - (Math.max(v, 0) / topePct) * (altoLinea - 12);

  const linea = evolucion
    .map((e, i) => `${i === 0 ? "M" : "L"} ${centro(i)} ${yLinea(e.consolidado.margenPct)}`)
    .join(" ");

  return (
    <Lienzo
      titulo="Evolución mensual: resultado y rentabilidad"
      descripcion="Arriba los pesos, abajo el porcentaje. Van en dos escalas separadas a propósito: superponerlas sugiere una relación que los números no tienen."
      globo={globo}
    >
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label="Resultado en pesos y rentabilidad en porcentaje, mes a mes"
      >
        {/* Panel de arriba: resultado en pesos */}
        <text x={0} y={10} className="fill-ink-soft text-[11px] font-semibold uppercase">
          Resultado
        </text>
        <line x1={margen.izquierda} y1={altoBarras} x2={ancho - margen.derecha} y2={altoBarras} stroke={GRILLA} />
        <text x={0} y={altoBarras} className="fill-ink-soft text-[10px] tabular-nums">
          $0
        </text>
        <text x={0} y={26} className="fill-ink-soft text-[10px] tabular-nums">
          {formatearMillones(topeMonto)}
        </text>

        {evolucion.map((e, i) => {
          const y = yBarra(e.consolidado.margen);
          return (
            <g key={`b-${e.periodo}`}>
              <rect
                x={centro(i) - anchoBarra / 2}
                y={y}
                width={anchoBarra}
                height={Math.max(altoBarras - y, 2)}
                rx={4}
                fill={SERIES[0]}
              />
              <Sensible
                x={centro(i) - paso / 2}
                y={0}
                ancho={paso}
                alto={altoBarras}
                alEntrar={() =>
                  setGlobo({
                    x: (centro(i) / ancho) * 100,
                    y: (y / alto) * 100,
                    titulo: mesLargo(e.periodo),
                    lineas: [
                      `${formatearPesos(e.consolidado.margen)} de resultado`,
                      `${formatearPesos(e.consolidado.venta)} de venta`,
                    ],
                  })
                }
                alSalir={() => setGlobo(null)}
              />
            </g>
          );
        })}

        {/* Los meses, una sola vez, entre los dos paneles */}
        {evolucion.map((e, i) => (
          <text
            key={`m-${e.periodo}`}
            x={centro(i)}
            y={altoBarras + 20}
            textAnchor="middle"
            className="fill-ink text-[11px] font-semibold"
          >
            {e.etiqueta}
          </text>
        ))}

        {/* Panel de abajo: rentabilidad en porcentaje */}
        <text x={0} y={baseLinea + 4} className="fill-ink-soft text-[11px] font-semibold uppercase">
          Rentabilidad
        </text>
        <line
          x1={margen.izquierda}
          y1={baseLinea + altoLinea}
          x2={ancho - margen.derecha}
          y2={baseLinea + altoLinea}
          stroke={GRILLA}
        />
        <line
          x1={margen.izquierda}
          y1={yLinea(meta)}
          x2={ancho - margen.derecha}
          y2={yLinea(meta)}
          stroke={TINTA_SUAVE}
          strokeWidth={1}
        />
        <text
          x={0}
          y={yLinea(meta) + 4}
          className="fill-ink-soft text-[10px] tabular-nums"
        >
          meta {meta}%
        </text>

        <path d={linea} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" />

        {evolucion.map((e, i) => (
          <g key={`p-${e.periodo}`}>
            <circle
              cx={centro(i)}
              cy={yLinea(e.consolidado.margenPct)}
              r={4.5}
              fill={SERIES[0]}
              stroke="#fff"
              strokeWidth={2}
            />
            <Sensible
              x={centro(i) - paso / 2}
              y={baseLinea}
              ancho={paso}
              alto={altoLinea}
              alEntrar={() =>
                setGlobo({
                  x: (centro(i) / ancho) * 100,
                  y: (yLinea(e.consolidado.margenPct) / alto) * 100,
                  titulo: mesLargo(e.periodo),
                  lineas: [
                    `${e.consolidado.margenPct.toFixed(1)}% de rentabilidad`,
                    `${(e.consolidado.margenPct - meta >= 0 ? "+" : "−") + Math.abs(e.consolidado.margenPct - meta).toFixed(1)} pts contra la meta`,
                  ],
                })
              }
              alSalir={() => setGlobo(null)}
            />
          </g>
        ))}

        {/* Etiqueta selectiva: solo el último mes lleva su cifra escrita. */}
        <text
          x={centro(evolucion.length - 1)}
          y={yLinea(evolucion[evolucion.length - 1].consolidado.margenPct) - 12}
          textAnchor="middle"
          className="fill-ink text-[12px] font-semibold tabular-nums"
        >
          {evolucion[evolucion.length - 1].consolidado.margenPct.toFixed(1)}%
        </text>
      </svg>
    </Lienzo>
  );
}

/* ── La sección completa ──────────────────────────────────────────────────── */

export function AnalisisGrafico({
  contratos,
  evolucion,
  categorias,
  periodosVisibles,
  meta,
}: {
  contratos: Contrato[];
  evolucion: Evolucion[];
  categorias: FilaCategoria[];
  periodosVisibles: string[];
  meta: number;
}) {
  if (contratos.length === 0) return null;

  return (
    <section aria-labelledby="analisis" className="mb-6">
      <h2 id="analisis" className="mb-4 font-display text-lg font-semibold text-ink">
        Análisis gráfico
      </h2>

      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <BarrasPorContrato contratos={contratos} />
          <RentabilidadPorContrato contratos={contratos} meta={meta} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ParticipacionEnVentas contratos={contratos} />
          <ComposicionDelCosto
            contratos={contratos}
            categorias={categorias}
            periodosVisibles={periodosVisibles}
          />
        </div>

        {/* Con un mes solo no hay evolución que mostrar. */}
        {evolucion.length > 1 && <EvolucionMensual evolucion={evolucion} meta={meta} />}
      </div>
    </section>
  );
}
