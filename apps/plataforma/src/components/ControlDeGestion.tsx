"use client";

import { useMemo, useState } from "react";
import { AnalisisGrafico } from "./AnalisisGrafico";
import { InformeImprimible } from "./InformeImprimible";
import { InformativosDelContrato } from "./InformativosDelContrato";
import { Conclusiones } from "./control-de-gestion/Conclusiones";
import { FiltrosDashboard, OFICINA, type Alcance } from "./control-de-gestion/FiltrosDashboard";
import { PanelAlertas } from "./control-de-gestion/PanelAlertas";
import { IndicadoresParalelos, PanelOrdinarioExtra } from "./control-de-gestion/PanelOrdinarioExtra";
import {
  esMes,
  mesDe,
  mesEnCurso,
  periodoInicial,
  periodosDe,
  rangos,
  type Periodo,
} from "./control-de-gestion/periodo";
import { TablaCategorias } from "./control-de-gestion/TablaCategorias";
import { TablaEvolucion } from "./control-de-gestion/TablaEvolucion";
import { TarjetaContrato } from "./control-de-gestion/TarjetaContrato";
import { ValorUf } from "./control-de-gestion/ValorUf";
import { cargarInformativos, sumarInformativos } from "@/lib/informativos-contrato";
import { BotonImprimir, Impresion } from "./ui/Impresion";
import { Contenido, Panel, Resumen } from "./ui/Vista";
import { useConsulta } from "@/lib/consulta";
import {
  acumularCategorias,
  cargarDashboard,
  detectarAlertas,
  dividirPersonal,
  evolucion as calcularEvolucion,
  porContrato as agruparPorContrato,
  semaforo,
  sumar,
  textoSemaforo,
  type DatosDashboard,
  type FilaMes,
} from "@/lib/dashboard";
import { formatearMonto, mesLargo } from "@/lib/formato";
import { useUsuario } from "@/lib/sesion";
import { useVistaGuardada } from "@/lib/vista-guardada";
import { totalOficina } from "@/lib/oficina-central";

/**
 * Dashboard de rentabilidad.
 *
 * Responde la pregunta con la que empieza cualquier reunión de control de
 * gestión: cuánto se vendió, cuánto costó, cuánto quedó, y si eso alcanza la
 * meta. Primero consolidado, después contrato por contrato, después mes a mes.
 */

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

  /* Un contrato cerrado ya no tiene un mes «a medias»: su última venta puede caer en el mes en
     curso (p. ej. el último estado de pago) y también cuenta, para que el Dashboard coincida con
     su ficha de cierre. Un contrato vigente sigue sin contar el mes corriente. */
  const delMesEnCursoDeCerrado = (f: FilaMes) => cerradosIds.has(f.padreId ?? f.contratoId) && f.periodo >= mesEnCurso();

  const recortarPeriodo = (origen: FilaMes[], porUnidades: boolean) => {
    let base = origen;
    if (porUnidades && unidades) {
      base = base.filter((f) => unidades.includes(f.contratoId));
    }
    if (esMes(periodo)) {
      base = base.filter((f) => f.periodo === mesDe(periodo));
    } else if (periodo === "todo") {
      base = base.filter((f) => periodosCerrados.includes(f.periodo) || delMesEnCursoDeCerrado(f));
    } else {
      const meses = (
        !(porUnidades && unidades) ? periodosCerrados : [...new Set(base.map((f) => f.periodo).filter((p) => periodosCerrados.includes(p)))].sort()
      ).slice(-Number(periodo));
      base = base.filter((f) => meses.includes(f.periodo) || delMesEnCursoDeCerrado(f));
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

  /* Los activos comprados para contratos que ya se cerraron: la obra terminó y esos
     activos quedan en la empresa. Se gastaron en el contrato y ahí siguen contando;
     Oficina Central solo los VALORIZA (dato informativo, mismo recorte de período):
     no suman a sus egresos ni restan al contrato. Un contrato abierto no los traslada aún. */
  const activosDeCerrados = useMemo(() => {
    const meses = (esMes(periodo) ? [mesDe(periodo)] : periodo === "todo" ? periodosCerrados : periodosCerrados.slice(-Number(periodo))).map((p) => p.slice(0, 7));
    const filas = (datos.activosDeContratos ?? []).filter((f) => cerradosIds.has(f.contratoId) && meses.includes(f.periodo.slice(0, 7)));
    return { total: filas.reduce((t, f) => t + f.neto, 0), contratos: [...new Set(filas.map((f) => f.contratoId))].length };
  }, [datos.activosDeContratos, cerradosIds, periodo, periodosCerrados]);

  /* Por cobrar, activos y por pagar a proveedores de los contratos a la vista: informativos, no
     dependen del período. Un extra: si falla, el Dashboard sale igual sin ellos. */
  const informativos = useConsulta(cargarInformativos, `${usuario.id}:${usuario.empresa}:informativos-v2`);
  const informativosVisibles = useMemo(() => {
    if (soloOficina || informativos.estado.estado !== "listo") return null;
    const ids = new Set(mesesAlcance.map((f) => f.padreId ?? f.contratoId));
    const enVista = [...ids].filter((id) => !unidades || unidades.some((u) => u.split("#")[0] === id));
    return sumarInformativos(informativos.estado.datos, enVista);
  }, [informativos.estado, mesesAlcance, unidades, soloOficina]);

  const total = sumar(filas);
  const operativosOficina = totalOficina(oficinaVisible.filter((f) => !f.esActivo)) + personalOficina;
  const activosOficina = totalOficina(oficinaVisible.filter((f) => f.esActivo));
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
      {conOficina && <IndicadoresParalelos filas={oficinaVisible} personal={personalOficina} margenContratos={0} finiquitos={finiquitos + finiquitosOficina} conOficina activosDeContratos={activosDeCerrados} />}
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

      {informativosVisibles && <InformativosDelContrato info={informativosVisibles} />}

      <IndicadoresParalelos filas={oficinaVisible} personal={personalOficina} margenContratos={total.margen} finiquitos={finiquitos + finiquitosOficina} conOficina={conOficina} activosDeContratos={activosDeCerrados} />

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

      {/* ── Ordinario y extraordinario ─────────────────────────────────────── */}
      <PanelOrdinarioExtra total={total} />

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

