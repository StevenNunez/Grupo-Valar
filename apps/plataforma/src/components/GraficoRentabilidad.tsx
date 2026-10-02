"use client";

import { useId, useState } from "react";
import { colorDeContrato, type Contrato, type Evolucion } from "@/lib/dashboard";

/**
 * Rentabilidad mes a mes: una línea por contrato y otra por el consolidado,
 * contra la línea de la meta.
 *
 * El consolidado no lleva color propio: va en tinta y más grueso. No es un
 * contrato más —es la suma de los otros—, y darle un tercer color lo pondría
 * a competir de igual a igual con ellos.
 *
 * Los colores salen de `colorDeContrato`, que los ata al id del contrato y no
 * a su posición en la lista: la lista viene ordenada por venta, así que con el
 * color por posición un mes en que Torres vendiera más que Misceláneos les
 * habría cambiado el color a los dos.
 */

const TINTA = "#1f2124";

export function GraficoRentabilidad({
  evolucion,
  contratos,
  meta,
}: {
  evolucion: Evolucion[];
  contratos: Contrato[];
  meta: number;
}) {
  const id = useId();
  const [activo, setActivo] = useState<number | null>(null);

  if (evolucion.length === 0) return null;

  // Escala vertical: siempre incluye el cero y la meta, para que la línea de
  // meta no quede fuera del cuadro cuando todos los meses la superan.
  const valores = [
    ...evolucion.map((e) => e.consolidado.margenPct),
    ...contratos.flatMap((c) =>
      evolucion.map((e) => e.porContrato.get(c.id)?.margenPct ?? 0),
    ),
    meta,
    0,
  ];
  const maximo = Math.ceil(Math.max(...valores) / 10) * 10 || 10;

  const ancho = 1000;
  const alto = 300;
  const margen = { arriba: 20, derecha: 20, abajo: 36, izquierda: 46 };
  const anchoUtil = ancho - margen.izquierda - margen.derecha;
  const altoUtil = alto - margen.arriba - margen.abajo;

  const x = (i: number) =>
    margen.izquierda +
    (evolucion.length === 1 ? anchoUtil / 2 : (i / (evolucion.length - 1)) * anchoUtil);
  const y = (v: number) => margen.arriba + altoUtil - (v / maximo) * altoUtil;

  const lineaDe = (puntos: number[]) =>
    puntos.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");

  const ids = contratos.map((c) => c.id);

  const lineasDeContrato = contratos.map((c) => ({
    nombre: c.nombre,
    color: colorDeContrato(c.id, ids),
    grosor: 2,
    puntos: evolucion.map((e) => e.porContrato.get(c.id)?.margenPct ?? 0),
  }));

  // Con un solo contrato el consolidado es la misma línea: dibujarla dos veces
  // solo tapa la de abajo y agrega una leyenda que no distingue nada.
  const series =
    contratos.length > 1
      ? [
          ...lineasDeContrato,
          {
            nombre: "Consolidado",
            color: TINTA,
            grosor: 3,
            puntos: evolucion.map((e) => e.consolidado.margenPct),
          },
        ]
      : lineasDeContrato;

  const marcas = [0, maximo / 2, maximo];

  return (
    <figure>
      {/* Con dos o más series la leyenda va siempre: el color no puede ser lo
          único que distinga una línea de otra. */}
      <ul className="mb-5 flex flex-wrap gap-x-6 gap-y-2">
        {series.map((s) => (
          <li key={s.nombre} className="flex items-center gap-2 text-sm text-ink-soft">
            <span
              aria-hidden="true"
              className="h-[3px] w-6 rounded-full"
              style={{ background: s.color }}
            />
            {s.nombre}
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-ink-soft">
          <span
            aria-hidden="true"
            className="h-0 w-6 border-t-2 border-dashed"
            style={{ borderColor: "#8a5a09" }}
          />
          Meta {meta}%
        </li>
      </ul>

      <div className="overflow-x-auto sin-barra-scroll">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          className="h-[300px] w-full min-w-[34rem]"
          role="img"
          aria-labelledby={`${id}-titulo`}
        >
          <title id={`${id}-titulo`}>
            Rentabilidad sobre ventas por mes, por contrato y consolidada
          </title>

          {/* Rejilla recesiva */}
          {marcas.map((v) => (
            <g key={v}>
              <line
                x1={margen.izquierda}
                x2={ancho - margen.derecha}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? "#cdd3d7" : "#e3e6e8"}
                strokeWidth="1"
              />
              <text
                x={margen.izquierda - 10}
                y={y(v) + 4}
                textAnchor="end"
                fontSize="12"
                fill="#3a3d42"
                opacity="0.7"
              >
                {v.toFixed(0)}%
              </text>
            </g>
          ))}

          {/* La meta, punteada: es una referencia, no una medición. */}
          <line
            x1={margen.izquierda}
            x2={ancho - margen.derecha}
            y1={y(meta)}
            y2={y(meta)}
            stroke="#8a5a09"
            strokeWidth="2"
            strokeDasharray="7 5"
          />

          {/* Columna resaltada al pasar el cursor */}
          {activo !== null && (
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={margen.arriba}
              y2={margen.arriba + altoUtil}
              stroke="#cdd3d7"
              strokeWidth="1.5"
            />
          )}

          {series.map((s) => (
            <g key={s.nombre}>
              <path
                d={lineaDe(s.puntos)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.grosor}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.puntos.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={activo === i ? 6 : 4.5}
                  fill={s.color}
                  /* Anillo blanco: donde dos líneas se cruzan, los puntos
                     siguen leyéndose separados. */
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
            </g>
          ))}

          {/* Meses y zona sensible al cursor */}
          {evolucion.map((e, i) => (
            <g key={e.periodo}>
              <text
                x={x(i)}
                y={alto - 10}
                textAnchor="middle"
                fontSize="13"
                fill={activo === i ? "#1f2124" : "#3a3d42"}
                fontWeight={activo === i ? 600 : 400}
              >
                {e.etiqueta}
              </text>
              <rect
                x={x(i) - anchoUtil / (evolucion.length * 2)}
                y={margen.arriba}
                width={anchoUtil / evolucion.length}
                height={altoUtil}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* El detalle del mes bajo el cursor, en texto: más legible que una
          burbuja flotante cuando hay varias series encima. */}
      <div className="mt-4 min-h-[2.5rem]">
        {activo !== null && (
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{evolucion[activo].etiqueta}</span>
            {series.map((s, i) => (
              <span key={s.nombre} className="ml-4">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: s.color }}
                />
                {s.nombre} {s.puntos[activo].toFixed(1)}%
                {i < series.length - 1 && ""}
              </span>
            ))}
          </p>
        )}
      </div>
    </figure>
  );
}
