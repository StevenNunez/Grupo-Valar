"use client";

import { useMemo, useState } from "react";
import {
  formatearFecha,
  formatearMillones,
  formatearPesos,
  mesesDelPeriodo,
  periodos,
  useControlDeGestion,
  type Contrato,
  type Datos,
  type EstadoContrato,
  type MesFacturado,
  type Periodo,
} from "@/lib/control-de-gestion";

export function ControlDeGestion() {
  const estado = useControlDeGestion();

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="text-xs font-medium tracking-brand uppercase text-cyan-deep">
          Módulo
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold text-ink">
          Control de Gestión
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Estado de la cartera de contratos: avance físico informado, consumo de
          presupuesto y facturación del período.
        </p>
      </header>

      {estado.estado === "cargando" && <Esqueleto />}
      {estado.estado === "error" && <FalloDeCarga mensaje={estado.mensaje} />}
      {estado.estado === "listo" && <Panel datos={estado.datos} />}
    </div>
  );
}

/* ── Estados de carga ─────────────────────────────────────────────────────── */

function Esqueleto() {
  return (
    <div className="mt-10 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando los datos del módulo…</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[8.5rem] rounded-2xl border border-mist-deep bg-white" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-2xl border border-mist-deep bg-white" />
      <div className="mt-6 h-64 rounded-2xl border border-mist-deep bg-white" />
    </div>
  );
}

function FalloDeCarga({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="mt-10 rounded-2xl border border-[#f0cdc8] bg-[#fdeeec] p-6"
    >
      <p className="font-display text-lg font-semibold text-[#a52f24]">
        No se pudieron cargar los datos
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Vuelve a cargar la página. Si el problema sigue, revisa que la base de
        datos esté activa: los proyectos gratis de Supabase se pausan tras una
        semana sin uso.
      </p>
      <p className="mt-3 font-mono text-xs text-ink-soft/80">{mensaje}</p>
    </div>
  );
}

function SinDatos() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
      <p className="font-display text-lg font-semibold text-ink">
        Todavía no hay contratos cargados
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        En cuanto se ingrese el primer contrato, este panel muestra su avance,
        su consumo de presupuesto y la facturación del período.
      </p>
    </div>
  );
}

/* ── Panel con datos ──────────────────────────────────────────────────────── */

function Panel({ datos }: { datos: Datos }) {
  const [periodo, setPeriodo] = useState<Periodo>("semestre");
  const { contratos, facturacion, seguridad } = datos;

  const meses = useMemo(
    () => facturacion.slice(-mesesDelPeriodo(periodo, facturacion.length)),
    [periodo, facturacion],
  );

  const facturado = meses.reduce((t, m) => t + m.monto, 0);

  // Ventana del mismo largo corrida hacia atrás. Si no alcanzan los meses para
  // una ventana completa devuelve `null`: comparar seis meses contra tres daría
  // un alza inventada.
  const previo = useMemo(() => {
    const n = mesesDelPeriodo(periodo, facturacion.length);
    const desde = facturacion.length - n * 2;
    if (n === 0 || desde < 0) return null;
    return facturacion
      .slice(desde, facturacion.length - n)
      .reduce((t, m) => t + m.monto, 0);
  }, [periodo, facturacion]);

  const variacion =
    previo !== null && previo > 0 ? ((facturado - previo) / previo) * 100 : null;

  const vigentes = contratos.filter((c) => c.estado !== "cerrado");
  const cartera = vigentes.reduce((t, c) => t + c.presupuesto, 0);

  // Avance ponderado por presupuesto: un contrato de mil millones no pesa lo
  // mismo que uno de cien en el promedio de la cartera.
  const avancePromedio =
    cartera > 0
      ? vigentes.reduce((t, c) => t + c.avance * c.presupuesto, 0) / cartera
      : 0;

  const enAlerta = vigentes.filter(
    (c) => c.estado === "en-riesgo" || c.estado === "atrasado",
  ).length;

  if (contratos.length === 0 && facturacion.length === 0) return <SinDatos />;

  return (
    <>
      {/* ── Indicadores ────────────────────────────────────────────────────── */}
      <section aria-labelledby="kpis" className="mt-10">
        <h2 id="kpis" className="sr-only">
          Indicadores al día de hoy
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tarjeta
            etiqueta="Cartera vigente"
            valor={formatearMillones(cartera)}
            nota={`${vigentes.length} ${vigentes.length === 1 ? "contrato" : "contratos"} en ejecución`}
          />
          <Tarjeta
            etiqueta="Avance físico"
            valor={`${avancePromedio.toFixed(0)}%`}
            nota="Promedio ponderado por presupuesto"
          />
          <Tarjeta
            etiqueta="Contratos en alerta"
            valor={String(enAlerta)}
            nota={
              enAlerta === 0 ? "Toda la cartera en plazo" : "En riesgo o atrasados"
            }
            acento={enAlerta > 0 ? "critico" : "bueno"}
          />
          <Tarjeta
            etiqueta="Días sin accidentes"
            valor={
              seguridad ? seguridad.diasSinAccidentes.toLocaleString("es-CL") : "—"
            }
            nota={
              seguridad
                ? `${seguridad.hhAcumuladas.toLocaleString("es-CL")} HH acumuladas`
                : "Sin registro cargado"
            }
          />
        </div>
      </section>

      {/* ── Facturación ────────────────────────────────────────────────────── */}
      {facturacion.length > 0 && (
        <section
          aria-labelledby="facturacion"
          className="mt-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="facturacion" className="font-display text-xl font-semibold text-ink">
                Facturación mensual
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Estados de pago cursados, en millones de pesos.
              </p>
              <p className="mt-4 font-display text-3xl font-semibold text-ink">
                {formatearMillones(facturado)}
                {variacion !== null && (
                  <span
                    className={`ml-3 align-middle text-sm font-semibold ${
                      variacion >= 0 ? "text-[#0e7a4f]" : "text-[#a52f24]"
                    }`}
                  >
                    {variacion >= 0 ? "▲" : "▼"} {Math.abs(variacion).toFixed(1)}%
                    <span className="ml-1 font-normal text-ink-soft">
                      vs. período anterior
                    </span>
                  </span>
                )}
              </p>
            </div>

            {/* Filtro del período: manda sobre esta sección completa. */}
            <div
              role="group"
              aria-label="Período"
              className="flex shrink-0 rounded-full border border-mist-deep p-1"
            >
              {periodos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodo(p.id)}
                  aria-pressed={periodo === p.id}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    periodo === p.id ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>
          </div>

          <GraficoFacturacion meses={meses} />
        </section>
      )}

      {/* ── Contratos ──────────────────────────────────────────────────────── */}
      {contratos.length > 0 && (
        <section
          aria-labelledby="contratos"
          className="mt-6 rounded-2xl border border-mist-deep bg-white"
        >
          <div className="border-b border-mist px-6 py-6 lg:px-8">
            <h2 id="contratos" className="font-display text-xl font-semibold text-ink">
              Contratos en cartera
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              El consumo compara el presupuesto gastado con el avance físico informado:
              positivo significa que se gastó más de lo construido.
            </p>
          </div>

          <TablaContratos contratos={contratos} />
        </section>
      )}

      {seguridad?.ultimaAuditoria && (
        <p className="mt-6 text-xs text-ink-soft">
          Última auditoría Sicep: {formatearFecha(seguridad.ultimaAuditoria)}
        </p>
      )}
    </>
  );
}

