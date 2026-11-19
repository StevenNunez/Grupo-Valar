"use client";

import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { FormularioProveedor } from "../formularios/FormularioProveedor";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, type Tono } from "../ui/Chip";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { useListaServidor, useRetardado } from "@/lib/lista-servidor";
import { useUsuario } from "@/lib/sesion";
import {
  cargarPaginaProveedores,
  cargarResumenProveedores,
  formatearRut,
  type EstadoProveedor,
  type FiltradoProveedores,
  type FiltrosProveedores,
  type OrdenProveedores,
  type Proveedor,
  type ResumenProveedores,
} from "@/lib/abastecimiento";

/**
 * El maestro de proveedores.
 *
 * Existe por una razón concreta: hasta ahora el proveedor era texto libre en
 * cada compra, así que "Sodimac", "SODIMAC S.A." y "sodimac antofagasta" eran
 * tres proveedores distintos para la base y no había forma de sumar cuánto se le
 * compró a nadie. Con el RUT como identidad, eso se puede.
 *
 * La lista va por partes (19-11-2026): ya son muchos y bajarlos todos para
 * mostrar una tabla eterna no servía. Abre con 50, y el buscador, el estado, el
 * rubro y el orden se resuelven en la base; las cifras de arriba van aparte.
 */

const estados: Record<EstadoProveedor, { titulo: string; tono: Tono }> = {
  activo: { titulo: "Activo", tono: "bueno" },
  por_completar: { titulo: "Por completar", tono: "aviso" },
  suspendido: { titulo: "Suspendido", tono: "critico" },
  inactivo: { titulo: "Inactivo", tono: "neutro" },
};

const opciones: { id: FiltradoProveedores; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "activos", titulo: "Activos" },
  { id: "por_completar", titulo: "Por completar" },
  { id: "incompletos", titulo: "Ficha incompleta" },
  { id: "inactivos", titulo: "Inactivos" },
];

