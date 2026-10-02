"use client";

import { useMemo, useState } from "react";
import { FormularioCompra } from "../formularios/FormularioCompra";
import { FormularioServicio } from "../formularios/FormularioServicio";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, type Tono } from "../ui/Chip";
import { AccionesFila, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarProveedores, type Proveedor } from "@/lib/abastecimiento";
import { cargarCampos, type CampoContrato } from "@/lib/campos";
import { cargarCategorias, type Categoria } from "@/lib/categorias";
import { useConsulta } from "@/lib/consulta";
import { usePuede } from "@/lib/sesion";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import {
  cargarCompras,
  cargarEgresosTerceros,
  cargarServicios,
  tiposServicio,
  type Compra,
  type EgresoTercero,
  type Servicio,
} from "@/lib/egresos";
import { diasHastaFecha, formatearFecha, formatearMonto, mesLargo } from "@/lib/formato";

/**
 * Compras y servicios, juntos.
 *
 * Son la misma pregunta —cuánto se gastó con terceros y en qué— y separarlos en
 * dos pantallas obligaba a sumar de cabeza. Se muestran en una sola lista con el
 * origen a la vista.
 *
 * Los formularios siguen siendo dos, y eso no es una inconsistencia: un
 * subcontrato o un arriendo tienen período y recurrencia que una compra de
 * ferretería no tiene. Un formulario único tendría la mitad de los campos
 * apagados según lo que se elija arriba, que es peor que tener dos botones.
 */

type Filtrado = "todos" | "compras" | "servicios" | "recurrentes" | "plazos";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "compras", titulo: "Compras" },
  { id: "servicios", titulo: "Servicios" },
  { id: "recurrentes", titulo: "Recurrentes" },
  { id: "plazos", titulo: "Por vencer" },
];

function diasDeServicio(e: EgresoTercero) {
  return e.origen === "servicio" && e.hasta ? diasHastaFecha(e.hasta) : null;
}

type Datos = {
  egresos: EgresoTercero[];
  compras: Compra[];
  servicios: Servicio[];
  contratos: ContratoBreve[];
  campos: CampoContrato[];
  proveedores: Proveedor[];
  categorias: Categoria[];
};

async function cargar(): Promise<Datos> {
  const [egresos, compras, servicios, contratos, campos, proveedores, categorias] =
    await Promise.all([
      cargarEgresosTerceros(),
      cargarCompras(),
      cargarServicios(),
      cargarContratosBreve(),
      cargarCampos(),
      cargarProveedores(),
      cargarCategorias(),
    ]);
  return { egresos, compras, servicios, contratos, campos, proveedores, categorias };
}

