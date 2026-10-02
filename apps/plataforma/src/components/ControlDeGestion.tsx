"use client";

import { useMemo, useState } from "react";
import { AnalisisGrafico } from "./AnalisisGrafico";
import { GraficoRentabilidad } from "./GraficoRentabilidad";
import { InformeImprimible } from "./InformeImprimible";
import { Chip } from "./ui/Chip";
import { BotonImprimir, Impresion } from "./ui/Impresion";
import { Tabla, Total, type Columna } from "./ui/Tabla";
import { Contenido, Desplegable, Filtro, Panel, Resumen } from "./ui/Vista";
import { useConsulta } from "@/lib/consulta";
import {
  acumularCategorias,
  cargarDashboard,
  cargarEstadoUf,
  evolucion as calcularEvolucion,
  porContrato as agruparPorContrato,
  semaforo,
  sumar,
  textoSemaforo,
  type CategoriaAcumulada,
  type Contrato,
  type DatosDashboard,
  type EstadoUf,
  type Evolucion,
  type FilaCategoria,
} from "@/lib/dashboard";
import {
  diasDesde,
  formatearFecha,
  formatearMonto,
  formatearPesos,
  mesLargo,
} from "@/lib/formato";
import { useUsuario } from "@/lib/sesion";
import { categoriasOficina, totalOficina, type EgresoOficina } from "@/lib/oficina-central";
import Link from "next/link";

/**
 * Dashboard de rentabilidad.
 *
 * Responde la pregunta con la que empieza cualquier reunión de control de
 * gestión: cuánto se vendió, cuánto costó, cuánto quedó, y si eso alcanza la
 * meta. Primero consolidado, después contrato por contrato, después mes a mes.
 */

/**
 * Qué período se está mirando.
 *
 * O un rango que se cuenta hacia atrás desde el último mes con datos —"3", "6",
 * "todo"— o un mes concreto, que viaja como "mes:2026-08-01". Un solo control
 * para las dos cosas: si fueran dos, se podrían contradecir entre ellos.
 */
type Periodo = "3" | "6" | "todo" | `mes:${string}`;

const rangos: { id: Periodo; titulo: string }[] = [
  { id: "todo", titulo: "Todo el período" },
  { id: "3", titulo: "Últimos 3 meses" },
  { id: "6", titulo: "Últimos 6 meses" },
];

const esMes = (p: Periodo) => p.startsWith("mes:");
const mesDe = (p: Periodo) => p.slice(4);

export function ControlDeGestion() {
  const { estado } = useConsulta<DatosDashboard>(cargarDashboard);

  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-ink">Dashboard General</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Todas las cifras son netas de IVA y se calculan desde Ingresos y Egresos. Si un número no
          cuadra, el dato que hay que corregir está en la vista donde se carga.
        </p>
      </header>

      <ValorUf />

      <Contenido consulta={estado}>{(datos) => <Tablero datos={datos} />}</Contenido>
    </>
  );
}

