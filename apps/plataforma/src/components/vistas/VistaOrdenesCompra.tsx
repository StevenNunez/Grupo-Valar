"use client";

import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { Chip, type Tono } from "../ui/Chip";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { FormularioOrdenCompra } from "../formularios/FormularioOrdenCompra";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, DialogoHistorial, useEdicion } from "../ui/Historial";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha, formatearMonto, mesLargo } from "@/lib/formato";
import { cargarCiclo, cargarOrdenesCompra, type Ciclo, type EstadoOC, type OrdenCompra } from "@/lib/ingresos";
import { useUsuario } from "@/lib/sesion";
import { esDeLaUnidad, opcionesDeCiclos, unidadesCubiertas } from "@/lib/unidades";

const estados: Record<EstadoOC, { titulo: string; tono: Tono }> = {
  vigente: { titulo: "Vigente", tono: "bueno" },
  consumida: { titulo: "Consumida", tono: "neutro" },
  vencida: { titulo: "Vencida", tono: "critico" },
};

type Datos = { ocs: OrdenCompra[]; contratos: ContratoBreve[]; ciclos: Ciclo[] };

async function cargar(): Promise<Datos> {
  const [ocs, contratos, ciclos] = await Promise.all([cargarOrdenesCompra(), cargarContratosBreve(), cargarCiclo()]);
  return { ocs, contratos, ciclos };
}

/** Qué pasó con una OC después de autorizarse: lo facturado, lo cobrado y lo que falta. Todo neto. */
type Cobranza = { facturado: number; pagado: number; pendientePago: number; porFacturar: number; facturas: number };
const sinCobranza: Cobranza = { facturado: 0, pagado: 0, pendientePago: 0, porFacturar: 0, facturas: 0 };

/**
 * Sale de los estados de pago que cubre cada OC. Una factura puede cubrir varios
 * EP: se cuenta una sola vez. Un EP rechazado no espera factura.
 */
function cobranzaPorOrden(ciclos: Ciclo[]): Map<string, Cobranza> {
  const salida = new Map<string, Cobranza>();
  const vistas = new Set<string>();
  for (const c of ciclos) {
    if (!c.ordenId || c.estado === "rechazado") continue;
    const k = salida.get(c.ordenId) ?? { ...sinCobranza };
    if (!c.facturaId) k.porFacturar += c.montoNeto;
    else if (!vistas.has(c.ordenId + "|" + c.facturaId)) {
      vistas.add(c.ordenId + "|" + c.facturaId);
      const neto = c.facturaNeto ?? 0;
      k.facturado += neto;
      k.facturas += 1;
      if (c.estadoCobro === "pagada") k.pagado += neto;
    }
    k.pendientePago = k.facturado - k.pagado;
    salida.set(c.ordenId, k);
  }
  return salida;
}

type Filtrado = "todas" | "vigente" | "consumida" | "vencida" | "porFacturar" | "porCobrar" | "pagadas";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "vigente", titulo: "Vigentes" },
  { id: "consumida", titulo: "Consumidas" },
  { id: "vencida", titulo: "Vencidas" },
  { id: "porFacturar", titulo: "Por facturar" },
  { id: "porCobrar", titulo: "Por cobrar" },
  { id: "pagadas", titulo: "Pagadas" },
];

const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

