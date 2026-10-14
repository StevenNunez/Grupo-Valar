"use client";

import { useMemo, useState } from "react";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { FormularioPersonal } from "../formularios/FormularioPersonal";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { anexoRaiz, cargarAnexos, type Anexo } from "@/lib/anexos";
import { opcionesDeUnidad, unidadDe, unidades } from "@/lib/unidades";
import { cargarCampos, type CampoContrato } from "@/lib/campos";
import { cargarCategorias, type Categoria } from "@/lib/categorias";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearMonto, formatearNumero, formatearPesos, mesLargo } from "@/lib/formato";
import { cargarPersonal, type CostoPersonal } from "@/lib/egresos";
import { cargarFiniquitos, type Finiquito } from "@/lib/finiquitos";
import { motivosHhExtra } from "@/lib/haberes";
import { PanelFiniquitos } from "../Finiquitos";

type Datos = {
  personal: CostoPersonal[];
  finiquitos: Finiquito[];
  contratos: ContratoBreve[];
  campos: CampoContrato[];
  categorias: Categoria[];
  anexos: Anexo[];
};

async function cargar(): Promise<Datos> {
  const [personal, finiquitos, contratos, campos, categorias, anexos] = await Promise.all([
    cargarPersonal(),
    cargarFiniquitos("contratos"),
    cargarContratosBreve(),
    cargarCampos(),
    cargarCategorias(),
    cargarAnexos().catch(() => [] as Anexo[]),
  ]);
  return { personal, finiquitos, contratos, campos, categorias, anexos };
}

export function VistaPersonal() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const edicion = useEdicion<CostoPersonal>("costos_personal");

  return (
    <>
      <Encabezado
        titulo="Personal"
        descripcion="Los haberes del mes por contrato, como vienen en la nómina de pagos: sueldo base, horas extra y no imponibles. La nómina se adjunta con el clip de la fila, que es el documento que respalda estas cifras."
        acciones={<BotonNuevo permiso="personal.editar" onClick={edicion.abrirNuevo}>Nuevo registro</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos datos={datos} edicion={edicion} alCambiar={recargar} />
            {edicion.editando && (
              <FormularioPersonal
                registro={edicion.registro}
                registros={datos.personal}
                campos={datos.campos}
                categorias={datos.categorias}
                contratos={datos.contratos}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial
          tabla="costos_personal"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="costos_personal"
          registroId={edicion.adjuntos.id}
          titulo={edicion.adjuntos.titulo}
          abierto
          alCerrar={edicion.cerrarAdjuntos}
          alCambiar={edicion.recontarAdjuntos}
        />
      )}
    </>
  );
}

type Estatus = "todos" | "hhExtra" | "finiquitos" | "reserva";

const estatusPersonal: { id: Estatus; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "hhExtra", titulo: "Con HH extra" },
  { id: "finiquitos", titulo: "Con finiquitos" },
  { id: "reserva", titulo: "Finiquito con reserva" },
];

const delMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

