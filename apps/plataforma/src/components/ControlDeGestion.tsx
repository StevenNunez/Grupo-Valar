"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnalisisGrafico } from "./AnalisisGrafico";
import { InformeImprimible } from "./InformeImprimible";
import { Chip } from "./ui/Chip";
import { BotonImprimir, Impresion } from "./ui/Impresion";
import { Tabla, Total, type Columna } from "./ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Filtro, Panel, Resumen } from "./ui/Vista";
import { useConsulta } from "@/lib/consulta";
import {
  acumularCategorias,
  cargarDashboard,
  cargarEstadoUf,
  detectarAlertas,
  dividirPersonal,
  type PersonalDividido,
  evolucion as calcularEvolucion,
  porContrato as agruparPorContrato,
  semaforo,
  sumar,
  textoSemaforo,
  type Alerta,
  type CategoriaAcumulada,
  type Contrato,
  type DatosDashboard,
  type Totales,
  type EstadoUf,
  type Evolucion,
  type FilaCategoria,
  type FilaMes,
} from "@/lib/dashboard";
import {
  diasDesde,
  formatearFecha,
  formatearMonto,
  formatearPesos,
  mesLargo,
} from "@/lib/formato";
import { useUsuario } from "@/lib/sesion";
import { useVistaGuardada } from "@/lib/vista-guardada";
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
  { id: "todo", titulo: "Todos los meses cerrados" },
  { id: "3", titulo: "Últimos 3 meses cerrados" },
  { id: "6", titulo: "Últimos 6 meses cerrados" },
];

const esMes = (p: Periodo) => p.startsWith("mes:");
const mesDe = (p: Periodo) => p.slice(4);

/** El primer día del mes que está corriendo, "2026-10-01". */
function mesEnCurso() {
  const hoy = new Date();
  return hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-01";
}

/** Los meses con movimientos, de contratos o de Oficina Central, del más viejo al más nuevo. */
function periodosDe(datos: DatosDashboard) {
  return [...new Set([
    ...datos.meses.map((f) => f.periodo),
    ...datos.oficina.map((f) => f.fecha.slice(0, 7) + "-01"),
    ...datos.personalOficina.map((f) => f.periodo),
  ])].sort();
}

/**
 * Para analizar se abre en el último mes CERRADO: el mes corriente aún está
 * a medias y distorsiona los márgenes. Se puede elegir igual desde el selector.
 */
function periodoInicial(datos: DatosDashboard): Periodo {
  const cerrado = periodosDe(datos).filter((p) => p < mesEnCurso()).pop();
  return cerrado ? ("mes:" + cerrado) as Periodo : "todo";
}

