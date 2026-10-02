"use client";

import { Chip, type Tono } from "../ui/Chip";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Panel, Resumen } from "../ui/Vista";
import { FormularioOrdenCompra } from "../formularios/FormularioOrdenCompra";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, DialogoHistorial, useEdicion } from "../ui/Historial";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha, formatearMonto } from "@/lib/formato";
import { cargarOrdenesCompra, type EstadoOC, type OrdenCompra } from "@/lib/ingresos";

const estados: Record<EstadoOC, { titulo: string; tono: Tono }> = {
  vigente: { titulo: "Vigente", tono: "bueno" },
  consumida: { titulo: "Consumida", tono: "neutro" },
  vencida: { titulo: "Vencida", tono: "critico" },
};

type Datos = { ocs: OrdenCompra[]; contratos: ContratoBreve[] };

async function cargar(): Promise<Datos> {
  const [ocs, contratos] = await Promise.all([cargarOrdenesCompra(), cargarContratosBreve()]);
  return { ocs, contratos };
}

export function VistaOrdenesCompra() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const edicion = useEdicion<OrdenCompra>("ordenes_compra");

  return (
    <>
      <Encabezado
        titulo="Órdenes de Compra"
        descripcion="Lo que cada mandante autorizó. Acá se consultan y se corrigen; las órdenes se cargan desde Estado de Pago, que es de donde nacen. El consumo es la suma de los estados de pago presentados contra ese contrato: cuando se acerca al monto autorizado, hay que pedir ampliación antes de seguir facturando."
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos.ocs} edicion={edicion} />
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
  filas,
  edicion,
}: {
  filas: OrdenCompra[];
  edicion: ReturnType<typeof useEdicion<OrdenCompra>>;
}) {
  const autorizado = filas.reduce((t, f) => t + f.montoAutorizado, 0);
  const consumido = filas.reduce((t, f) => t + f.consumido, 0);
  const saldo = autorizado - consumido;

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
            nota: `${filas.length} ${filas.length === 1 ? "orden" : "órdenes"} de compra`,
          },
          {
            etiqueta: "Consumido",
            valor: formatearMonto(consumido),
            nota: `${autorizado > 0 ? ((consumido / autorizado) * 100).toFixed(0) : 0}% del total autorizado`,
          },
          {
            etiqueta: "Saldo disponible",
            valor: formatearMonto(saldo),
            nota: "Lo que todavía se puede presentar",
          },
          {
            etiqueta: "Por ampliar",
            valor: String(porAmpliar),
            nota: porAmpliar === 0 ? "Ninguna sobre el 85%" : "Sobre el 85% consumido",
            acento: porAmpliar > 0 ? "aviso" : undefined,
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${filas.length} ${filas.length === 1 ? "orden de compra" : "órdenes de compra"}`}
      >
        <Tabla
          columnas={columnas(edicion)}
          filas={filas}
          claveDe={(f) => f.id}
          vacio="Todavía no hay órdenes de compra cargadas."
          pie={
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearMonto(autorizado)}</Total>
              <Total derecha>{formatearMonto(consumido)}</Total>
              <Total derecha>{formatearMonto(saldo)}</Total>
              <Total colSpan={3} />
            </>
          }
        />
      </Panel>
    </>
  );
}

const columnas = (edicion: ReturnType<typeof useEdicion<OrdenCompra>>): Columna<OrdenCompra>[] => [
  {
    clave: "oc",
    titulo: "OC",
    encabezado: true,
    celda: (f) => (
      <>
        <span className="block font-semibold text-ink">N° {f.numero}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{f.mandante}</span>
      </>
    ),
  },
  {
    clave: "contrato",
    titulo: "Contrato",
    celda: (f) => (
      <>
        <span className="block text-ink">{f.contrato}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{f.contratoId}</span>
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
    clave: "estado",
    titulo: "Estado",
    celda: (f) => <Chip tono={estados[f.estado].tono}>{estados[f.estado].titulo}</Chip>,
  },
  {
    clave: "vigencia",
    titulo: "Vigencia",
    celda: (f) => (
      <span className="whitespace-nowrap text-ink-soft">{formatearFecha(f.vigencia)}</span>
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
