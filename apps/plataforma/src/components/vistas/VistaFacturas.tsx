"use client";

import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { Chip, type Tono } from "../ui/Chip";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { FormularioFactura } from "../formularios/FormularioFactura";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, DialogoHistorial, useEdicion } from "../ui/Historial";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { esDeLaUnidad, opcionesDeCiclos, unidadesCubiertas } from "@/lib/unidades";
import { diasDesde, formatearFecha, formatearMonto, mesLargo } from "@/lib/formato";
import { cargarCiclo, cargarFacturas, nombreEdp, type Ciclo, type EstadoCobro, type Factura } from "@/lib/ingresos";
import { useUsuario } from "@/lib/sesion";

const estados: Record<EstadoCobro, { titulo: string; tono: Tono }> = {
  emitida: { titulo: "Emitida", tono: "info" },
  enviada: { titulo: "Enviada", tono: "aviso" },
  pagada: { titulo: "Pagada", tono: "bueno" },
  vencida: { titulo: "Vencida", tono: "critico" },
};

type Filtrado = "todas" | "pendientes" | "vencidas" | "pagadas";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "pendientes", titulo: "Por cobrar" },
  { id: "vencidas", titulo: "Vencidas" },
  { id: "pagadas", titulo: "Pagadas" },
];

/** Una factura está vencida si pasó su fecha de vencimiento y no se ha pagado. */
function estaVencida(f: Factura) {
  return f.estadoCobro !== "pagada" && !!f.vencimiento && diasDesde(f.vencimiento) > 0;
}

/**
 * Un estado de pago al que le falta su factura. No depende de que exista una
 * orden de compra: sin OC el EP también espera factura, y la falta de la OC no
 * puede esconderlo. Un EP rechazado no se factura.
 */
const sinFacturar = (c: Ciclo) => c.estado !== "rechazado" && !c.facturaId;

const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

type Datos = { facturas: Factura[]; contratos: ContratoBreve[]; ciclos: Ciclo[] };

async function cargar(): Promise<Datos> {
  const [facturas, contratos, ciclos] = await Promise.all([cargarFacturas(), cargarContratosBreve(), cargarCiclo()]);
  return { facturas, contratos, ciclos };
}