function Tablero({ datos }: { datos: DatosDashboard }) {
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [contratoFiltro, setContratoFiltro] = useState<string>("todos");
  const [imprimiendo, setImprimiendo] = useState(false);
  const usuario = useUsuario();

  const contratosDisponibles = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const f of datos.meses) vistos.set(f.contratoId, f.contrato);
    return [
      { id: "todos", titulo: "Todos los contratos" },
      ...[...vistos].map(([id, nombre]) => ({ id, titulo: nombre })),
    ];
  }, [datos.meses]);

  const periodosDatos = useMemo(
    () => [...new Set([...datos.meses.map((f) => f.periodo), ...datos.oficina.map((f) => `${f.fecha.slice(0, 7)}-01`)])].sort(),
    [datos.meses, datos.oficina],
  );

  const filas = useMemo(() => {
    let base = datos.meses;
    if (contratoFiltro !== "todos") {
      base = base.filter((f) => f.contratoId === contratoFiltro);
    }
    if (esMes(periodo)) {
      base = base.filter((f) => f.periodo === mesDe(periodo));
    } else if (periodo !== "todo") {
      const meses = (contratoFiltro === "todos" ? periodosDatos : [...new Set(base.map((f) => f.periodo))].sort()).slice(-Number(periodo));
      base = base.filter((f) => meses.includes(f.periodo));
    }
    return base;
  }, [datos.meses, periodo, contratoFiltro, periodosDatos]);

  /* Los meses que hay para elegir, del más nuevo al más viejo. Salen de los
     datos, no de un calendario: solo se ofrece lo que tiene movimientos. */
  const mesesDisponibles = useMemo(() => {
    return [...periodosDatos].reverse().map((periodo) => ({
      id: `mes:${periodo}` as Periodo,
      titulo: mesLargo(periodo),
    }));
  }, [periodosDatos]);

  const oficinaVisible = useMemo(() => {
    if (esMes(periodo)) return datos.oficina.filter((f) => f.fecha.startsWith(mesDe(periodo).slice(0, 7)));
    if (periodo === "todo") return datos.oficina;
    const meses = periodosDatos.slice(-Number(periodo)).map((p) => p.slice(0, 7));
    return datos.oficina.filter((f) => meses.includes(f.fecha.slice(0, 7)));
  }, [datos.oficina, periodo, periodosDatos]);

  const total = sumar(filas);
  const contratos = agruparPorContrato(filas);
  const evolucion = calcularEvolucion(filas);

  // La meta consolidada es la más exigente de los contratos en pantalla: si uno
  // pide 25%, no sirve declarar sano un consolidado de 21%.
  const meta = contratos.length > 0 ? Math.max(...contratos.map((c) => c.meta)) : 20;
  const luz = semaforo(total.margenPct, meta);

  // El informe imprime lo mismo que está en pantalla, filtros incluidos.
  const periodosVisibles = evolucion.map((e) => e.periodo);

  const categoriasVisibles = acumularCategorias(
    datos.categorias,
    contratoFiltro,
    evolucion.length,
    periodosVisibles,
  );

  const alcance = [
    contratosDisponibles.find((c) => c.id === contratoFiltro)?.titulo ?? "Todos los contratos",
    [...rangos, ...mesesDisponibles].find((p) => p.id === periodo)?.titulo ?? "Todo el período",
  ].join(" · ");

  if (filas.length === 0) {
    return (
      <>
      {datos.meses.length > 0 && <div className="mb-6 flex flex-wrap items-center gap-3">
        <Filtro etiqueta="Contrato" opciones={contratosDisponibles} valor={contratoFiltro} alCambiar={setContratoFiltro} />
        <Desplegable etiqueta="Período" valor={periodo} alCambiar={setPeriodo}
          grupos={[{ opciones: rangos }, { titulo: "Un mes en particular", opciones: mesesDisponibles }]} />
      </div>}
      <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Todavía no hay movimientos de contratos cargados
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          En cuanto se cargue el primer estado de pago o costo de un contrato, este panel muestra
          su rentabilidad. Los egresos de Oficina Central aparecen debajo.
        </p>
      </div>
      {contratoFiltro === "todos" && <ResumenOficina filas={oficinaVisible} margenContratos={0} />}
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Filtro
          etiqueta="Contrato"
          opciones={contratosDisponibles}
          valor={contratoFiltro}
          alCambiar={setContratoFiltro}
        />
        <Desplegable
          etiqueta="Período"
          valor={periodo}
          alCambiar={setPeriodo}
          grupos={[
            { opciones: rangos },
            { titulo: "Un mes en particular", opciones: mesesDisponibles },
          ]}
        />

        {/* El informe sale con los filtros puestos: lo que se ve es lo que se
            imprime, y el encabezado de la hoja lo deja dicho. */}
        <div className="ml-auto">
          <BotonImprimir onClick={() => setImprimiendo(true)} />
        </div>
      </div>

      {/* ── Consolidado ────────────────────────────────────────────────────── */}
      <Resumen
        datos={[
          {
            etiqueta: "Ventas netas",
            valor: formatearMonto(total.venta),
            nota: `${evolucion.length} ${evolucion.length === 1 ? "mes" : "meses"} · neto de IVA`,
          },
          {
            etiqueta: "Costos totales",
            valor: formatearMonto(total.costo),
            nota: `${formatearMonto(total.reembolsable)} reembolsables aparte`,
          },
          {
            etiqueta: "Resultado",
            valor: formatearMonto(total.margen),
            nota: "Ventas menos costos",
          },
          {
            etiqueta: "Rentabilidad s/ ventas",
            valor: `${total.margenPct.toFixed(1)}%`,
            nota: `${textoSemaforo[luz]} · meta ${meta}%`,
            acento: luz,
          },
        ]}
      />

      {contratoFiltro === "todos" && <ResumenOficina filas={oficinaVisible} margenContratos={total.margen} />}

      {/* ── Por contrato ───────────────────────────────────────────────────── */}
      {contratos.length > 1 && (
        <section aria-labelledby="contratos" className="mb-6">
          <h2 id="contratos" className="sr-only">
            Resultado por contrato
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {contratos.map((c) => (
              <TarjetaContrato key={c.id} contrato={c} />
            ))}
          </div>
        </section>
      )}

      {/* ── Análisis gráfico ───────────────────────────────────────────────── */}
      <AnalisisGrafico
        contratos={contratos}
        evolucion={evolucion}
        categorias={datos.categorias}
        periodosVisibles={periodosVisibles}
        meta={meta}
      />

      {/* ── Evolución ──────────────────────────────────────────────────────── */}
      {/* Con un solo mes elegido no hay evolución que dibujar: serían tres
          puntos sueltos en media pantalla en blanco. El dato está igual en la
          tabla de abajo. */}
      {evolucion.length > 1 && (
        <section
          aria-labelledby="evolucion"
          className="mb-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8"
        >
          <h2 id="evolucion" className="font-display text-lg font-semibold text-ink">
            Rentabilidad mes a mes
          </h2>
          <p className="mb-6 mt-1 text-sm text-ink-soft">
            Margen sobre ventas de cada contrato y del consolidado, contra la meta.
          </p>
          <GraficoRentabilidad evolucion={evolucion} contratos={contratos} meta={meta} />
        </section>
      )}

      {/* ── Tabla mensual ──────────────────────────────────────────────────── */}
      <Panel
        titulo={evolucion.length > 1 ? "Evolución mensual" : "Detalle del mes"}
        nota="Valores netos de IVA"
      >
        <TablaEvolucion evolucion={evolucion} meta={meta} />
      </Panel>

      {/* ── Categorías ─────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <Panel
          titulo="Costo por categoría"
          nota="Acumulado del período contra el presupuesto mensual del contrato."
        >
          <TablaCategorias
            categorias={datos.categorias}
            contratoFiltro={contratoFiltro}
            meses={evolucion.length}
            periodosVisibles={periodosVisibles}
          />
        </Panel>
      </div>

      <Conclusiones contratos={contratos} total={total} />

      {imprimiendo && (
        <Impresion titulo="Vista previa del informe" alCerrar={() => setImprimiendo(false)}>
          <InformeImprimible
            total={total}
            contratos={contratos}
            evolucion={evolucion}
            categorias={categoriasVisibles}
            meta={meta}
            alcance={alcance}
            emitidoPor={usuario.nombre}
          />
        </Impresion>
      )}
    </>
  );
}

function ResumenOficina({ filas, margenContratos }: { filas: EgresoOficina[]; margenContratos: number }) {
  const operativos = totalOficina(filas.filter((fila) => fila.categoria !== "activos"));
  const activos = totalOficina(filas.filter((fila) => fila.categoria === "activos"));
  return (
    <section className="mb-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Oficina Central</h2>
          <p className="mt-1 text-sm text-ink-soft">Egresos generales netos de IVA, separados de los costos de cada contrato.</p>
        </div>
        <Link href="/control-de-gestion/egresos/oficina-central/" className="text-sm font-semibold text-cyan-deep hover:underline">Ver movimientos →</Link>
      </div>
      <Resumen datos={[
        { etiqueta: "Gastos operativos", valor: formatearMonto(operativos), nota: "Compras, arriendos e insumos" },
        { etiqueta: "Compra de activos", valor: formatearMonto(activos), nota: "Inversión, separada del resultado" },
        { etiqueta: "Total egresos oficina", valor: formatearMonto(operativos + activos), nota: `${filas.length} movimientos registrados` },
        { etiqueta: "Resultado tras oficina", valor: formatearMonto(margenContratos - operativos), nota: "Resultado contratos menos gastos operativos" },
      ]} />
      {filas.length > 0 && <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
        {categoriasOficina.map((c) => <span key={c.id}>{c.titulo}: <strong className="text-ink">{formatearMonto(totalOficina(filas.filter((f) => f.categoria === c.id)))}</strong></span>)}
      </div>}
    </section>
  );
}

/* ── Tarjeta por contrato ─────────────────────────────────────────────────── */

function TarjetaContrato({ contrato }: { contrato: Contrato }) {
  const { totales, meta } = contrato;
  const luz = semaforo(totales.margenPct, meta);
  const color = luz === "bueno" ? "#0e7a4f" : luz === "aviso" ? "#8a5a09" : "#a52f24";

  return (
    <article className="rounded-2xl border border-mist-deep bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">{contrato.nombre}</h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            {contrato.cliente} · {contrato.id}
          </p>
        </div>
        <Chip tono={luz}>{textoSemaforo[luz]}</Chip>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        {[
          ["Ventas", formatearMonto(totales.venta)],
          ["Costos", formatearMonto(totales.costo)],
          ["Resultado", formatearMonto(totales.margen)],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {etiqueta}
            </dt>
            <dd className="mt-1.5 font-display text-lg font-semibold text-ink">{valor}</dd>
          </div>
        ))}
      </dl>

      {/* Rentabilidad contra la meta: la marca fija dice dónde está el listón. */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Rentabilidad
          </span>
          <span className="font-display text-2xl font-semibold" style={{ color }}>
            {totales.margenPct.toFixed(1)}%
          </span>
        </div>

        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-mist">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.min(Math.max(totales.margenPct, 0), 100)}%`,
              background: color,
            }}
          />
        </div>
        <div className="relative mt-1 h-4">
          <span
            className="absolute -translate-x-1/2 text-[11px] text-ink-soft"
            style={{ left: `${Math.min(meta, 100)}%` }}
          >
            ▲ meta {meta}%
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Aporta el {contrato.aporteMargen.toFixed(0)}% del margen total con el{" "}
        {contrato.aporteVenta.toFixed(0)}% de las ventas.
      </p>
    </article>
  );
}

/* ── Tabla de evolución ───────────────────────────────────────────────────── */

type FilaEvolucion = Evolucion & { meta: number };

function TablaEvolucion({ evolucion, meta }: { evolucion: Evolucion[]; meta: number }) {
  const filas: FilaEvolucion[] = evolucion.map((e) => ({ ...e, meta }));
  const venta = evolucion.reduce((t, e) => t + e.consolidado.venta, 0);
  const costo = evolucion.reduce((t, e) => t + e.consolidado.costo, 0);

  const columnas: Columna<FilaEvolucion>[] = [
    {
      clave: "mes",
      titulo: "Mes",
      encabezado: true,
      celda: (f) => <span className="font-semibold text-ink">{mesLargo(f.periodo)}</span>,
    },
    {
      clave: "venta",
      titulo: "Ventas netas",
      derecha: true,
      celda: (f) => <span className="text-ink-soft">{formatearMonto(f.consolidado.venta)}</span>,
    },
    {
      clave: "costo",
      titulo: "Costos",
      derecha: true,
      celda: (f) => <span className="text-ink-soft">{formatearMonto(f.consolidado.costo)}</span>,
    },
    {
      clave: "margen",
      titulo: "Resultado",
      derecha: true,
      celda: (f) => (
        <span className="font-semibold text-ink">{formatearMonto(f.consolidado.margen)}</span>
      ),
    },
    {
      clave: "pct",
      titulo: "Rentabilidad",
      derecha: true,
      celda: (f) => {
        const luz = semaforo(f.consolidado.margenPct, f.meta);
        const color =
          luz === "bueno"
            ? "text-[#0e7a4f]"
            : luz === "aviso"
              ? "text-[#8a5a09]"
              : "text-[#a52f24]";
        return (
          <span className={`font-semibold ${color}`}>{f.consolidado.margenPct.toFixed(1)}%</span>
        );
      },
    },
    {
      clave: "estado",
      titulo: "Estado",
      celda: (f) => {
        const luz = semaforo(f.consolidado.margenPct, f.meta);
        return <Chip tono={luz}>{textoSemaforo[luz]}</Chip>;
      },
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.periodo}
      vacio="Sin meses cargados."
      pie={
        <>
          <Total>Total del período</Total>
          <Total derecha>{formatearMonto(venta)}</Total>
          <Total derecha>{formatearMonto(costo)}</Total>
          <Total derecha>{formatearMonto(venta - costo)}</Total>
          <Total derecha>
            {venta > 0 ? `${(((venta - costo) / venta) * 100).toFixed(1)}%` : "—"}
          </Total>
          <Total />
        </>
      }
    />
  );
}

/* ── Costo por categoría ──────────────────────────────────────────────────── */

function TablaCategorias({
  categorias,
  contratoFiltro,
  meses,
  periodosVisibles,
}: {
  categorias: FilaCategoria[];
  contratoFiltro: string;
  meses: number;
  periodosVisibles: string[];
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
          pct > 110 ? "text-[#a52f24]" : pct > 100 ? "text-[#8a5a09]" : "text-[#0e7a4f]";
        return <span className={`font-semibold ${color}`}>{pct.toFixed(0)}%</span>;
      },
    },
  ];

  return (
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
  );
}