export function VistaEgresosTerceros() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const edicion = useEdicion<EgresoTercero>();
  const [creando, setCreando] = useState<"compra" | "servicio" | null>(null);
  const puedeCargar = usePuede("gestion.editar");

  return (
    <>
      <Encabezado
        titulo="Compras y Servicios"
        descripcion="Todo lo que se gasta con terceros: materiales, subcontratos, arriendos y fletes. El personal va aparte, porque no es un gasto con un tercero."
        acciones={
          puedeCargar && (
            <div className="flex gap-2">
              <BotonCrear onClick={() => setCreando("compra")}>Nueva compra</BotonCrear>
              <BotonCrear onClick={() => setCreando("servicio")} destacado>
                Nuevo servicio
              </BotonCrear>
            </div>
          )
        }
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos.egresos} edicion={edicion} />

            {/* Cada origen abre su propio formulario, con sus campos. */}
            {(creando === "compra" || edicion.registro?.origen === "compra") && (
              <FormularioCompra
                compra={
                  edicion.registro
                    ? (datos.compras.find((c) => c.id === edicion.registro?.id) ?? null)
                    : null
                }
                compras={datos.compras}
                contratos={datos.contratos}
                campos={datos.campos}
                proveedores={datos.proveedores}
                categorias={datos.categorias}
                alCerrar={() => {
                  setCreando(null);
                  edicion.cerrar();
                }}
                alGuardado={recargar}
              />
            )}

            {(creando === "servicio" || edicion.registro?.origen === "servicio") && (
              <FormularioServicio
                servicio={
                  edicion.registro
                    ? (datos.servicios.find((s) => s.id === edicion.registro?.id) ?? null)
                    : null
                }
                contratos={datos.contratos}
                campos={datos.campos}
                categorias={datos.categorias}
                alCerrar={() => {
                  setCreando(null);
                  edicion.cerrar();
                }}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial
          tabla={edicion.historial.id.startsWith("SV") ? "servicios" : "compras"}
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla={edicion.adjuntos.id.startsWith("SV") ? "servicios" : "compras"}
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

function BotonCrear({
  onClick,
  destacado = false,
  children,
}: {
  onClick: () => void;
  destacado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destacado
          ? "inline-flex items-center gap-2 rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
          : "inline-flex items-center gap-2 rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
      }
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
      {children}
    </button>
  );
}

function Contenidos({
  filas,
  edicion,
}: {
  filas: EgresoTercero[];
  edicion: ReturnType<typeof useEdicion<EgresoTercero>>;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todos");

  const visibles = useMemo(() => {
    if (filtro === "compras") return filas.filter((e) => e.origen === "compra");
    if (filtro === "servicios") return filas.filter((e) => e.origen === "servicio");
    if (filtro === "recurrentes") return filas.filter((e) => e.recurrente);
    if (filtro === "plazos") return filas.filter((e) => {
      const dias = diasDeServicio(e);
      return dias !== null && dias <= 30;
    });
    return filas;
  }, [filas, filtro]);

  const neto = visibles.reduce((t, e) => t + e.neto, 0);
  const total = visibles.reduce((t, e) => t + e.total, 0);

  const compras = filas.filter((e) => e.origen === "compra");
  const servicios = filas.filter((e) => e.origen === "servicio");
  const recurrente = filas.filter((e) => e.recurrente).reduce((t, e) => t + e.neto, 0);
  const avisosPlazo = filas.filter((e) => {
    const dias = diasDeServicio(e);
    return dias !== null && dias <= 30;
  }).length;

  /* El egreso del mes en curso: es la cifra por la que se pregunta, porque el
     resultado del contrato se calcula por mes. */
  const mes = new Date().toISOString().slice(0, 7);
  const delMes = filas.filter((e) => e.periodo.slice(0, 7) === mes).reduce((t, e) => t + e.neto, 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Compras",
            valor: formatearMonto(compras.reduce((t, e) => t + e.neto, 0)),
            nota: `${compras.length} documentos, neto`,
          },
          {
            etiqueta: "Servicios",
            valor: formatearMonto(servicios.reduce((t, e) => t + e.neto, 0)),
            nota: `${servicios.length} subcontratos, arriendos y fletes`,
          },
          {
            etiqueta: "Gasto recurrente",
            valor: formatearMonto(recurrente),
            nota: "Se repite mientras dure el período",
            acento: recurrente > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Egreso del mes en curso",
            valor: formatearMonto(delMes),
            nota: "Neto cargado en el mes actual",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${filas.length} movimientos${avisosPlazo ? ` · ${avisosPlazo} servicios por vencer o vencidos` : ""}`}
        filtros={<Filtro etiqueta="Ver" opciones={opciones} valor={filtro} alCambiar={setFiltro} />}
      >
        <Tabla
          columnas={columnas(edicion)}
          filas={visibles}
          claveDe={(e) => e.id}
          vacio="Ningún movimiento en este filtro."
          pie={
            <>
              <Total colSpan={4}>Total</Total>
              <Total derecha>{formatearMonto(neto)}</Total>
              <Total derecha>{formatearMonto(total)}</Total>
              <Total />
            </>
          }
        />
      </Panel>
    </>
  );
}

const tonoOrigen: Record<"compra" | "servicio", Tono> = {
  compra: "neutro",
  servicio: "info",
};

const columnas = (
  edicion: ReturnType<typeof useEdicion<EgresoTercero>>,
): Columna<EgresoTercero>[] => [
  {
    clave: "detalle",
    titulo: "Detalle",
    encabezado: true,
    celda: (e) => (
      <>
        <span className="block font-semibold text-ink">{e.detalle}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {e.id}
          {e.documento ? ` · ${e.documento}` : ""}
        </span>
      </>
    ),
  },
  {
    clave: "origen",
    titulo: "Origen",
    celda: (e) => (
      <>
        <Chip tono={tonoOrigen[e.origen]}>{e.origen === "compra" ? "Compra" : "Servicio"}</Chip>
        {e.clase && (
          <span className="mt-1 block text-xs text-ink-soft">
            {tiposServicio.find((t) => t.id === e.clase)?.titulo ?? e.clase}
          </span>
        )}
      </>
    ),
  },
  {
    clave: "tercero",
    titulo: "Tercero",
    celda: (e) => (
      <>
        <span className="block text-ink">{e.tercero}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {e.contratoId} · {e.categoria}
        </span>
      </>
    ),
  },
  {
    clave: "fecha",
    titulo: "Período",
    celda: (e) => {
      const dias = diasDeServicio(e);
      return <>
        <span className="block whitespace-nowrap text-ink-soft">
          {e.origen === "compra" ? mesLargo(e.periodo) : formatearFecha(e.fecha)}
        </span>
        {e.origen === "compra" && e.fecha.slice(0, 7) !== e.periodo.slice(0, 7) && (
          <span className="mt-0.5 block text-xs text-ink-soft">Documento: {formatearFecha(e.fecha)}</span>
        )}
        {e.recurrente && (
          <span className="mt-0.5 block text-xs font-semibold text-[#8a5a09]">
            {e.periodicidad ?? "recurrente"}
          </span>
        )}
        {(e.desde || e.hasta) && (
          <span className="mt-0.5 block text-xs text-ink-soft">
            {e.desde ? `${formatearFecha(e.desde)} → ` : "Hasta "}{formatearFecha(e.hasta)}
          </span>
        )}
        {dias !== null && dias <= 30 && <span className="mt-1 block">
          <Chip tono={dias < 0 ? "critico" : "aviso"}>
            {dias < 0 ? `Vencido hace ${-dias} días` : dias === 0 ? "Vence hoy" : `Vence en ${dias} días`}
          </Chip>
        </span>}
      </>;
    },
  },
  {
    clave: "neto",
    titulo: "Neto",
    derecha: true,
    celda: (e) => (
      <>
        <span className="block text-ink-soft">{formatearMonto(e.neto)}</span>
        {e.tipo === "reembolsable" && (
          <span className="mt-0.5 block text-xs text-ink-soft">reembolsable</span>
        )}
      </>
    ),
  },
  {
    clave: "total",
    titulo: "Total",
    derecha: true,
    celda: (e) => <span className="font-semibold text-ink">{formatearMonto(e.total)}</span>,
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (e) => (
      <AccionesFila
          permiso="gestion.editar"
        alEditar={() => edicion.abrirEdicion(e)}
        alVerHistorial={() => edicion.verHistorial(e.id, `${e.id} · ${e.tercero}`)}
        alVerAdjuntos={() => edicion.verAdjuntos(e.id, `${e.id} · ${e.tercero}`)}
      />
    ),
  },
];