export function VistaFacturas() {
  const usuario = useUsuario();
  const { estado, recargar } = useConsulta<Datos>(cargar, `${usuario.id}:${usuario.empresa}:facturas-v2`);
  const edicion = useEdicion<Factura>("facturas");

  return (
    <>
      <Encabezado
        titulo="Facturas emitidas"
        descripcion="Cada factura nace de una orden de compra, y esa orden de un estado de pago aprobado: por eso se emiten desde Estado de Pago y acá se consultan. De este listado sale la facturación mensual del Dashboard, y también cuánto está pendiente de cobro y hace cuántos días."
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos.facturas} ciclos={datos.ciclos} contratos={datos.contratos} edicion={edicion} />
            {edicion.editando && (
              <FormularioFactura
                factura={edicion.registro}
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
          tabla="facturas"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="facturas"
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
  filas: todas,
  ciclos,
  contratos,
  edicion,
}: {
  filas: Factura[];
  ciclos: Ciclo[];
  contratos: ContratoBreve[];
  edicion: ReturnType<typeof useEdicion<Factura>>;
}) {
  const [filtro, setFiltro] = useFiltro<Filtrado>("facturas:estado", "todas");
  const [periodo, setPeriodo] = useFiltro("facturas:periodo", "todos");
  const [contrato, setContrato] = useFiltro("facturas:contrato", "todos");
  const [texto, setTexto] = useState("");

  const meses = useMemo(
    () =>
      [...new Set([
        ...todas.map((f) => primeroDelMes(f.fechaEmision)),
        ...ciclos.filter(sinFacturar).map((c) => primeroDelMes(c.periodo)),
      ])].sort().reverse().map((m) => ({ id: m, titulo: mesLargo(m) })),
    [todas, ciclos],
  );
  /* Un anexo se controla como un contrato aparte: la unidad de una factura sale de los EP que cubre. */
  const cubiertas = useMemo(() => unidadesCubiertas(ciclos, "facturaId"), [ciclos]);
  const opcionesContrato = useMemo(() => opcionesDeCiclos(contratos, ciclos), [contratos, ciclos]);
  const nombreUnidad = useMemo(() => new Map(opcionesContrato.map((o) => [o.id, o.titulo])), [opcionesContrato]);
  const anexoDe = (f: Factura) => {
    const ids = [...(cubiertas.get(f.id) ?? [])].filter((u) => u.includes("#"));
    return ids.length > 0 ? ids.map((u) => nombreUnidad.get(u) ?? u).join(" · ") : null;
  };

  // Período y contrato recortan las facturas y también lo que falta por facturar.
  const delRecorte = useMemo(
    () => todas.filter((f) => (periodo === "todos" || primeroDelMes(f.fechaEmision) === periodo) && esDeLaUnidad(cubiertas, f.id, f.contratoId, contrato)),
    [todas, cubiertas, periodo, contrato],
  );
  const faltantes = useMemo(
    () => ciclos.filter((c) => sinFacturar(c) && (periodo === "todos" || primeroDelMes(c.periodo) === periodo) && (contrato === "todos" || c.unidadId === contrato)),
    [ciclos, periodo, contrato],
  );

  // El estado y la búsqueda recortan además la lista; las tarjetas siguen todo.
  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return delRecorte.filter((f) => {
      if (filtro === "pagadas" && f.estadoCobro !== "pagada") return false;
      if (filtro === "pendientes" && f.estadoCobro === "pagada") return false;
      if (filtro === "vencidas" && !estaVencida(f)) return false;
      if (buscado && !`${f.id} ${f.contrato} ${f.contratoId} ${f.cliente} ${f.edps.join(" ")}`.toLowerCase().includes(buscado)) return false;
      return true;
    });
  }, [delRecorte, filtro, texto]);

  const neto = visibles.reduce((t, f) => t + f.neto, 0);
  const total = visibles.reduce((t, f) => t + f.total, 0);

  const porCobrar = visibles.filter((f) => f.estadoCobro !== "pagada");
  const montoPorCobrar = porCobrar.reduce((t, f) => t + f.total, 0);
  const vencidas = visibles.filter(estaVencida);
  const montoVencido = vencidas.reduce((t, f) => t + f.total, 0);
  const montoFaltante = faltantes.reduce((t, c) => t + c.montoNeto, 0);
  const sinOrden = faltantes.filter((c) => !c.ordenId).length;

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Facturado",
            valor: formatearMonto(visibles.reduce((t, f) => t + f.neto, 0)),
            nota: `${visibles.length} ${visibles.length === 1 ? "factura" : "facturas"}, monto neto`,
          },
          {
            etiqueta: "Por cobrar",
            valor: formatearMonto(montoPorCobrar),
            nota: `${porCobrar.length} facturas con IVA incluido`,
            acento: montoPorCobrar > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Vencido",
            valor: formatearMonto(montoVencido),
            nota:
              vencidas.length === 0
                ? "Ninguna factura pasada de plazo"
                : `${vencidas.length} ${vencidas.length === 1 ? "factura" : "facturas"} pasadas de plazo`,
            acento: montoVencido > 0 ? "critico" : "bueno",
          },
          {
            etiqueta: "Pendiente de facturar",
            valor: formatearMonto(montoFaltante),
            nota: `${faltantes.length} ${faltantes.length === 1 ? "estado de pago sin factura" : "estados de pago sin factura"}${sinOrden > 0 ? ` · ${sinOrden} ni siquiera con orden` : ""} (neto)`,
            acento: faltantes.length > 0 ? "aviso" : "bueno",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${todas.length} facturas · las tarjetas siguen los filtros`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Período">
              <Desplegable
                etiqueta="Período"
                valor={periodo}
                alCambiar={setPeriodo}
                grupos={[{ opciones: [{ id: "todos", titulo: "Todos los meses" }] }, { titulo: "Un mes", opciones: meses }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Contrato">
              <Desplegable
                etiqueta="Contrato"
                valor={contrato}
                alCambiar={setContrato}
                grupos={[{ opciones: [{ id: "todos", titulo: "Todos los contratos" }, ...opcionesContrato] }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Estatus">
              <Filtro etiqueta="Estatus" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
            </CampoFiltro>
            <CampoFiltro etiqueta="Buscar">
              <input
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Folio, EP, contrato o cliente…"
                aria-label="Buscar facturas"
                className="w-56 rounded-full border border-mist-deep bg-white px-4 py-2 text-xs text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
              />
            </CampoFiltro>
          </>
        }
      >
        <Tabla
          columnas={columnas(edicion, anexoDe)}
          filas={visibles}
          claveDe={(f) => f.id}
          vacio={todas.length === 0 ? "Todavía no hay facturas emitidas." : "Ninguna factura con estos filtros."}
          pie={
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearMonto(neto)}</Total>
              <Total derecha>{formatearMonto(total)}</Total>
              <Total colSpan={4} />
            </>
          }
        />
      </Panel>

      {faltantes.length > 0 && (
        <div className="mt-6">
          <Panel
            titulo="Estados de pago sin factura"
            nota="Salen de los estados de pago, no de las órdenes: un EP sin orden de compra también aparece acá."
          >
            <Tabla
              columnas={columnasFaltantes}
              filas={faltantes}
              claveDe={(c) => c.id}
              vacio="Nada por facturar."
              pie={
                <>
                  <Total colSpan={3}>Total</Total>
                  <Total derecha>{formatearMonto(montoFaltante)}</Total>
                  <Total />
                </>
              }
            />
          </Panel>
        </div>
      )}
    </>
  );
}

const columnasFaltantes: Columna<Ciclo>[] = [
  {
    clave: "ep",
    titulo: "Estado de pago",
    encabezado: true,
    celda: (c) => (
      <>
        <span className="block font-semibold text-ink">{nombreEdp(c.numero, c.tipoEdp)}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{c.id}</span>
      </>
    ),
  },
  {
    clave: "contrato",
    titulo: "Contrato",
    celda: (c) => (
      <>
        <span className="block text-ink">{c.unidadNombre}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{c.anexoNombre ? `Anexo de ${c.contrato}` : c.contratoId} · {c.cliente}</span>
      </>
    ),
  },
  {
    clave: "periodo",
    titulo: "Período",
    celda: (c) => <span className="whitespace-nowrap text-ink-soft">{mesLargo(c.periodo)}</span>,
  },
  {
    clave: "monto",
    titulo: "Neto",
    derecha: true,
    celda: (c) => <span className="font-semibold text-ink">{formatearMonto(c.montoNeto)}</span>,
  },
  {
    clave: "orden",
    titulo: "Orden de compra",
    celda: (c) =>
      c.ordenId ? <span className="text-ink-soft">N° {c.ordenNumero}</span> : <Chip tono="aviso">Sin orden</Chip>,
  },
];

const columnas = (
  edicion: ReturnType<typeof useEdicion<Factura>>,
  anexoDe: (f: Factura) => string | null,
): Columna<Factura>[] => [
  {
    clave: "folio",
    titulo: "Folio",
    encabezado: true,
    celda: (f) => (
      <>
        <span className="block font-semibold text-ink">{f.id}</span>
        {f.edps.length > 0 && (
          <span className="mt-0.5 block text-xs text-ink-soft">{f.edps.join(" · ")}</span>
        )}
      </>
    ),
  },
  {
    clave: "contrato",
    titulo: "Contrato",
    celda: (f) => (
      <>
        <span className="block text-ink">{f.contrato}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {f.contratoId}{anexoDe(f) ? ` · Anexo: ${anexoDe(f)}` : ""} · {f.cliente}
        </span>
      </>
    ),
  },
  {
    clave: "emision",
    titulo: "Emisión",
    celda: (f) => (
      <span className="whitespace-nowrap text-ink-soft">{formatearFecha(f.fechaEmision)}</span>
    ),
  },
  {
    clave: "neto",
    titulo: "Neto",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearMonto(f.neto)}</span>,
  },
  {
    clave: "total",
    titulo: "Total",
    derecha: true,
    celda: (f) => <span className="font-semibold text-ink">{formatearMonto(f.total)}</span>,
  },
  {
    clave: "vencimiento",
    titulo: "Vencimiento",
    celda: (f) => (
      <span className="whitespace-nowrap text-ink-soft">{formatearFecha(f.vencimiento)}</span>
    ),
  },
  {
    clave: "mora",
    titulo: "Mora",
    derecha: true,
    celda: (f) => {
      if (!estaVencida(f) || !f.vencimiento) return <span className="text-ink-soft">—</span>;
      const dias = diasDesde(f.vencimiento);
      return <span className="font-semibold text-[#a52f24]">{dias} d</span>;
    },
  },
  {
    clave: "estado",
    titulo: "Cobro",
    celda: (f) => {
      const e = estaVencida(f) ? estados.vencida : estados[f.estadoCobro];
      return <Chip tono={e.tono}>{e.titulo}</Chip>;
    },
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (f) => (
      <AccionesFila
          permiso="gestion.editar"
        alEditar={() => edicion.abrirEdicion(f)}
        alVerHistorial={() => edicion.verHistorial(f.id, `${f.id} · ${f.contrato}`)}
        alVerAdjuntos={() => edicion.verAdjuntos(f.id, `${f.id} · ${f.contrato}`)}
        alVerRespaldo={() => edicion.abrirRespaldo(f.id, `${f.id} · ${f.contrato}`)}
        cuantosAdjuntos={edicion.cuantosAdjuntos(f.id)}
      />
    ),
  },
];