/* ── Conclusiones ─────────────────────────────────────────────────────────── */

function Conclusiones({
  contratos,
  total,
}: {
  contratos: Contrato[];
  total: ReturnType<typeof sumar>;
}) {
  if (contratos.length === 0) return null;

  const masRentable = [...contratos].sort((a, b) => b.totales.margenPct - a.totales.margenPct)[0];
  const masAporta = [...contratos].sort((a, b) => b.aporteMargen - a.aporteMargen)[0];

  return (
    <section className="mt-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8">
      <h2 className="font-display text-lg font-semibold text-ink">En resumen</h2>
      <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-soft">
        <li>
          El contrato más rentable es{" "}
          <strong className="font-semibold text-ink">{masRentable.nombre}</strong>, con{" "}
          {masRentable.totales.margenPct.toFixed(1)}% sobre ventas.
        </li>
        {contratos.length > 1 && (
          <li>
            El que más aporta al margen es{" "}
            <strong className="font-semibold text-ink">{masAporta.nombre}</strong>: pone el{" "}
            {masAporta.aporteMargen.toFixed(0)}% del resultado con el{" "}
            {masAporta.aporteVenta.toFixed(0)}% de las ventas.
          </li>
        )}
        <li>
          Utilidad del período:{" "}
          <strong className="font-semibold text-ink">{formatearPesos(total.margen)}</strong>.
        </li>
        {total.reembolsable > 0 && (
          <li>
            Hay {formatearPesos(total.reembolsable)} en gastos reembolsables que se le cobran al
            mandante, y por eso no descuentan del margen.
          </li>
        )}
      </ul>
    </section>
  );
}

