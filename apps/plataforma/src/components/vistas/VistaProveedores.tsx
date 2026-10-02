"use client";

import { useMemo, useState } from "react";
import { FormularioProveedor } from "../formularios/FormularioProveedor";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, type Tono } from "../ui/Chip";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import {
  cargarProveedores,
  formatearRut,
  type EstadoProveedor,
  type Proveedor,
} from "@/lib/abastecimiento";

/**
 * El maestro de proveedores.
 *
 * Existe por una razón concreta: hasta ahora el proveedor era texto libre en
 * cada compra, así que "Sodimac", "SODIMAC S.A." y "sodimac antofagasta" eran
 * tres proveedores distintos para la base y no había forma de sumar cuánto se le
 * compró a nadie. Con el RUT como identidad, eso se puede.
 */

const estados: Record<EstadoProveedor, { titulo: string; tono: Tono }> = {
  activo: { titulo: "Activo", tono: "bueno" },
  por_completar: { titulo: "Por completar", tono: "aviso" },
  suspendido: { titulo: "Suspendido", tono: "critico" },
  inactivo: { titulo: "Inactivo", tono: "neutro" },
};

type Filtrado = "todos" | "activos" | "por_completar" | "inactivos";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "activos", titulo: "Activos" },
  { id: "por_completar", titulo: "Por completar" },
  { id: "inactivos", titulo: "Inactivos" },
];

/** Qué le falta a una ficha para servir el día que haya que pagarle. */
function faltantes(p: Proveedor) {
  const falta: string[] = [];
  if (!p.rut) falta.push("RUT");
  if (!p.correo) falta.push("correo");
  if (!p.telefono && !p.contacto) falta.push("contacto");
  if (!p.numeroCuenta) falta.push("cuenta bancaria");
  return falta;
}

export function VistaProveedores() {
  const { estado, recargar } = useConsulta<Proveedor[]>(cargarProveedores);
  const edicion = useEdicion<Proveedor>("proveedores");

  return (
    <>
      <Encabezado
        titulo="Proveedores"
        descripcion="A quién le compramos. El RUT es la identidad: el nombre cambia, el RUT no. De acá salen el gasto por proveedor y las condiciones con que se paga cada factura."
        acciones={<BotonNuevo permiso="proveedores.editar" onClick={edicion.abrirNuevo}>Nuevo proveedor</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos} edicion={edicion} />
            {edicion.editando && (
              <FormularioProveedor
                proveedor={edicion.registro}
                proveedores={datos}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial
          tabla="proveedores"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="proveedores"
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
  filas: Proveedor[];
  edicion: ReturnType<typeof useEdicion<Proveedor>>;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todos");

  const visibles = useMemo(() => {
    if (filtro === "activos") return filas.filter((p) => p.estado === "activo");
    if (filtro === "por_completar") return filas.filter((p) => p.estado === "por_completar");
    if (filtro === "inactivos")
      return filas.filter((p) => p.estado === "inactivo" || p.estado === "suspendido");
    return filas;
  }, [filas, filtro]);

  const incompletos = filas.filter((p) => faltantes(p).length > 0);
  const conCuenta = filas.filter((p) => p.numeroCuenta).length;
  const conRut = filas.filter((p) => p.rut).length;

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Todavía no hay proveedores cargados
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Carga los que uses habitualmente y quedarán disponibles al emitir una orden
          de compra. No hace falta completarlos de una vez: con el RUT y la razón
          social basta para empezar.
        </p>
      </div>
    );
  }

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Proveedores",
            valor: String(filas.length),
            nota: `${filas.filter((p) => p.estado === "activo").length} activos`,
          },
          {
            etiqueta: "Fichas incompletas",
            valor: String(incompletos.length),
            nota: incompletos.length === 0 ? "Todas completas" : "Les falta un dato para pagar",
            acento: incompletos.length > 0 ? "aviso" : "bueno",
          },
          {
            etiqueta: "Con RUT",
            valor: String(conRut),
            nota: `${conCuenta} con datos bancarios`,
          },
          {
            etiqueta: "Rubros distintos",
            valor: String(new Set(filas.flatMap((p) => p.rubros)).size),
            nota: "Para saber a quién cotizar",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${filas.length} proveedores`}
        filtros={
          <Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
        }
      >
        <Tabla
          columnas={columnas(edicion)}
          filas={visibles}
          claveDe={(p) => p.id}
          vacio="Ningún proveedor en este estado."
        />
      </Panel>
    </>
  );
}

const columnas = (edicion: ReturnType<typeof useEdicion<Proveedor>>): Columna<Proveedor>[] => [
  {
    clave: "proveedor",
    titulo: "Proveedor",
    encabezado: true,
    celda: (p) => (
      <>
        <span className="block font-semibold text-ink">{p.razonSocial}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          <span className={p.rut ? "" : "text-[#8a5a09]"}>{formatearRut(p.rut)}</span>
          {p.nombreFantasia ? ` · ${p.nombreFantasia}` : ""}
        </span>
      </>
    ),
  },
  {
    clave: "rubros",
    titulo: "Rubros",
    celda: (p) =>
      p.rubros.length > 0 ? (
        <span className="text-ink-soft">{p.rubros.join(" · ")}</span>
      ) : (
        <span className="text-ink-soft">—</span>
      ),
  },
  {
    clave: "contacto",
    titulo: "Contacto",
    celda: (p) => (
      <>
        <span className="block text-ink">{p.contacto || "—"}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{p.correo || p.telefono || ""}</span>
      </>
    ),
  },
  {
    clave: "pago",
    titulo: "Pago",
    celda: (p) => (
      <>
        <span className="block text-ink-soft">{p.condicionPago}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {p.numeroCuenta ? `${p.banco ?? "Banco"} · ${p.numeroCuenta}` : "Sin datos bancarios"}
        </span>
      </>
    ),
  },
  {
    clave: "estado",
    titulo: "Estado",
    celda: (p) => {
      const falta = faltantes(p);
      return (
        <>
          <Chip tono={estados[p.estado].tono}>{estados[p.estado].titulo}</Chip>
          {falta.length > 0 && (
            <span className="mt-1 block text-xs text-ink-soft">Falta {falta.join(", ")}</span>
          )}
        </>
      );
    },
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (p) => (
      <AccionesFila
          permiso="proveedores.editar"
        alEditar={() => edicion.abrirEdicion(p)}
        alVerHistorial={() => edicion.verHistorial(p.id, p.razonSocial)}
        alVerAdjuntos={() => edicion.verAdjuntos(p.id, p.razonSocial)}
        cuantosAdjuntos={edicion.cuantosAdjuntos(p.id)}
      />
    ),
  },
];