export function ControlDeGestion() {
  const usuario = useUsuario();
  /* Con clave, el Dashboard abre al instante con lo último que se vio y se
     actualiza por detrás: las vistas de las que sale son pesadas. */
  const { estado } = useConsulta<DatosDashboard>(cargarDashboard, `${usuario.id}:${usuario.empresa}:dashboard-v5`);

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
  /* Período, estado y contratos elegidos se recuerdan en la pestaña: ir a
     Ingresos, Egresos o al detalle de un movimiento y volver no reinicia el
     análisis. Cada contrato y cada anexo es una unidad que se marca por
     separado (vacío = todos). Se parte de "Todos los contratos vigentes". */
  const [vista, cambiarVista] = useVistaGuardada<{ periodo: Periodo | null; alcance: Alcance; seleccion: string[] }>(
    "dashboard",
    { periodo: null, alcance: "vigentes", seleccion: [] },
  );
  const { alcance, seleccion } = vista;
  const setPeriodo = (p: Periodo) => cambiarVista({ periodo: p });
  const setAlcance = (a: Alcance) => cambiarVista({ alcance: a });
  const setSeleccion = (ids: string[]) => cambiarVista({ seleccion: ids });
  const [imprimiendo, setImprimiendo] = useState(false);
  const usuario = useUsuario();

  /* Los contratos cerrados (0083) no se miden mes a mes en el tablero
     operativo; "Todos" o "Cerrados" los trae de vuelta, con su historia. */
  const cerradosIds = useMemo(() => new Set(datos.cerrados ?? []), [datos.cerrados]);
  const entraEnAlcance = (id: string) =>
    alcance === "todos" || (cerradosIds.has(id) ? alcance === "cerrados" : alcance === "vigentes");

  const mesesAlcance = useMemo(
    () => datos.meses.filter((f) => entraEnAlcance(f.padreId ?? f.contratoId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.meses, alcance, cerradosIds],
  );
  const categoriasAlcance = useMemo(
    () => datos.categorias.filter((c) => entraEnAlcance(c.contratoId.split("#")[0])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.categorias, alcance, cerradosIds],
  );

  /* Cada contrato con sus anexos. Un anexo es un contrato más: se puede mirar
     solo o junto a otros marcándolo en el selector. */
  const grupos = useMemo(() => {
    const porContrato = new Map<string, { id: string; nombre: string; anexos: { id: string; nombre: string }[] }>();
    for (const f of mesesAlcance) {
      const id = f.padreId ?? f.contratoId;
      if (!porContrato.has(id)) porContrato.set(id, { id, nombre: id, anexos: [] });
      if (f.padreId === null) porContrato.get(id)!.nombre = f.contratoCorto || f.contrato;
    }
    for (const a of datos.anexosDisponibles) {
      if (!entraEnAlcance(a.contratoId)) continue;
      if (!porContrato.has(a.contratoId)) porContrato.set(a.contratoId, { id: a.contratoId, nombre: a.contratoId, anexos: [] });
      porContrato.get(a.contratoId)!.anexos.push({ id: a.id, nombre: a.nombre });
    }
    // Un anexo con datos pero fuera de la lista (p. ej. un borrador) también se puede elegir.
    for (const f of mesesAlcance) {
      if (f.padreId === null) continue;
      const g = porContrato.get(f.padreId)!;
      if (!g.anexos.some((a) => a.id === f.contratoId)) g.anexos.push({ id: f.contratoId, nombre: f.contrato });
    }
    const lista = [...porContrato.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    /* Oficina Central se elige como un contrato más, al final de la lista. */
    if (datos.oficina.length > 0 || datos.personalOficina.length > 0) lista.push({ id: OFICINA, nombre: "Oficina Central", anexos: [] });
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesAlcance, datos.anexosDisponibles, datos.oficina, datos.personalOficina, alcance, cerradosIds]);

  /* Qué unidades están a la vista: null = todas, cada una por separado. */
  const seleccionValida = useMemo(
    () => seleccion.filter((id) => grupos.some((g) => g.id === id || g.anexos.some((a) => a.id === id))),
    [seleccion, grupos],
  );
  /* Los contratos y anexos elegidos (sin Oficina Central); null = todos. */
  const unidades = useMemo<string[] | null>(() => {
    const deContratos = seleccionValida.filter((id) => id !== OFICINA);
    return deContratos.length > 0 ? deContratos : null;
  }, [seleccionValida]);
  const soloOficina = seleccionValida.length > 0 && unidades === null;
  /* Oficina Central está a la vista si no se filtró nada o si se marcó. */
  const conOficina = seleccionValida.length === 0 || seleccionValida.includes(OFICINA);

  const nombreDeUnidad = (id: string) => {
    for (const g of grupos) {
      if (g.id === id) return g.nombre;
      const a = g.anexos.find((x) => x.id === id);
      if (a) return a.nombre;
    }
    return id;
  };
  const periodosDatos = useMemo(() => periodosDe(datos), [datos]);

  /* El análisis de utilidad trabaja solo con meses CERRADOS: el que está corriendo
     viene a medias y distorsiona los márgenes. Se oculta del selector y de los
     rangos, pero sus registros siguen en Ingresos y Egresos para el trabajo
     operativo. Si aún no hay ninguno cerrado, se usa lo que haya. */
  const periodosCerrados = useMemo(() => {
    const cerrados = periodosDatos.filter((p) => p < mesEnCurso());
    return cerrados.length > 0 ? cerrados : periodosDatos;
  }, [periodosDatos]);

  /* Un mes guardado que ya no se puede elegir vuelve al período inicial. */
  const periodo: Periodo =
    vista.periodo && (!esMes(vista.periodo) || periodosCerrados.includes(mesDe(vista.periodo)))
      ? vista.periodo
      : periodoInicial(datos);

  const recortarPeriodo = (origen: FilaMes[], porUnidades: boolean) => {
    let base = origen;
    if (porUnidades && unidades) {
      base = base.filter((f) => unidades.includes(f.contratoId));
    }
    if (esMes(periodo)) {
      base = base.filter((f) => f.periodo === mesDe(periodo));
    } else if (periodo === "todo") {
      base = base.filter((f) => periodosCerrados.includes(f.periodo));
    } else {
      const meses = (
        !(porUnidades && unidades) ? periodosCerrados : [...new Set(base.map((f) => f.periodo).filter((p) => periodosCerrados.includes(p)))].sort()
      ).slice(-Number(periodo));
      base = base.filter((f) => meses.includes(f.periodo));
    }
    return base;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filas = useMemo(() => (soloOficina ? [] : recortarPeriodo(mesesAlcance, true)), [mesesAlcance, periodo, unidades, soloOficina, periodosCerrados]);

  /* Los contratos cerrados salen de la vista por contrato, pero su venta sigue
     siendo venta del año: se suma aparte, en el mismo período, y se avisa. */
  const ventaCerrados = useMemo(() => {
    if (alcance !== "vigentes" || unidades || soloOficina || cerradosIds.size === 0) return 0;
    const cerradas = datos.meses.filter((f) => cerradosIds.has(f.padreId ?? f.contratoId));
    return sumar(recortarPeriodo(cerradas, false)).venta;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.meses, alcance, unidades, cerradosIds, periodo, periodosCerrados]);

  /* Los meses que hay para elegir, del más nuevo al más viejo. Salen de los
     datos, no de un calendario: solo se ofrece lo que tiene movimientos. */
  const mesesDisponibles = useMemo(() => {
    return [...periodosCerrados].reverse().map((periodo) => ({
      id: `mes:${periodo}` as Periodo,
      titulo: mesLargo(periodo),
    }));
  }, [periodosCerrados]);

  const oficinaVisible = useMemo(() => {
    if (esMes(periodo)) return datos.oficina.filter((f) => f.fecha.startsWith(mesDe(periodo).slice(0, 7)));
    const elegidos = periodo === "todo" ? periodosCerrados : periodosCerrados.slice(-Number(periodo));
    const meses = elegidos.map((p) => p.slice(0, 7));
    return datos.oficina.filter((f) => meses.includes(f.fecha.slice(0, 7)));
  }, [datos.oficina, periodo, periodosCerrados]);

  // Mismo recorte de período que los egresos de oficina.
  const personalOficina = useMemo(() => {
    const elegidos = periodo === "todo" ? periodosCerrados : periodosCerrados.slice(-Number(periodo));
    const filas = esMes(periodo)
      ? datos.personalOficina.filter((f) => f.periodo === mesDe(periodo))
      : datos.personalOficina.filter((f) => elegidos.includes(f.periodo));
    return filas.reduce((t, f) => t + f.costo, 0);
  }, [datos.personalOficina, periodo, periodosCerrados]);

  const total = sumar(filas);
  const operativosOficina = totalOficina(oficinaVisible.filter((f) => f.categoria !== "activos")) + personalOficina;
  const activosOficina = totalOficina(oficinaVisible.filter((f) => f.categoria === "activos"));
  /* Finiquitos del período: los de contratos siguen el filtro de contratos; los de
     Oficina Central solo cuentan en el resultado de la empresa (sin filtro de contrato). */
  const { finiquitos, finiquitosOficina } = useMemo(() => {
    const elegidos = esMes(periodo) ? [mesDe(periodo)] : periodo === "todo" ? periodosCerrados : periodosCerrados.slice(-Number(periodo));
    const delPeriodo = (datos.finiquitos ?? []).filter((f) => elegidos.includes(f.periodo));
    const deContratos = delPeriodo
      .filter((f) => f.contratoId !== null)
      .filter((f) => !soloOficina && entraEnAlcance(f.contratoId as string))
      .filter((f) => !unidades || unidades.includes(f.contratoId as string) || (f.anexoId !== null && unidades.some((u) => u.startsWith(`${f.contratoId}#`))));
    return {
      finiquitos: deContratos.reduce((t, f) => t + f.total, 0),
      finiquitosOficina: conOficina ? delPeriodo.filter((f) => f.contratoId === null).reduce((t, f) => t + f.total, 0) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.finiquitos, periodo, periodosCerrados, unidades, soloOficina, conOficina, alcance, cerradosIds]);
  const contratos = agruparPorContrato(filas);
  const evolucion = calcularEvolucion(filas);

  // La meta consolidada es la más exigente de los contratos en pantalla: si uno
  // pide 25%, no sirve declarar sano un consolidado de 21%.
  const meta = contratos.length > 0 ? Math.max(...contratos.map((c) => c.meta)) : 20;
  const luz = semaforo(total.margenPct, meta);
  const alertas = useMemo(() => detectarAlertas(evolucion), [evolucion]);

  // El informe imprime lo mismo que está en pantalla, filtros incluidos.
  const periodosVisibles = evolucion.map((e) => e.periodo);

  /* Solo Oficina Central marcada: ninguna categoría de contrato entra. */
  const filtroCategorias: string | string[] = soloOficina ? [] : unidades ?? "todos";
  const categoriasVisibles = acumularCategorias(categoriasAlcance, filtroCategorias, evolucion.length, periodosVisibles);
  const personalDividido = dividirPersonal(categoriasAlcance, filtroCategorias, periodosVisibles, total);

  const textoAlcance = [
    seleccionValida.length > 0 ? seleccionValida.map(nombreDeUnidad).join(" + ") : alcance === "cerrados" ? "Contratos cerrados" : alcance === "todos" ? "Todos los contratos, cerrados incluidos" : "Todos los contratos vigentes",
    [...rangos, ...mesesDisponibles].find((p) => p.id === periodo)?.titulo ?? "Todos los meses cerrados",
  ].join(" · ");

  if (filas.length === 0) {
    return (
      <>
      {datos.meses.length > 0 && <FiltrosDashboard
        grupos={grupos} seleccion={seleccionValida} alCambiarSeleccion={setSeleccion}
        alcance={alcance} alCambiarAlcance={setAlcance} hayCerrados={cerradosIds.size > 0}
        periodo={periodo} alCambiarPeriodo={setPeriodo} mesesDisponibles={mesesDisponibles} />}
      {!soloOficina && <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Todavía no hay movimientos de contratos cargados
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          En cuanto se cargue el primer estado de pago o costo de un contrato, este panel muestra
          su rentabilidad. Los egresos de Oficina Central aparecen debajo.
        </p>
      </div>}
      {conOficina && <IndicadoresParalelos filas={oficinaVisible} personal={personalOficina} margenContratos={0} finiquitos={finiquitos + finiquitosOficina} conOficina />}
      </>
    );
  }

  return (
    <>
      <FiltrosDashboard
        grupos={grupos} seleccion={seleccionValida} alCambiarSeleccion={setSeleccion}
        alcance={alcance} alCambiarAlcance={setAlcance} hayCerrados={cerradosIds.size > 0}
        periodo={periodo} alCambiarPeriodo={setPeriodo} mesesDisponibles={mesesDisponibles}
        /* El informe sale con los filtros puestos: lo que se ve es lo que se
           imprime, y el encabezado de la hoja lo deja dicho. */
        acciones={<BotonImprimir onClick={() => setImprimiendo(true)} />} />

      {/* ── Consolidado ────────────────────────────────────────────────────── */}
      <Resumen
        datos={[
          {
            etiqueta: "Ventas netas",
            valor: formatearMonto(total.venta),
            nota: ventaCerrados > 0
              ? `+ ${formatearMonto(ventaCerrados)} de contratos cerrados · ${formatearMonto(total.venta + ventaCerrados)} en total`
              : `${evolucion.length} ${evolucion.length === 1 ? "mes" : "meses"} · neto de IVA`,
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

      <PanelOrdinarioExtra total={total} />

      <IndicadoresParalelos filas={oficinaVisible} personal={personalOficina} margenContratos={total.margen} finiquitos={finiquitos + finiquitosOficina} conOficina={conOficina} />

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
        categorias={categoriasAlcance}
        periodosVisibles={periodosVisibles}
        meta={meta}
        alertas={alertas}
      />

      <PanelAlertas alertas={alertas} nombreDe={nombreDeUnidad} />

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
            categorias={categoriasAlcance}
            contratoFiltro={filtroCategorias}
            meses={evolucion.length}
            periodosVisibles={periodosVisibles}
            personal={personalDividido}
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
            personal={personalDividido}
            paralelos={{
              oficina: conOficina ? { operativos: operativosOficina, activos: activosOficina, movimientos: oficinaVisible.length } : null,
              finiquitos: finiquitos + finiquitosOficina,
              consolidado: conOficina ? total.margen - operativosOficina - finiquitos - finiquitosOficina : null,
            }}
            soloOficina={soloOficina}
            meta={meta}
            alcance={textoAlcance}
            emitidoPor={usuario.nombre}
          />
        </Impresion>
      )}
    </>
  );
}

/**
 * Ordinario contra extraordinario. Sirve para cruzar el estado de pago
 * extraordinario con lo que realmente costó la parada de planta y los demás
 * extraordinarios: sin esto, un indicador bajo no se puede explicar.
 * El costo extraordinario hoy sale solo del personal (HH extra por motivo).
 */
function PanelOrdinarioExtra({ total }: { total: Totales }) {
  const costoExtra = total.costoParadaPlanta + total.costoOtrosExtra;
  const resultadoOrd = total.ventaOrdinaria - total.costoOrdinario;
  const resultadoExtra = total.ventaExtraordinaria - costoExtra;
  const pct = (resultado: number, venta: number) => (venta > 0 ? `${((resultado / venta) * 100).toFixed(1)}%` : "—");
  const color = (n: number) => (n < 0 ? "text-[#a52f24]" : "text-ink");

  const filas: { titulo: string; ordinario: string; extra: string; total: string; fuerte?: boolean; sangria?: boolean; negativoOrd?: number; negativoExtra?: number }[] = [
    { titulo: "Ventas netas", ordinario: formatearMonto(total.ventaOrdinaria), extra: formatearMonto(total.ventaExtraordinaria), total: formatearMonto(total.venta) },
    { titulo: "Costos", ordinario: formatearMonto(total.costoOrdinario), extra: formatearMonto(costoExtra), total: formatearMonto(total.costo) },
    { titulo: "HH de parada de planta", ordinario: "—", extra: formatearMonto(total.costoParadaPlanta), total: formatearMonto(total.costoParadaPlanta), sangria: true },
    { titulo: "Otros extraordinarios (reemplazos, licencias, feriados compensados…)", ordinario: "—", extra: formatearMonto(total.costoOtrosExtra), total: formatearMonto(total.costoOtrosExtra), sangria: true },
    { titulo: "Resultado", ordinario: formatearMonto(resultadoOrd), extra: formatearMonto(resultadoExtra), total: formatearMonto(total.margen), fuerte: true, negativoOrd: resultadoOrd, negativoExtra: resultadoExtra },
    { titulo: "Rentabilidad s/ ventas", ordinario: pct(resultadoOrd, total.ventaOrdinaria), extra: pct(resultadoExtra, total.ventaExtraordinaria), total: `${total.margenPct.toFixed(1)}%`, fuerte: true },
  ];

  return (
    <section aria-labelledby="ord-extra" className="mb-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-8">
      <h2 id="ord-extra" className="font-display text-lg font-semibold text-ink">Ordinario y extraordinario</h2>
      <p className="mb-5 mt-1 text-sm text-ink-soft">
        Para contrastar el estado de pago extraordinario con el costo real de la parada de planta y los otros extraordinarios.
        El costo extraordinario sale del personal (horas extra por motivo); las compras y servicios se cuentan como ordinarios.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-mist-deep text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              <th className="py-2 pr-4 font-semibold"><span className="sr-only">Concepto</span></th>
              <th className="px-3 py-2 text-right font-semibold">Ordinario</th>
              <th className="px-3 py-2 text-right font-semibold">Extraordinario</th>
              <th className="py-2 pl-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.titulo} className="border-b border-mist-deep/60 last:border-0">
                <th scope="row" className={`py-2.5 pr-4 text-left ${f.sangria ? "pl-5 text-xs font-normal text-ink-soft" : "font-semibold text-ink"}`}>{f.titulo}</th>
                <td className={`px-3 py-2.5 text-right ${f.fuerte ? "font-semibold" : ""} ${f.negativoOrd !== undefined ? color(f.negativoOrd) : f.sangria ? "text-ink-soft" : "text-ink"}`}>{f.ordinario}</td>
                <td className={`px-3 py-2.5 text-right ${f.fuerte ? "font-semibold" : ""} ${f.negativoExtra !== undefined ? color(f.negativoExtra) : f.sangria ? "text-ink-soft" : "text-ink"}`}>{f.extra}</td>
                <td className={`py-2.5 pl-3 text-right ${f.fuerte ? "font-semibold" : ""} ${f.sangria ? "text-xs text-ink-soft" : "text-ink"}`}>{f.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Indicadores paralelos: Oficina Central y Finiquitos, más chicos que los cuatro
 * principales y con colores propios (oscuro y violeta) para que no se lean como
 * parte del resultado de los contratos.
 */
function IndicadoresParalelos({
  filas, personal, margenContratos, finiquitos, conOficina,
}: { filas: EgresoOficina[]; personal: number; margenContratos: number; finiquitos: number; conOficina: boolean }) {
  // La nómina de la oficina es gasto operativo: sin ella el resultado se ve mejor de lo que es.
  const operativos = totalOficina(filas.filter((fila) => fila.categoria !== "activos")) + personal;
  const activos = totalOficina(filas.filter((fila) => fila.categoria === "activos"));
  const consolidado = margenContratos - (conOficina ? operativos : 0) - finiquitos;

  const mini = (etiqueta: string, valor: string, nota: string, oscuro: boolean, rojo = false) => (
    <div key={etiqueta} className="min-w-[9.5rem] flex-1">
      <dt className={`text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${oscuro ? "text-white/60" : "text-[#4a3aa7]"}`}>{etiqueta}</dt>
      <dd className={`mt-1.5 font-display text-lg font-semibold leading-none ${rojo ? (oscuro ? "text-[#ffb4a9]" : "text-[#a52f24]") : oscuro ? "text-white" : "text-[#4a3aa7]"}`}>{valor}</dd>
      <dd className={`mt-1 text-xs ${oscuro ? "text-white/60" : "text-ink-soft"}`}>{nota}</dd>
    </div>
  );

  return (
    <section aria-label="Oficina Central y finiquitos" className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-0">
      {conOficina && (
        <div className="rounded-2xl bg-[#1f2a33] p-5 text-white lg:rounded-r-none">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Oficina Central</h2>
            <Link href="/control-de-gestion/egresos/oficina-central/" className="text-xs font-semibold text-white/70 hover:text-white hover:underline">Ver movimientos →</Link>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-4">
            {mini("Gastos operativos", formatearMonto(operativos), "Compras, arriendos, personal", true)}
            {mini("Compra de activos", formatearMonto(activos), "Inversión, fuera del resultado", true)}
            {mini("Total egresos", formatearMonto(operativos + activos), `${filas.length} movimientos`, true)}
          </dl>
          {(filas.length > 0 || personal > 0) && (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
              {categoriasOficina.map((c) => <span key={c.id}>{c.titulo}: <strong className="text-white/90">{formatearMonto(totalOficina(filas.filter((f) => f.categoria === c.id)))}</strong></span>)}
              {personal > 0 && <span>Personal: <strong className="text-white/90">{formatearMonto(personal)}</strong></span>}
            </p>
          )}
        </div>
      )}
      {/* Línea de separación entre Oficina Central y Finiquitos. */}
      {conOficina && <div aria-hidden="true" className="hidden w-px bg-mist-deep lg:mx-0 lg:block" />}
      <div className={`rounded-2xl border border-[#c9bff0] bg-[#f3f0fc] p-5 ${conOficina ? "lg:rounded-l-none" : "lg:col-span-3"}`}>
        <h2 className="mb-4 font-display text-base font-semibold text-[#4a3aa7]">Finiquitos · informativo</h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-4">
          {mini("Finiquitos pagados", formatearMonto(finiquitos), "No son costo del contrato; se imputan al cerrarlo", false)}
          {conOficina && mini("Resultado consolidado", formatearMonto(consolidado), "Contratos − oficina − finiquitos", false, consolidado < 0)}
        </dl>
      </div>
    </section>
  );
}

/* ── Alertas de desviación ────────────────────────────────────────────────── */

function PanelAlertas({ alertas, nombreDe }: { alertas: Alerta[]; nombreDe: (id: string) => string }) {
  if (alertas.length === 0) return null;
  return (
    <section aria-labelledby="alertas" className="mb-6 rounded-2xl border border-mist-deep bg-white p-6 lg:p-7">
      <h2 id="alertas" className="font-display text-lg font-semibold text-ink">
        Desviaciones detectadas
      </h2>
      <p className="mb-4 mt-1 text-sm text-ink-soft">
        Informativo: meses que se mueven distinto del anterior. Es una señal de dónde mirar, no un error.
      </p>
      <ul className="flex flex-col gap-3">
        {alertas.map((a) => (
          <li key={a.periodo + a.titulo} className="rounded-xl bg-mist/50 p-4">
            <p className="text-sm font-semibold text-ink">
              <Chip tono={a.nivel === "critico" ? "critico" : "aviso"}>{mesLargo(a.periodo)}</Chip>{" "}
              <span className="ml-1">{a.titulo}</span>
            </p>
            <p className="mt-1.5 text-sm text-ink-soft">
              {a.detalle}
              {a.contratoId && <> Mayor peso: <strong className="text-ink">{nombreDe(a.contratoId)}</strong>.</>}
            </p>
          </li>
        ))}
      </ul>
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
            {contrato.padreId
              ? `Anexo · ${contrato.cliente || contrato.padreId}`
              : `${contrato.cliente} · ${contrato.id}`}
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

/* ── Filtros ──────────────────────────────────────────────────────────────── */

/** Id de Oficina Central en el selector; no choca con ningún contrato. */
const OFICINA = "oficina-central";

type GrupoContrato = { id: string; nombre: string; anexos: { id: string; nombre: string }[] };

/** Qué contratos entran al tablero: los que operan, los cerrados o todos. */
type Alcance = "vigentes" | "cerrados" | "todos";

const alcances: { id: Alcance; titulo: string }[] = [
  { id: "vigentes", titulo: "Vigentes" },
  { id: "cerrados", titulo: "Cerrados" },
  { id: "todos", titulo: "Todos" },
];

/**
 * Contratos y período. Los contratos se eligen con casillas, como un filtro de
 * planilla: se marcan uno o varios (Torres + Misceláneos) y quedan como
 * etiquetas que se quitan de a una. Un anexo es un contrato más y se marca por
 * separado. Sin marcar nada se ven todos, cada uno por su lado.
 */
function FiltrosDashboard({
  grupos,
  seleccion,
  alCambiarSeleccion,
  alcance,
  alCambiarAlcance,
  hayCerrados,
  periodo,
  alCambiarPeriodo,
  mesesDisponibles,
  acciones,
}: {
  grupos: GrupoContrato[];
  seleccion: string[];
  alCambiarSeleccion: (ids: string[]) => void;
  alcance: Alcance;
  alCambiarAlcance: (a: Alcance) => void;
  hayCerrados: boolean;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
  mesesDisponibles: { id: Periodo; titulo: string }[];
  acciones?: React.ReactNode;
}) {
  const nombre = (id: string) => {
    for (const g of grupos) {
      if (g.id === id) return g.nombre;
      const a = g.anexos.find((x) => x.id === id);
      if (a) return `${g.nombre} › ${a.nombre}`;
    }
    return id;
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <CampoFiltro etiqueta="Contratos">
          <SelectorContratos grupos={grupos} seleccion={seleccion} alCambiar={alCambiarSeleccion} />
        </CampoFiltro>
        {hayCerrados && (
          <CampoFiltro etiqueta="Estado">
            <Filtro etiqueta="Estado del contrato" opciones={alcances} valor={alcance} alCambiar={alCambiarAlcance} />
          </CampoFiltro>
        )}
        <CampoFiltro etiqueta="Período">
          <Desplegable
            etiqueta="Período"
            valor={periodo}
            alCambiar={alCambiarPeriodo}
            grupos={[{ opciones: rangos }, { titulo: "Un mes en particular", opciones: mesesDisponibles }]}
          />
        </CampoFiltro>
        {acciones && <div className="ml-auto">{acciones}</div>}
      </div>

      {seleccion.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Contratos seleccionados">
          {seleccion.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => alCambiarSeleccion(seleccion.filter((x) => x !== id))}
                title="Quitar de la selección"
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan/10 py-1 pl-3 pr-2 text-xs font-semibold text-cyan-deep transition-colors hover:bg-cyan/20"
              >
                {nombre(id)}
                <span aria-hidden="true" className="text-sm leading-none">×</span>
                <span className="sr-only">Quitar {nombre(id)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => alCambiarSeleccion([])}
              className="px-2 py-1 text-xs font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Quitar todos
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Lista desplegable con casillas: contratos y, debajo de cada uno, sus anexos. */
function SelectorContratos({
  grupos,
  seleccion,
  alCambiar,
}: {
  grupos: GrupoContrato[];
  seleccion: string[];
  alCambiar: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const alternar = (id: string) =>
    alCambiar(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);

  const q = busqueda.trim().toLowerCase();
  const visibles = grupos.filter(
    (g) => !q || g.nombre.toLowerCase().includes(q) || g.anexos.some((a) => a.nombre.toLowerCase().includes(q)),
  );
  const resumen =
    seleccion.length === 0 ? "Todos los contratos" : seleccion.length === 1 ? "1 seleccionado" : `${seleccion.length} seleccionados`;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className="flex w-full min-w-[14rem] max-w-[18rem] items-center justify-between gap-3 rounded-full border border-mist-deep bg-white py-2 pl-4 pr-3.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink focus:outline-none focus:ring-2 focus:ring-cyan"
      >
        <span className="truncate">{resumen}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute left-0 z-30 mt-2 w-[min(22rem,90vw)] rounded-2xl border border-mist-deep bg-white p-3 shadow-lg">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar contrato…"
            aria-label="Buscar contrato"
            className="mb-2 w-full rounded-xl border border-mist-deep px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
          />
          <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => alCambiar(grupos.flatMap((g) => [g.id, ...g.anexos.map((a) => a.id)]))}
              className="text-cyan-deep hover:underline"
            >
              Seleccionar todo
            </button>
            <button type="button" onClick={() => alCambiar([])} className="text-ink-soft hover:text-ink hover:underline">
              Limpiar
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {visibles.length === 0 && <li className="px-2 py-3 text-sm text-ink-soft">Ningún contrato coincide.</li>}
            {visibles.map((g) => (
              <li key={g.id}>
                <Casilla marcada={seleccion.includes(g.id)} alCambiar={() => alternar(g.id)} fuerte>
                  {g.nombre}
                </Casilla>
                {g.anexos.map((a) => (
                  <div key={a.id} className="pl-6">
                    <Casilla marcada={seleccion.includes(a.id)} alCambiar={() => alternar(a.id)}>
                      ↳ {a.nombre}
                    </Casilla>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Casilla({
  marcada,
  alCambiar,
  fuerte = false,
  children,
}: {
  marcada: boolean;
  alCambiar: () => void;
  fuerte?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-mist/60">
      <input type="checkbox" checked={marcada} onChange={alCambiar} className="h-4 w-4 shrink-0 accent-[#137e9e]" />
      <span className={`min-w-0 truncate ${fuerte ? "font-semibold text-ink" : "text-ink-soft"}`}>{children}</span>
    </label>
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
      clave: "extra",
      titulo: "De ello extraordinario",
      derecha: true,
      celda: (f) => {
        const extra = f.consolidado.costoParadaPlanta + f.consolidado.costoOtrosExtra;
        return <span className="text-ink-soft">{extra > 0 ? formatearMonto(extra) : "—"}</span>;
      },
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
  personal,
}: {
  categorias: FilaCategoria[];
  contratoFiltro: string | string[];
  meses: number;
  periodosVisibles: string[];
  personal: PersonalDividido;
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
    <>
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
    {personal.total > 0 && (
      <p className="mt-4 rounded-xl bg-mist/50 p-4 text-sm text-ink-soft">
        <strong className="text-ink">Personal {formatearMonto(personal.total)}</strong> = ordinario{" "}
        <strong className="text-ink">{formatearMonto(personal.ordinario)}</strong> + parada de planta{" "}
        <strong className="text-ink">{formatearMonto(personal.paradaPlanta)}</strong> + otros extraordinarios{" "}
        <strong className="text-ink">{formatearMonto(personal.otrosExtra)}</strong>
        {" "}(reemplazos, licencias, feriados compensados…).
      </p>
    )}
    </>
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
