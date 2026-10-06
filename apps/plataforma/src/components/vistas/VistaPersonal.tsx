"use client";

import { useMemo, useState } from "react";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { FormularioPersonal } from "../formularios/FormularioPersonal";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
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
};

async function cargar(): Promise<Datos> {
  const [personal, finiquitos, contratos, campos, categorias] = await Promise.all([
    cargarPersonal(),
    cargarFiniquitos("contratos"),
    cargarContratosBreve(),
    cargarCampos(),
    cargarCategorias(),
  ]);
  return { personal, finiquitos, contratos, campos, categorias };
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

function Contenidos({
  datos,
  edicion,
  alCambiar,
}: {
  datos: Datos;
  edicion: ReturnType<typeof useEdicion<CostoPersonal>>;
  alCambiar: () => void;
}) {
  const filas = datos.personal;
  const [mes, setMes] = useState<string>("todos");

  const meses = useMemo(() => {
    const unicos = [...new Set([...filas, ...datos.finiquitos].map((f) => f.periodo))].sort().reverse();
    return [
      { id: "todos", titulo: "Todos" },
      ...unicos.map((m) => ({ id: m, titulo: mesLargo(m).replace(/ \d{4}$/, "") })),
    ];
  }, [filas, datos.finiquitos]);

  const visibles = useMemo(
    () => (mes === "todos" ? filas : filas.filter((f) => f.periodo === mes)),
    [filas, mes],
  );

  const remuneraciones = visibles.reduce((t, f) => t + f.remuneraciones, 0);
  const leyes = visibles.reduce((t, f) => t + f.leyesSociales, 0);
  const costo = visibles.reduce((t, f) => t + f.costoTotal, 0);
  const finiquitosVisibles = mes === "todos" ? datos.finiquitos : datos.finiquitos.filter((f) => f.periodo === mes);
  const finiquitos = finiquitosVisibles.reduce((t, f) => t + f.total, 0);
  const horas = visibles.reduce((t, f) => t + f.horasHombre, 0);

  // La dotación del último mes es la foto de hoy; sumar todos los meses daría
  // un número sin sentido (la misma persona contada nueve veces).
  const ultimoMes = filas.length > 0 ? filas[0].periodo : null;
  const dotacionActual = filas
    .filter((f) => f.periodo === ultimoMes)
    .reduce((t, f) => t + f.dotacion, 0);

  const costoPorHora = horas > 0 ? costo / horas : 0;

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Pago de personal",
            valor: formatearMonto(costo + finiquitos),
            nota: `${mes === "todos" ? "Acumulado" : mesLargo(mes)} · haberes ${formatearMonto(remuneraciones)} · leyes sociales ${formatearMonto(leyes)}${finiquitos > 0 ? ` · finiquitos ${formatearMonto(finiquitos)}` : ""}`,
          },
          {
            etiqueta: "Dotación actual",
            valor: formatearNumero(dotacionActual),
            nota: ultimoMes ? `Personas en ${mesLargo(ultimoMes)}` : "Sin registro",
          },
          {
            etiqueta: "Horas hombre",
            valor: formatearNumero(horas),
            nota: "En el período seleccionado",
          },
          {
            etiqueta: "Costo por HH",
            valor: formatearPesos(Math.round(costoPorHora)),
            nota: "Haberes y leyes sociales, sin finiquitos",
          },
        ]}
      />

      <Panel
        titulo="Detalle por contrato y mes"
        nota={`${visibles.length} de ${filas.length} registros`}
        filtros={<Filtro etiqueta="Mes" opciones={meses} valor={mes} alCambiar={setMes} />}
      >
        <Tabla
          columnas={columnas(edicion)}
          filas={visibles}
          claveDe={(f) => f.id}
          vacio="Ningún registro en este mes."
          pie={
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearNumero(horas)}</Total>
              <Total derecha>{formatearMonto(remuneraciones)}</Total>
              <Total derecha>{formatearMonto(leyes)}</Total>
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
    clave: "leyes",
    titulo: "Leyes sociales",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearMonto(f.leyesSociales)}</span>,
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