/* ── Valor de la UF ───────────────────────────────────────────────────────── */

/**
 * Qué UF rige hoy y si la serie está al día.
 *
 * No es decoración: C-TORRES se factura en UF, así que un valor viejo se
 * traduce en un ingreso mal calculado. La serie la trae sola una tarea diaria
 * de la base; esta línea es la forma de darse cuenta si dejó de correr.
 *
 * Si la vista todavía no existe —la migración 0011 sin aplicar— no muestra
 * nada: no tiene sentido alarmar por algo que no está encendido.
 */
function ValorUf() {
  const { estado } = useConsulta<EstadoUf | null>(cargarEstadoUf);

  if (estado.estado !== "listo" || !estado.datos) return null;

  const uf = estado.datos;
  const dias = diasDesde(uf.ultimoDiaCargado);
  // La UF se publica con anticipación, así que lo normal es que la serie llegue
  // hasta mañana o más allá. Tres días de atraso ya es que algo dejó de correr.
  const atrasada = dias > 3;

  return (
    <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span className="font-semibold text-ink">
        UF {uf.valorHoy.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
      </span>
      <span>al {formatearFecha(uf.fechaValor)}</span>
      {atrasada ? (
        <span className="rounded-full bg-[#fdeeec] px-2.5 py-0.5 text-xs font-semibold text-[#a52f24]">
          La serie no se actualiza hace {dias} días
        </span>
      ) : (
        <span className="text-xs">· se actualiza sola todos los días</span>
      )}
    </p>
  );
}