const opcionesOrden: { id: OrdenProveedores; titulo: string }[] = [
  { id: "nombre-asc", titulo: "Nombre A–Z" },
  { id: "nombre-desc", titulo: "Nombre Z–A" },
  { id: "recientes", titulo: "Últimos agregados" },
  { id: "codigo", titulo: "Por código (PRV)" },
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
  const usuario = useUsuario();
  const { estado, recargar: recargarResumen } = useConsulta<ResumenProveedores>(
    cargarResumenProveedores,
    `${usuario.id}:${usuario.empresa}:proveedores-resumen`,
  );
  const edicion = useEdicion<Proveedor>("proveedores");

  const [filtro, setFiltro] = useFiltro<FiltradoProveedores>("proveedores:estado", "todos");
  const [rubro, setRubro] = useFiltro("proveedores:rubro", "");
  const [orden, setOrden] = useFiltro<OrdenProveedores>("proveedores:orden", "nombre-asc");
  const [texto, setTexto] = useState("");
  const buscado = useRetardado(texto);

  const filtros = useMemo<FiltrosProveedores>(
    () => ({ estado: filtro, rubro, texto: buscado, orden }),
    [filtro, rubro, buscado, orden],
  );
  const lista = useListaServidor<Proveedor, FiltrosProveedores>({ traer: cargarPaginaProveedores, filtros });

  const recargar = () => {
    recargarResumen();
    lista.recargar();
  };

  return (
    <>
      <Encabezado
        titulo="Proveedores"
        descripcion="A quién le compramos. El RUT es la identidad: el nombre cambia, el RUT no. De acá salen el gasto por proveedor y las condiciones con que se paga cada factura."
        acciones={<BotonNuevo permiso="proveedores.editar" onClick={edicion.abrirNuevo}>Nuevo proveedor</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(resumen) => (
          <>
            {resumen.total === 0 ? (
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
            ) : (
              <Contenidos
                resumen={resumen}
                lista={lista}
                filtro={filtro}
                alFiltrar={setFiltro}
                rubro={rubro}
                alElegirRubro={setRubro}
                orden={orden}
                alOrdenar={setOrden}
                texto={texto}
                alBuscar={setTexto}
                edicion={edicion}
              />
            )}
            {edicion.editando && (
              <FormularioProveedor
                proveedor={edicion.registro}
                proveedores={resumen.ids}
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
  resumen,
  lista,
  filtro,
  alFiltrar,
  rubro,
  alElegirRubro,
  orden,
  alOrdenar,
  texto,
  alBuscar,
  edicion,
}: {
  resumen: ResumenProveedores;
  lista: ReturnType<typeof useListaServidor<Proveedor, FiltrosProveedores>>;
  filtro: FiltradoProveedores;
  alFiltrar: (f: FiltradoProveedores) => void;
  rubro: string;
  alElegirRubro: (r: string) => void;
  orden: OrdenProveedores;
  alOrdenar: (o: OrdenProveedores) => void;
  texto: string;
  alBuscar: (t: string) => void;
  edicion: ReturnType<typeof useEdicion<Proveedor>>;
}) {
  const hayFiltro = filtro !== "todos" || rubro !== "" || texto.trim() !== "";

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Proveedores",
            valor: String(resumen.total),
            nota: `${resumen.activos} activos`,
          },
          {
            etiqueta: "Fichas incompletas",
            valor: String(resumen.incompletos),
            nota: resumen.incompletos === 0 ? "Todas completas" : "Les falta un dato para pagar",
            acento: resumen.incompletos > 0 ? "aviso" : "bueno",
          },
          {
            etiqueta: "Con RUT",
            valor: String(resumen.conRut),
            nota: `${resumen.conCuenta} con datos bancarios`,
          },
          {
            etiqueta: "Rubros distintos",
            valor: String(resumen.rubros.length),
            nota: "Para saber a quién cotizar",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${lista.filas.length}${lista.hayMas ? "+" : ""} mostrados · ${resumen.total} en total`}
        filtrosAbajo
        filtros={<Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={alFiltrar} />}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-mist px-6 py-4 lg:px-8">
          <input
            type="search"
            value={texto}
            onChange={(e) => alBuscar(e.target.value)}
            placeholder="Buscar por nombre, fantasía, RUT, código, contacto o correo…"
            aria-label="Buscar proveedores"
            className="min-w-[16rem] flex-1 rounded-full border border-mist-deep bg-white px-4 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
          {resumen.rubros.length > 0 && (
            <select
              value={rubro}
              onChange={(e) => alElegirRubro(e.target.value)}
              aria-label="Rubro"
              className="max-w-[16rem] rounded-full border border-mist-deep bg-white px-4 py-2 text-sm font-semibold text-ink-soft"
            >
              <option value="">Todos los rubros</option>
              {resumen.rubros.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <select
            value={orden}
            onChange={(e) => alOrdenar(e.target.value as OrdenProveedores)}
            aria-label="Ordenar por"
            className="rounded-full border border-mist-deep bg-white px-4 py-2 text-sm font-semibold text-ink-soft"
          >
            {opcionesOrden.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titulo}
              </option>
            ))}
          </select>
          {hayFiltro && (
            <button
              type="button"
              onClick={() => {
                alBuscar("");
                alFiltrar("todos");
                alElegirRubro("");
              }}
              className="text-xs font-semibold text-cyan-deep underline-offset-2 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {lista.error ? (
          <p role="alert" className="px-6 py-10 text-center text-sm text-peligro lg:px-8">
            No se pudo cargar la lista: {lista.error}{" "}
            <button type="button" onClick={lista.recargar} className="font-semibold underline">
              Reintentar
            </button>
          </p>
        ) : lista.cargando && lista.filas.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-ink-soft lg:px-8">Cargando proveedores…</p>
        ) : (
          <Tabla
            columnas={columnas(edicion)}
            filas={lista.filas}
            claveDe={(p) => p.id}
            vacio={hayFiltro ? "Ningún proveedor calza con estos filtros." : "Ningún proveedor."}
          />
        )}

        {lista.hayMas && !lista.error && (
          <div className="flex justify-center border-t border-mist px-6 py-4">
            <button
              type="button"
              onClick={lista.cargarMas}
              disabled={lista.cargandoMas}
              className="rounded-full border border-mist-deep px-5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
            >
              {lista.cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
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
          <span className={p.rut ? "" : "text-alerta"}>{formatearRut(p.rut)}</span>
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
        alVerRespaldo={() => edicion.abrirRespaldo(p.id, p.razonSocial)}
        cuantosAdjuntos={edicion.cuantosAdjuntos(p.id)}
      />
    ),
  },
];
