"use client";

import { useMemo, useState } from "react";
import { Chip, type Tono } from "../ui/Chip";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { FormularioFactura } from "../formularios/FormularioFactura";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, DialogoHistorial, useEdicion } from "../ui/Historial";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { diasDesde, formatearFecha, formatearMonto } from "@/lib/formato";
import { cargarFacturas, type EstadoCobro, type Factura } from "@/lib/ingresos";

const estados: Record<EstadoCobro, { titulo: string; tono: Tono }> = {
  emitida: { titulo: "Emitida", tono: "info" },
  enviada: { titulo: "Enviada", tono: "aviso" },
  pagada: { titulo: "Pagada", tono: "bueno" },
  vencida: { titulo: "Vencida", tono: "critico" },
};

type Filtrado = "todas" | "pendientes" | "pagadas";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "pendientes", titulo: "Por cobrar" },
  { id: "pagadas", titulo: "Pagadas" },
];

/** Una factura está vencida si pasó su fecha de vencimiento y no se ha pagado. */
function estaVencida(f: Factura) {
  return f.estadoCobro !== "pagada" && !!f.vencimiento && diasDesde(f.vencimiento) > 0;
}

type Datos = { facturas: Factura[]; contratos: ContratoBreve[] };

async function cargar(): Promise<Datos> {
  const [facturas, contratos] = await Promise.all([cargarFacturas(), cargarContratosBreve()]);
  return { facturas, contratos };
}

export function VistaFacturas() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
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
            <Contenidos filas={datos.facturas} edicion={edicion} />
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
  filas,
  edicion,
}: {
  filas: Factura[];
  edicion: ReturnType<typeof useEdicion<Factura>>;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todas");

  const visibles = useMemo(() => {
    if (filtro === "pagadas") return filas.filter((f) => f.estadoCobro === "pagada");
    if (filtro === "pendientes") return filas.filter((f) => f.estadoCobro !== "pagada");
    return filas;
  }, [filas, filtro]);

  const neto = visibles.reduce((t, f) => t + f.neto, 0);
  const total = visibles.reduce((t, f) => t + f.total, 0);

  const porCobrar = filas.filter((f) => f.estadoCobro !== "pagada");
  const montoPorCobrar = porCobrar.reduce((t, f) => t + f.total, 0);
  const vencidas = filas.filter(estaVencida);
  const montoVencido = vencidas.reduce((t, f) => t + f.total, 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Facturado en el año",
            valor: formatearMonto(filas.reduce((t, f) => t + f.neto, 0)),
            nota: `${filas.length} facturas, monto neto`,
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
            etiqueta: "IVA del período",
            valor: formatearMonto(filas.reduce((t, f) => t + f.iva, 0)),
            nota: "Débito fiscal de lo emitido",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${filas.length} facturas`}
        filtros={
          <Filtro etiqueta="Cobro" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
        }
      >
        <Tabla
          columnas={columnas(edicion)}
          filas={visibles}
          claveDe={(f) => f.id}
          vacio="Ninguna factura en este estado."
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
    </>
  );
}

const columnas = (edicion: ReturnType<typeof useEdicion<Factura>>): Columna<Factura>[] => [
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
          {f.contratoId} · {f.cliente}
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
        cuantosAdjuntos={edicion.cuantosAdjuntos(f.id)}
      />
    ),
  },
];