export function VistaOrdenesCompra() {
  const usuario = useUsuario();
  const { estado, recargar } = useConsulta<Datos>(cargar, `${usuario.id}:${usuario.empresa}:ordenes-compra-v2`);
  const edicion = useEdicion<OrdenCompra>("ordenes_compra");

  return (
    <>
      <Encabezado
        titulo="Órdenes de Compra"
        descripcion="Lo que cada mandante autorizó y cuándo se le cobra. Acá se consultan y se corrigen; las órdenes se cargan desde Estado de Pago, que es de donde nacen. Una orden puede cubrir varios estados de pago (el ordinario y el extraordinario del mes): el consumo es la suma de los que cubre."
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos.ocs} ciclos={datos.ciclos} contratos={datos.contratos} edicion={edicion} />
            {edicion.editando && (
              <FormularioOrdenCompra
                orden={edicion.registro}
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
          tabla="ordenes_compra"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="ordenes_compra"
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
  filas: OrdenCompra[];
  ciclos: Ciclo[];
  contratos: ContratoBreve[];
  edicion: ReturnType<typeof useEdicion<OrdenCompra>>;
}) {
  const [filtro, setFiltro] = useFiltro<Filtrado>("ordenes-de-compra:estado", "todas");
  const [periodo, setPeriodo] = useFiltro("ordenes-de-compra:periodo", "todos");
  const [contrato, setContrato] = useFiltro("ordenes-de-compra:contrato", "todos");
  const [texto, setTexto] = useState("");

  const cobranzas = useMemo(() => cobranzaPorOrden(ciclos), [ciclos]);
  const de = (f: OrdenCompra) => cobranzas.get(f.id) ?? sinCobranza;

  const meses = useMemo(
    () => [...new Set(todas.map((f) => primeroDelMes(f.fechaEmision)))].sort().reverse().map((m) => ({ id: m, titulo: mesLargo(m) })),
    [todas],
  );
  /* Un anexo se controla como un contrato aparte: la unidad de una orden sale de los EP que cubre. */
  const cubiertas = useMemo(() => unidadesCubiertas(ciclos, "ordenId"), [ciclos]);
  const opcionesContrato = useMemo(() => opcionesDeCiclos(contratos, ciclos), [contratos, ciclos]);
  const nombreUnidad = useMemo(() => new Map(opcionesContrato.map((o) => [o.id, o.titulo])), [opcionesContrato]);
  /** El anexo de la orden, si la orden es de un anexo. */
  const anexoDe = (f: OrdenCompra) => {
    const ids = [...(cubiertas.get(f.id) ?? [])].filter((u) => u.includes("#"));
    return ids.length > 0 ? ids.map((u) => nombreUnidad.get(u) ?? u).join(" · ") : null;
  };

  // Período, contrato, estado y búsqueda recortan lo mismo: tarjetas, tabla y totales.
  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return todas.filter((f) => {
      if (periodo !== "todos" && primeroDelMes(f.fechaEmision) !== periodo) return false;
      if (!esDeLaUnidad(cubiertas, f.id, f.contratoId, contrato)) return false;
      const k = cobranzas.get(f.id) ?? sinCobranza;
      if (filtro === "vigente" || filtro === "consumida" || filtro === "vencida") {
        if (f.estado !== filtro) return false;
      } else if (filtro === "porFacturar") {
        if (k.porFacturar <= 0) return false;
      } else if (filtro === "porCobrar") {
        if (k.pendientePago <= 0) return false;
      } else if (filtro === "pagadas") {
        if (!(k.facturado > 0 && k.pendientePago <= 0 && k.porFacturar <= 0)) return false;
      }
      if (buscado && !`${f.numero} ${f.id} ${f.mandante} ${f.contrato} ${f.contratoId} ${f.edps.join(" ")}`.toLowerCase().includes(buscado)) return false;
      return true;
    });
  }, [todas, cobranzas, cubiertas, filtro, periodo, contrato, texto]);

  const filas = visibles;
  const autorizado = filas.reduce((t, f) => t + f.montoAutorizado, 0);
  const consumido = filas.reduce((t, f) => t + f.consumido, 0);
  const saldo = autorizado - consumido;
  const pagado = filas.reduce((t, f) => t + de(f).pagado, 0);
  const pendientePago = filas.reduce((t, f) => t + de(f).pendientePago, 0);
  const porFacturar = filas.reduce((t, f) => t + de(f).porFacturar, 0);
  const conPendientePago = filas.filter((f) => de(f).pendientePago > 0).length;
  const conPorFacturar = filas.filter((f) => de(f).porFacturar > 0).length;

  // Una OC con más del 85% consumido conviene ampliarla antes de que frene la
  // facturación del mes siguiente.
  const porAmpliar = filas.filter(
    (f) =>
      f.estado === "vigente" && f.montoAutorizado > 0 && f.consumido / f.montoAutorizado > 0.85,
  ).length;

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Autorizado",
            valor: formatearMonto(autorizado),
            nota: `${filas.length} ${filas.length === 1 ? "orden" : "órdenes"} · consumido ${formatearMonto(consumido)} (${autorizado > 0 ? ((consumido / autorizado) * 100).toFixed(0) : 0}%)${porAmpliar > 0 ? ` · ${porAmpliar} sobre el 85%` : ""}`,
          },
          {
            etiqueta: "Pagado",
            valor: formatearMonto(pagado),
            nota: "Facturas ya cobradas (neto)",
            acento: pagado > 0 ? "bueno" : undefined,
          },
          {
            etiqueta: "Pendiente de pago",
            valor: formatearMonto(pendientePago),
            nota: `${conPendientePago} ${conPendientePago === 1 ? "orden con factura por cobrar" : "órdenes con facturas por cobrar"} (neto)`,
            acento: pendientePago > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Pendiente de facturación",
            valor: formatearMonto(porFacturar),
            nota: `${conPorFacturar} ${conPorFacturar === 1 ? "orden con EP sin factura" : "órdenes con EP sin factura"} (neto)`,
            acento: porFacturar > 0 ? "aviso" : undefined,
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${todas.length} ${todas.length === 1 ? "orden de compra" : "órdenes de compra"} · las tarjetas siguen los filtros`}
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
                placeholder="N° de OC, mandante o EP…"
                aria-label="Buscar órdenes de compra"
                className="w-56 rounded-full border border-mist-deep bg-white px-4 py-2 text-xs text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
              />
            </CampoFiltro>
          </>
        }
      >
        <Tabla
          columnas={columnas(edicion, de, anexoDe)}
          filas={visibles}
          claveDe={(f) => f.id}
          vacio={todas.length === 0 ? "Todavía no hay órdenes de compra cargadas." : "Ninguna orden de compra con estos filtros."}
          pie={
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearMonto(autorizado)}</Total>
              <Total derecha>{formatearMonto(consumido)}</Total>
              <Total derecha>{formatearMonto(saldo)}</Total>
              <Total colSpan={4} />
            </>
          }
        />
      </Panel>
    </>
  );
}

const columnas = (
  edicion: ReturnType<typeof useEdicion<OrdenCompra>>,
  de: (f: OrdenCompra) => Cobranza,
  anexoDe: (f: OrdenCompra) => string | null,
): Columna<OrdenCompra>[] => [
  {
    clave: "oc",
    titulo: "OC",
    encabezado: true,
    celda: (f) => (
      <>
        <span className="block font-semibold text-ink">N° {f.numero}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{f.mandante}</span>
        {f.edps.length > 0 && <span className="mt-0.5 block text-xs text-ink-soft">{f.edps.join(" · ")}</span>}
      </>
    ),
  },
  {
    clave: "contrato",
    titulo: "Contrato",
    celda: (f) => (
      <>
        <span className="block text-ink">{f.contrato}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{f.contratoId}{anexoDe(f) ? ` · Anexo: ${anexoDe(f)}` : ""}</span>
      </>
    ),
  },
  {
    clave: "avance",
    titulo: "Consumo",
    ancho: "w-40",
    celda: (f) => {
      const porcentaje = f.montoAutorizado > 0 ? (f.consumido / f.montoAutorizado) * 100 : 0;
      const apretado = porcentaje > 85;
      return (
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist">
            <span
              style={{ width: `${Math.min(porcentaje, 100)}%` }}
              className={`block h-full rounded-full ${apretado ? "bg-[#8a5a09]" : "bg-cyan-deep"}`}
            />
          </span>
          <span
            className={`w-9 shrink-0 text-right font-semibold tabular-nums ${
              apretado ? "text-[#8a5a09]" : "text-ink"
            }`}
          >
            {porcentaje.toFixed(0)}%
          </span>
        </div>
      );
    },
  },
  {
    clave: "autorizado",
    titulo: "Autorizado",
    derecha: true,
    celda: (f) => (
      <span className="font-semibold text-ink">{formatearMonto(f.montoAutorizado)}</span>
    ),
  },
  {
    clave: "consumido",
    titulo: "Consumido",
    derecha: true,
    celda: (f) => <span className="text-ink-soft">{formatearMonto(f.consumido)}</span>,
  },
  {
    clave: "saldo",
    titulo: "Saldo",
    derecha: true,
    celda: (f) => (
      <span className="text-ink-soft">{formatearMonto(f.montoAutorizado - f.consumido)}</span>
    ),
  },
  {
    clave: "cobranza",
    titulo: "Facturación y pago",
    celda: (f) => {
      const k = de(f);
      return (
        <>
          <span className="block whitespace-nowrap text-xs text-ink-soft">Pagado {formatearMonto(k.pagado)}</span>
          <span className={`block whitespace-nowrap text-xs ${k.pendientePago > 0 ? "font-semibold text-[#8a5a09]" : "text-ink-soft"}`}>
            Por cobrar {formatearMonto(k.pendientePago)}
          </span>
          <span className={`block whitespace-nowrap text-xs ${k.porFacturar > 0 ? "font-semibold text-[#8a5a09]" : "text-ink-soft"}`}>
            Sin facturar {formatearMonto(k.porFacturar)}
          </span>
        </>
      );
    },
  },
  {
    clave: "estado",
    titulo: "Estado",
    celda: (f) => <Chip tono={estados[f.estado].tono}>{estados[f.estado].titulo}</Chip>,
  },
  {
    clave: "cobro",
    titulo: "Cobro",
    celda: (f) => (
      <>
        <span className="block whitespace-nowrap text-ink-soft">{formatearFecha(f.fechaCobro)}</span>
        {f.formaPago && <span className="mt-0.5 block text-xs text-ink-soft">{f.formaPago === "contado" ? "Al contado" : "A crédito"}</span>}
      </>
    ),
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (f) => (
      <AccionesFila
          permiso="gestion.editar"
        alEditar={() => edicion.abrirEdicion(f)}
        alVerHistorial={() => edicion.verHistorial(f.id, `${f.id} · N° ${f.numero}`)}
        alVerAdjuntos={() => edicion.verAdjuntos(f.id, `${f.id} · N° ${f.numero}`)}
        cuantosAdjuntos={edicion.cuantosAdjuntos(f.id)}
      />
    ),
  },
];