/* ── Tarjeta de indicador ─────────────────────────────────────────────────── */

function Tarjeta({
  etiqueta,
  valor,
  nota,
  acento,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  acento?: "bueno" | "critico";
}) {
  const color =
    acento === "critico"
      ? "text-[#a52f24]"
      : acento === "bueno"
        ? "text-[#0e7a4f]"
        : "text-ink";

  return (
    <div className="rounded-2xl border border-mist-deep bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {etiqueta}
      </p>
      <p className={`mt-4 font-display text-3xl font-semibold leading-none ${color}`}>
        {valor}
      </p>
      <p className="mt-3 text-sm text-ink-soft">{nota}</p>
    </div>
  );
}

/* ── Gráfico de barras ────────────────────────────────────────────────────
   Una sola serie, así que no lleva leyenda: el título dice qué se mide. La
   etiqueta directa va solo en el mes más alto; el resto aparece al pasar el
   cursor o al enfocar con el teclado. */

function GraficoFacturacion({ meses }: { meses: MesFacturado[] }) {
  const [activo, setActivo] = useState<number | null>(null);

  const maximo = Math.max(...meses.map((m) => m.monto), 0);
  // Cima redondeada a los 50 millones de arriba, para que la rejilla dé números
  // redondos en vez de la altura exacta del mes más alto.
  const cima = Math.max(Math.ceil(maximo / 50_000_000) * 50_000_000, 50_000_000);
  const indiceMaximo = meses.findIndex((m) => m.monto === maximo);

  return (
    <figure className="mt-8">
      <div className="flex gap-4">
        <div
          aria-hidden="true"
          className="flex h-56 w-16 shrink-0 flex-col justify-between text-right text-[11px] text-ink-soft/70"
        >
          <span>{formatearMillones(cima)}</span>
          <span>{formatearMillones(cima / 2)}</span>
          <span>$0 M</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-56">
            {/* Rejilla recesiva: solo tres líneas, nunca por encima de las barras. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 flex flex-col justify-between"
            >
              <span className="h-px w-full bg-mist" />
              <span className="h-px w-full bg-mist" />
              <span className="h-px w-full bg-mist-deep" />
            </div>

            <ul className="relative flex h-full items-end gap-[3px] sm:gap-2">
              {meses.map((m, i) => {
                const resaltado = activo === i;

                return (
                  <li
                    key={m.periodo}
                    tabIndex={0}
                    aria-label={`${m.etiqueta}: ${formatearPesos(m.monto)}`}
                    onMouseEnter={() => setActivo(i)}
                    onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo(i)}
                    onBlur={() => setActivo(null)}
                    className="relative flex h-full flex-1 items-end rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-cyan/50"
                  >
                    <span
                      style={{ height: `${(m.monto / cima) * 100}%` }}
                      className={`w-full rounded-t-[4px] transition-colors ${
                        resaltado ? "bg-cyan" : "bg-cyan-deep"
                      }`}
                    />

                    {(resaltado || i === indiceMaximo) && (
                      <span
                        className={`pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold ${
                          resaltado
                            ? "bg-ink text-white shadow-lg"
                            : "text-ink"
                        }`}
                      >
                        {formatearMillones(m.monto)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <ul aria-hidden="true" className="mt-3 flex gap-[3px] sm:gap-2">
            {meses.map((m, i) => (
              <li
                key={m.periodo}
                className={`flex-1 text-center text-[11px] ${
                  activo === i ? "font-semibold text-ink" : "text-ink-soft"
                }`}
              >
                {m.etiqueta}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <figcaption className="sr-only">
        Facturación mensual del período seleccionado, en millones de pesos chilenos.
        Cada barra se puede enfocar con el teclado para leer su monto exacto.
      </figcaption>
    </figure>
  );
}

/* ── Tabla de contratos ───────────────────────────────────────────────────── */

/* Colores de estado reservados: siempre acompañados de su etiqueta y de un
   símbolo, nunca color a secas. */
const estados: Record<
  EstadoContrato,
  { etiqueta: string; texto: string; fondo: string; simbolo: string }
> = {
  "en-plazo": {
    etiqueta: "En plazo",
    texto: "text-[#0e7a4f]",
    fondo: "bg-[#eaf4ef]",
    simbolo: "●",
  },
  "en-riesgo": {
    etiqueta: "En riesgo",
    texto: "text-[#8a5a09]",
    fondo: "bg-[#fdf3e3]",
    simbolo: "▲",
  },
  atrasado: {
    etiqueta: "Atrasado",
    texto: "text-[#a52f24]",
    fondo: "bg-[#fdeeec]",
    simbolo: "■",
  },
  cerrado: {
    etiqueta: "Cerrado",
    texto: "text-ink-soft",
    fondo: "bg-mist",
    simbolo: "✓",
  },
};

/** Puntos porcentuales gastados por sobre lo construido. Positivo = desfavorable. */
function desviacion(c: Contrato) {
  if (c.presupuesto === 0) return 0;
  return (c.costoReal / c.presupuesto) * 100 - c.avance;
}

function TablaContratos({ contratos }: { contratos: Contrato[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            <th scope="col" className="px-6 py-4 lg:px-8">
              Contrato
            </th>
            <th scope="col" className="px-4 py-4">
              Cliente
            </th>
            <th scope="col" className="w-44 px-4 py-4">
              Avance
            </th>
            <th scope="col" className="px-4 py-4 text-right">
              Presupuesto
            </th>
            <th scope="col" className="px-4 py-4 text-right">
              Costo real
            </th>
            <th scope="col" className="px-4 py-4 text-right">
              Consumo
            </th>
            <th scope="col" className="px-4 py-4">
              Estado
            </th>
            <th scope="col" className="px-6 py-4 lg:px-8">
              Término
            </th>
          </tr>
        </thead>
        <tbody>
          {contratos.map((c) => {
            const d = desviacion(c);
            const estado = estados[c.estado];

            return (
              <tr
                key={c.id}
                className="border-b border-mist transition-colors last:border-0 hover:bg-mist/30"
              >
                <th scope="row" className="px-6 py-4 text-left font-normal lg:px-8">
                  <span className="block font-semibold text-ink">{c.nombre}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {c.id} · {c.faena}
                  </span>
                </th>
                <td className="px-4 py-4 text-ink-soft">{c.cliente}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist"
                    >
                      <span
                        style={{ width: `${c.avance}%` }}
                        className="block h-full rounded-full bg-cyan-deep"
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-ink">
                      {c.avance}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-ink-soft">
                  {formatearMillones(c.presupuesto)}
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-ink-soft">
                  {formatearMillones(c.costoReal)}
                </td>
                <td
                  className={`px-4 py-4 text-right font-semibold tabular-nums ${
                    d > 10
                      ? "text-[#a52f24]"
                      : d > 0
                        ? "text-[#8a5a09]"
                        : "text-[#0e7a4f]"
                  }`}
                >
                  {d > 0 ? "+" : ""}
                  {d.toFixed(1)} pp
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${estado.fondo} ${estado.texto}`}
                  >
                    <span aria-hidden="true">{estado.simbolo}</span>
                    {estado.etiqueta}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-ink-soft lg:px-8">
                  {formatearFecha(c.termino)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