function Contenidos({
  datos,
  edicion,
  alCambiar,
}: {
  datos: Datos;
  edicion: ReturnType<typeof useEdicion<CostoPersonal>>;
  alCambiar: () => void;
}) {
  const { anexos } = datos;
  const [mes, setMes] = useState<string>("todos");
  const [contrato, setContrato] = useState("todos");
  const [estatus, setEstatus] = useState<Estatus>("todos");

  const meses = useMemo(() => {
    const unicos = [...new Set([...datos.personal, ...datos.finiquitos].map((f) => delMes(f.periodo)))].sort().reverse();
    return unicos.map((m) => ({ id: m, titulo: mesLargo(m) }));
  }, [datos.personal, datos.finiquitos]);

  /* Un anexo se controla como un contrato aparte: Carpas tiene su propia opción. */
  const opcionesContrato = useMemo(
    () =>
      opcionesDeUnidad(unidades(datos.contratos, anexos), [
        ...datos.personal.map((f) => unidadDe(anexos, f.contratoId, f.anexoId)),
        ...datos.finiquitos.filter((f) => f.contratoId).map((f) => unidadDe(anexos, f.contratoId as string, f.anexoId)),
      ]),
    [datos.contratos, datos.personal, datos.finiquitos, anexos],
  );

  // Período y contrato recortan los dos orígenes; el estatus decide qué se mira.
  const filas = useMemo(
    () =>
      datos.personal.filter(
        (f) =>
          (mes === "todos" || delMes(f.periodo) === mes) &&
          (contrato === "todos" || unidadDe(anexos, f.contratoId, f.anexoId) === contrato),
      ),
    [datos.personal, anexos, mes, contrato],
  );
  const finiquitosDelFiltro = useMemo(
    () =>
      datos.finiquitos.filter(
        (f) =>
          (mes === "todos" || delMes(f.periodo) === mes) &&
          (contrato === "todos" || (f.contratoId !== null && unidadDe(anexos, f.contratoId, f.anexoId) === contrato)),
      ),
    [datos.finiquitos, anexos, mes, contrato],
  );

  const visibles = useMemo(() => {
    if (estatus === "hhExtra") return filas.filter((f) => f.horasExtraCantidad > 0 || f.horasExtraMonto > 0);
    if (estatus === "finiquitos" || estatus === "reserva") return [];
    return filas;
  }, [filas, estatus]);
  const finiquitosVisibles = useMemo(() => {
    if (estatus === "hhExtra") return [];
    if (estatus === "reserva") return finiquitosDelFiltro.filter((f) => f.conReserva);
    return finiquitosDelFiltro;
  }, [finiquitosDelFiltro, estatus]);

  const remuneraciones = visibles.reduce((t, f) => t + f.remuneraciones, 0);
  const aporte = visibles.reduce((t, f) => t + f.aportePatronal, 0);
  const costoHhExtra = visibles.reduce((t, f) => t + f.horasExtraMonto, 0);
  const costo = visibles.reduce((t, f) => t + f.costoTotal, 0);
  const finiquitos = finiquitosVisibles.reduce((t, f) => t + f.total, 0);
  const conReserva = finiquitosVisibles.filter((f) => f.conReserva);
  const horas = visibles.reduce((t, f) => t + f.horasHombre, 0);

  // La dotación del último mes es la foto de hoy; sumar todos los meses daría
  // un número sin sentido (la misma persona contada nueve veces).
  const ultimoMes = visibles.reduce<string | null>((u, f) => (u === null || f.periodo > u ? f.periodo : u), null);
  const dotacionActual = visibles
    .filter((f) => f.periodo === ultimoMes)
    .reduce((t, f) => t + f.dotacion, 0);

  const costoPorHora = horas > 0 ? costo / horas : 0;
  const cuando = mes === "todos" ? "Acumulado" : mesLargo(mes);

  const nombreAnexo = (id: string | null) => {
    if (!id) return null;
    const a = anexos.find((x) => x.id === anexoRaiz(anexos, id));
    return a ? a.nombre?.trim() || `Anexo N°${a.numero}` : null;
  };

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Pago de personal",
            valor: formatearMonto(costo + finiquitos),
            nota: `${cuando} · haberes ${formatearMonto(remuneraciones)} · aporte patronal ${formatearMonto(aporte)}${finiquitos > 0 ? ` · finiquitos ${formatearMonto(finiquitos)}` : ""}`,
          },
          {
            etiqueta: "Dotación actual",
            valor: formatearNumero(dotacionActual),
            nota: ultimoMes ? `Personas en ${mesLargo(ultimoMes)}` : "Sin registro",
          },
          {
            etiqueta: "Horas hombre",
            valor: formatearNumero(horas),
            nota: costoHhExtra > 0 ? `${cuando} · HH extra ${formatearMonto(costoHhExtra)}` : `${cuando}, sin HH extra`,
          },
          {
            etiqueta: "Finiquitos",
            valor: formatearMonto(finiquitos),
            nota: `${finiquitosVisibles.length} ${finiquitosVisibles.length === 1 ? "finiquito" : "finiquitos"}${conReserva.length > 0 ? ` · ${conReserva.length} con reserva de derechos` : ""}`,
            acento: conReserva.length > 0 ? "aviso" : undefined,
          },
        ]}
      />

      <Panel
        titulo="Detalle por contrato y mes"
        nota={`${visibles.length} de ${datos.personal.length} registros · las tarjetas siguen los filtros · costo por HH ${formatearPesos(Math.round(costoPorHora))}`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Período">
              <Desplegable
                etiqueta="Período"
                valor={mes}
                alCambiar={setMes}
                grupos={[{ opciones: [{ id: "todos", titulo: "Todos los meses" }] }, { titulo: "Un mes", opciones: meses }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Contrato">
              <Desplegable
                etiqueta="Contrato"
                valor={contrato}
                alCambiar={setContrato}
                grupos={[{ opciones: opcionesContrato.map((o) => ({ ...o, titulo: o.id === "todos" ? "Todos los contratos" : o.titulo })) }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Estatus">
              <Filtro etiqueta="Estatus" opciones={estatusPersonal} valor={estatus} alCambiar={setEstatus} />
            </CampoFiltro>
          </>
        }
      >
        <Tabla
          columnas={columnas(edicion, nombreAnexo)}
          filas={visibles}
          claveDe={(f) => f.id}
          vacio={estatus === "finiquitos" || estatus === "reserva" ? "Este estatus solo mira finiquitos (abajo)." : "Ningún registro con este filtro."}
          pie={
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearNumero(horas)}</Total>
              <Total derecha>{formatearMonto(remuneraciones)}</Total>
              <Total derecha>{formatearMonto(aporte)}</Total>
              <Total derecha>{formatearMonto(costoHhExtra)}</Total>
              <Total derecha>{formatearMonto(costo)}</Total>
              <Total />
            </>
          }
        />
      </Panel>

      <div className="mt-6">
        <PanelFiniquitos
          de="contratos"
          filas={finiquitosVisibles}
          contratos={datos.contratos}
          categorias={datos.categorias}
          alCambiar={alCambiar}
        />
      </div>

      {visibles.some((f) => f.horasExtraCantidad > 0 || f.horasExtraMonto > 0) && (
        <div className="mt-6">
          <Panel titulo="Desglose de horas extra" nota="Horas y costo de cada motivo, que antes se resumían en la planilla de Misceláneos.">
            <Tabla
              filas={visibles.filter((f) => f.horasExtraCantidad > 0 || f.horasExtraMonto > 0)}
              claveDe={(f) => f.id}
              columnas={columnasHorasExtra}
            />
          </Panel>
        </div>
      )}
    </>
  );
}

const columnasHorasExtra: Columna<CostoPersonal>[] = [
  { clave: "mes", titulo: "Mes", encabezado: true, celda: (f) => <><span className="block font-semibold text-ink">{mesLargo(f.periodo)}</span><span className="text-xs text-ink-soft">{f.contratoId}</span></> },
  ...motivosHhExtra.map((m) => ({
    clave: m.horas,
    titulo: m.corto,
    derecha: true,
    celda: (f: CostoPersonal) => <HorasYCosto horas={horasDe(f)[m.horas]} costo={f.montosHh[m.monto]} />,
  })),
  { clave: "total", titulo: "Total HH extra", derecha: true, celda: (f) => <strong className="text-ink">{formatearNumero(f.horasExtraCantidad)}</strong> },
  { clave: "costo", titulo: "Costo HH extra", derecha: true, celda: (f) => <strong className="text-ink">{formatearPesos(f.horasExtraMonto)}</strong> },
];

const horasDe = (f: CostoPersonal) => ({
  hh_reemplazo: f.hhReemplazo,
  hh_parada_planta: f.hhParadaPlanta,
  hh_feriado_compensado: f.hhFeriadoCompensado,
  hh_apoyo_oficina: f.hhApoyoOficina,
  hh_otras: f.hhOtras,
});

/** Una celda del desglose: las horas y, debajo, lo que costaron. */
export function HorasYCosto({ horas, costo }: { horas: number; costo: number }) {
  if (!horas && !costo) return <span className="text-ink-soft">—</span>;
  return (
    <>
      <span className="block">{formatearNumero(horas)} HH</span>
      <span className="text-xs text-ink-soft">{formatearPesos(costo)}</span>
    </>
  );
}

const columnas = (
  edicion: ReturnType<typeof useEdicion<CostoPersonal>>,
  nombreAnexo: (id: string | null) => string | null,
): Columna<CostoPersonal>[] => [
  {
    clave: "contrato",
    titulo: "Contrato",
    encabezado: true,
    celda: (f) => (
      <>
        <span className="block font-semibold text-ink">{f.contrato}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {f.contratoId} · {f.faena}
          {nombreAnexo(f.anexoId) ? ` · Anexo: ${nombreAnexo(f.anexoId)}` : ""}
        </span>
      </>
    ),
  },
  {
    clave: "periodo",
    titulo: "Mes",
    celda: (f) => <span className="whitespace-nowrap text-ink-soft">{mesLargo(f.periodo)}</span>,
  },
  {
    clave: "dotacion",
    titulo: "Dotación",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearNumero(f.dotacion)}</span>,
  },
  {
    clave: "hh",
    titulo: "Horas hombre",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearNumero(f.horasHombre)}</span>,
  },
  {
    clave: "remuneraciones",
    titulo: "Total haberes",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearMonto(f.remuneraciones)}</span>,
  },
  {
    clave: "aporte",
    titulo: "Aporte patronal",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearMonto(f.aportePatronal)}</span>,
  },
  {
    clave: "hhExtra",
    titulo: "Costo total de las HH extra",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearMonto(f.horasExtraMonto)}</span>,
  },
  {
    clave: "total",
    titulo: "Costo total",
    derecha: true,
    celda: (f) => <span className="font-semibold text-ink">{formatearMonto(f.costoTotal)}</span>,
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (f) => (
      <AccionesFila
          permiso="personal.editar"
        alEditar={() => edicion.abrirEdicion(f)}
        alVerHistorial={() => edicion.verHistorial(f.id, `${f.id} · ${f.contrato}`)}
        alVerAdjuntos={() => edicion.verAdjuntos(f.id, `${f.id} · ${f.contrato}`)}
        cuantosAdjuntos={edicion.cuantosAdjuntos(f.id)}
      />
    ),
  },
];
