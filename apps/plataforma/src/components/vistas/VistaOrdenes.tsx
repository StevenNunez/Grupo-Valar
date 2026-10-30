"use client";

import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { FormularioOrden } from "../formularios/FormularioOrden";
import { CicloOrden } from "../CicloOrden";
import { EnvioOrden, EstadoEnvio } from "../EnvioOrden";
import { OrdenImprimible } from "../OrdenImprimible";
import { BotonAdjuntos, DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, Etiqueta, type Tono } from "../ui/Chip";
import { Impresion } from "../ui/Impresion";
import { BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarProveedores, type Proveedor } from "@/lib/abastecimiento";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha, formatearMonto } from "@/lib/formato";
import {
  cargarEnvios,
  cargarDescuentoDeOrden,
  cargarFirmasDeOrden,
  cargarItemsDeOrden,
  cargarPaginaOrdenes,
  cargarResumenOrdenes,
  pagoDeOrden,
  type EnvioOrden as Envio,
  type EstadoOrden,
  type FiltrosOrdenes,
  type Item,
  type Orden,
  type OrdenDeLista,
  type ResumenOrdenes,
} from "@/lib/ordenes";
import { useListaServidor, useRetardado } from "@/lib/lista-servidor";
import { usePuede, useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

const estados: Record<EstadoOrden, { titulo: string; tono: Tono }> = {
  borrador: { titulo: "Borrador", tono: "neutro" },
  emitida: { titulo: "Emitida", tono: "info" },
  parcial: { titulo: "Recepción parcial", tono: "aviso" },
  recibida: { titulo: "Recibida", tono: "bueno" },
  cerrada: { titulo: "Cerrada", tono: "neutro" },
  anulada: { titulo: "Anulada", tono: "critico" },
};

type Categoria = { id: string; nombre: string; contratoId: string };

type Datos = {
  /** Las cifras de arriba, sobre todas las órdenes (la lista trae solo las recientes). */
  resumen: ResumenOrdenes;
  contratos: ContratoBreve[];
  categorias: Categoria[];
  proveedores: Proveedor[];
  /** Por orden, del más nuevo al más viejo. */
  envios: Record<string, Envio[]>;
};

async function cargar(): Promise<Datos> {
  const [resumen, contratos, categorias, proveedores, envios] = await Promise.all([
    cargarResumenOrdenes(),
    cargarContratosBreve(),
    supabase.from("categorias_costo").select("id, nombre, contrato_id").order("orden"),
    cargarProveedores(),
    cargarEnvios(),
  ]);
  const porOrden: Record<string, Envio[]> = {};
  for (const e of envios) (porOrden[e.ordenId] ??= []).push(e);

  if (categorias.error) throw new Error(categorias.error.message);

  return {
    resumen,
    contratos,
    proveedores,
    envios: porOrden,
    categorias: ((categorias.data ?? []) as { id: string; nombre: string; contrato_id: string }[])
      .map((c) => ({ id: c.id, nombre: c.nombre, contratoId: c.contrato_id })),
  };
}

type Filtrado = "todas" | "abiertas" | "borrador" | "cerradas";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "abiertas", titulo: "Abiertas" },
  { id: "borrador", titulo: "Borradores" },
  { id: "cerradas", titulo: "Cerradas" },
];

type FiltradoPago = "todas" | "pagadas" | "por-pagar";

const opcionesPago: { id: FiltradoPago; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "pagadas", titulo: "Pagadas" },
  { id: "por-pagar", titulo: "Por pagar" },
];

const opcionesOrden: { id: OrdenDeLista; titulo: string }[] = [
  { id: "fecha-desc", titulo: "Más recientes" },
  { id: "fecha-asc", titulo: "Más antiguas" },
  { id: "numero-desc", titulo: "N° mayor a menor" },
  { id: "numero-asc", titulo: "N° menor a mayor" },
  { id: "monto-desc", titulo: "Monto mayor a menor" },
  { id: "monto-asc", titulo: "Monto menor a mayor" },
  { id: "proveedor", titulo: "Proveedor A–Z" },
];

const nombreMes = (aaaamm: string) => {
  const [a, m] = aaaamm.split("-").map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function VistaOrdenes() {
  const usuario = useUsuario();
  // Con clave, la pantalla abre al tiro con lo último que se vio y se refresca por detrás.
  const { estado, recargar: recargarBase } = useConsulta<Datos>(cargar, `${usuario.id}:${usuario.empresa}:ordenes-v2`);
  const edicion = useEdicion<Orden>("ordenes_compra_proveedor");
  const [imprimiendo, setImprimiendo] = useState<Orden | null>(null);
  const [recepcion, setRecepcion] = useState<Orden | null>(null);
  const [enviando, setEnviando] = useState<Orden | null>(null);

  const [filtro, setFiltro] = useFiltro<Filtrado>("ordenes:estado", "todas");
  const [pago, setPago] = useFiltro<FiltradoPago>("ordenes:pago", "todas");
  const [mes, setMes] = useFiltro("ordenes:mes", "");
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<OrdenDeLista>("fecha-desc");
  const buscado = useRetardado(texto);

  // Lo que la base resuelve: estado, mes, texto y orden. Solo viajan las más recientes.
  const filtros = useMemo<FiltrosOrdenes>(
    () => ({
      estados:
        filtro === "borrador"
          ? ["borrador"]
          : filtro === "cerradas"
            ? ["cerrada", "anulada"]
            : filtro === "abiertas"
              ? ["emitida", "parcial", "recibida"]
              : null,
      mes,
      texto: buscado,
      orden,
    }),
    [filtro, mes, buscado, orden],
  );

  // El pago sale de las facturas, no de la orden: se afina sobre lo cargado, y la
  // lista sigue pidiendo páginas hasta llenar la tabla.
  const soloPago = useMemo(() => {
    if (pago === "pagadas") return (o: Orden) => pagoDeOrden(o)?.tipo === "total";
    if (pago === "por-pagar") {
      return (o: Orden) => o.estado !== "borrador" && o.estado !== "anulada" && pagoDeOrden(o)?.tipo !== "total";
    }
    return null;
  }, [pago]);

  const lista = useListaServidor<Orden, FiltrosOrdenes>({
    traer: cargarPaginaOrdenes,
    filtros,
    filtroLocal: soloPago,
  });

  const recargar = () => {
    recargarBase();
    lista.recargar();
  };

  return (
    <>
      <Encabezado
        titulo="Órdenes de Compra"
        descripcion="Las que Valar emite a sus proveedores. Cada una lleva sus ítems, y es en el ítem donde se marca si es reembolsable, cuándo llegó y en qué factura vino."
        acciones={<BotonNuevo permiso="ordenes.emitir" onClick={edicion.abrirNuevo}>Nueva orden</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos
              resumen={datos.resumen}
              lista={lista}
              filtro={filtro}
              alFiltrar={setFiltro}
              pago={pago}
              alFiltrarPago={setPago}
              mes={mes}
              alElegirMes={setMes}
              texto={texto}
              alBuscar={setTexto}
              orden={orden}
              alOrdenar={setOrden}
              edicion={edicion}
              alImprimir={setImprimiendo}
              alRecepcionar={setRecepcion}
              alEnviar={setEnviando}
              envios={datos.envios}
            />

            {enviando && (
              <EnvioOrden
                orden={enviando}
                correoProveedor={datos.proveedores.find((p) => p.id === enviando.proveedorId)?.correo ?? null}
                envios={datos.envios[enviando.id] ?? []}
                alCerrar={() => setEnviando(null)}
                alEnviada={recargar}
              />
            )}

            {edicion.editando && (
              <FormularioOrden
                orden={edicion.registro}
                contratos={datos.contratos}
                categorias={datos.categorias}
                proveedores={datos.proveedores}
                usuario={usuario}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {imprimiendo && (
        <VistaImpresion orden={imprimiendo} alCerrar={() => setImprimiendo(null)} />
      )}

      {recepcion && (
        /* Recepción con guía, facturas parciales, NC y cierre: el ciclo
           entero de la orden (0051). Antes era solo la cantidad recibida. */
        <CicloOrden
          orden={recepcion}
          alCerrar={() => setRecepcion(null)}
          alCambiar={recargar}
        />
      )}

      {edicion.historial && (
        <DialogoHistorial
          tabla="ordenes_compra_proveedor"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="ordenes_compra_proveedor"
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
  pago,
  alFiltrarPago,
  mes,
  alElegirMes,
  texto,
  alBuscar,
  orden,
  alOrdenar,
  edicion,
  alImprimir,
  alRecepcionar,
  alEnviar,
  envios,
}: {
  resumen: ResumenOrdenes;
  lista: ReturnType<typeof useListaServidor<Orden, FiltrosOrdenes>>;
  filtro: Filtrado;
  alFiltrar: (f: Filtrado) => void;
  pago: FiltradoPago;
  alFiltrarPago: (p: FiltradoPago) => void;
  mes: string;
  alElegirMes: (m: string) => void;
  texto: string;
  alBuscar: (t: string) => void;
  orden: OrdenDeLista;
  alOrdenar: (o: OrdenDeLista) => void;
  edicion: ReturnType<typeof useEdicion<Orden>>;
  alImprimir: (o: Orden) => void;
  alRecepcionar: (o: Orden) => void;
  alEnviar: (o: Orden) => void;
  envios: Record<string, Envio[]>;
}) {
  const puedeEmitir = usePuede("ordenes.emitir");

  // Los totales de abajo son de lo que se está mostrando.
  const neto = lista.filas.reduce((t, o) => t + o.neto, 0);
  const total = lista.filas.reduce((t, o) => t + o.total, 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Emitido en órdenes",
            valor: formatearMonto(resumen.neto),
            nota: `${resumen.cantidad} ${resumen.cantidad === 1 ? "orden" : "órdenes"}`,
          },
          {
            etiqueta: "Órdenes abiertas",
            valor: String(resumen.abiertas),
            nota: "Emitidas o con recepción parcial",
            acento: resumen.abiertas > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Pendiente de facturar",
            valor: formatearMonto(resumen.porFacturar),
            nota: "Comprometido que el proveedor no ha facturado",
          },
          {
            etiqueta: "Reembolsables",
            valor: formatearMonto(resumen.reembolsable),
            nota: "Se le cobran al mandante",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${lista.filas.length}${lista.hayMas ? "+" : ""} mostradas · ${resumen.cantidad} en total${resumen.ultimoNumero ? ` · último N°: ${resumen.ultimoNumero}` : ""}`}
        filtrosAbajo
        filtros={
          <>
            <Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={alFiltrar} />
            <Filtro etiqueta="Pago" opciones={opcionesPago} valor={pago} alCambiar={alFiltrarPago} />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-mist px-6 py-4 lg:px-8">
          <input
            type="search"
            value={texto}
            onChange={(e) => alBuscar(e.target.value)}
            placeholder="Buscar por N°, proveedor, RUT, contrato o cotización…"
            aria-label="Buscar órdenes"
            className="min-w-[16rem] flex-1 rounded-full border border-mist-deep bg-white px-4 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
          <select
            value={mes}
            onChange={(e) => alElegirMes(e.target.value)}
            aria-label="Mes de emisión"
            className="rounded-full border border-mist-deep bg-white px-4 py-2 text-sm font-semibold text-ink-soft"
          >
            <option value="">Todos los meses</option>
            {resumen.meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
          <select
            value={orden}
            onChange={(e) => alOrdenar(e.target.value as OrdenDeLista)}
            aria-label="Ordenar por"
            className="rounded-full border border-mist-deep bg-white px-4 py-2 text-sm font-semibold text-ink-soft"
          >
            {opcionesOrden.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titulo}
              </option>
            ))}
          </select>
        </div>

        {lista.error ? (
          <p role="alert" className="px-6 py-10 text-center text-sm text-[#a52f24] lg:px-8">
            No se pudo cargar la lista: {lista.error}{" "}
            <button type="button" onClick={lista.recargar} className="font-semibold underline">
              Reintentar
            </button>
          </p>
        ) : lista.cargando && lista.filas.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-ink-soft lg:px-8">Cargando órdenes…</p>
        ) : (
          <Tabla
            columnas={columnas(edicion, alImprimir, alRecepcionar, puedeEmitir, alEnviar, envios)}
            filas={lista.filas}
            claveDe={(o) => o.id}
            vacio="Ninguna orden con este filtro."
            pie={
              <>
                <Total colSpan={4}>Total de lo mostrado</Total>
                <Total derecha>{formatearMonto(neto)}</Total>
                <Total derecha>{formatearMonto(total)}</Total>
                <Total />
              </>
            }
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

const columnas = (
  edicion: ReturnType<typeof useEdicion<Orden>>,
  alImprimir: (o: Orden) => void,
  alRecepcionar: (o: Orden) => void,
  puedeEmitir: boolean,
  alEnviar: (o: Orden) => void,
  envios: Record<string, Envio[]>,
): Columna<Orden>[] => [
  {
    clave: "numero",
    titulo: "N° de orden",
    encabezado: true,
    celda: (o) => (
      <>
        <span className="block font-semibold text-ink">{o.numero}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {formatearFecha(o.fechaEmision)}
        </span>
      </>
    ),
  },
  {
    clave: "proveedor",
    titulo: "Proveedor",
    celda: (o) => (
      <>
        <span className="block text-ink">{o.proveedor}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {o.proyecto ?? o.contratoId}
        </span>
        {o.numeroCotizacion && (
          <span className="mt-0.5 block text-xs text-ink-soft">Cotización {o.numeroCotizacion}</span>
        )}
      </>
    ),
  },
  {
    clave: "avance",
    titulo: "Recepción",
    ancho: "w-36",
    celda: (o) => {
      const pct = o.items > 0 ? (o.itemsRecibidos / o.items) * 100 : 0;
      return (
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist">
            <span
              style={{ width: `${pct}%` }}
              className="block h-full rounded-full bg-cyan-deep"
            />
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-soft">
            {o.itemsRecibidos}/{o.items}
          </span>
        </div>
      );
    },
  },
  {
    clave: "estado",
    titulo: "Estado",
    celda: (o) => {
      const pago = pagoDeOrden(o);
      return (
      <div className="flex flex-col items-start gap-1">
        <Chip tono={estados[o.estado].tono}>{estados[o.estado].titulo}</Chip>
        {pago?.tipo === "total" && <Chip tono="bueno">Pagada</Chip>}
        {pago?.tipo === "parcial" && <Chip tono="info">Pagada {pago.pct} %</Chip>}
        {/* Lo último que pasó con el envío al proveedor. */}
        {envios[o.id]?.[0] && <EstadoEnvio envio={envios[o.id][0]} />}
        {o.reembolsable > 0 && <Etiqueta destacada>Con reembolsables</Etiqueta>}
      </div>
      );
    },
  },
  {
    clave: "neto",
    titulo: "Neto",
    derecha: true,
    celda: (o) => <span className="font-semibold text-ink">{formatearMonto(o.neto)}</span>,
  },
  {
    clave: "total",
    titulo: "Total",
    derecha: true,
    celda: (o) => <span className="text-ink-soft">{formatearMonto(o.total)}</span>,
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    fija: true,
    celda: (o) => (
      <div className="flex items-center justify-end gap-1">
        {puedeEmitir && (
          <BotonIcono titulo="Enviar al proveedor" onClick={() => alEnviar(o)}>
            <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" strokeLinecap="round" strokeLinejoin="round" />
          </BotonIcono>
        )}
        <BotonIcono titulo="Imprimir" onClick={() => alImprimir(o)}>
          <path d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7Z" strokeLinejoin="round" />
        </BotonIcono>
        <BotonIcono titulo="Recepción y facturas" onClick={() => alRecepcionar(o)}>
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </BotonIcono>
        <BotonAdjuntos
          cuantos={edicion.cuantosAdjuntos(o.id)}
          onClick={() => edicion.verAdjuntos(o.id, `${o.numero} · ${o.proveedor}`)}
          alVer={() => edicion.abrirRespaldo(o.id, `${o.numero} · ${o.proveedor}`)}
        />
        <BotonIcono titulo="Ver historial" onClick={() => edicion.verHistorial(o.id, `${o.numero} · ${o.proveedor}`)}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </BotonIcono>
        {puedeEmitir && (
          <BotonIcono titulo="Editar" onClick={() => edicion.abrirEdicion(o)}>
            <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" strokeLinejoin="round" />
          </BotonIcono>
        )}
      </div>
    ),
  },
];

function BotonIcono({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={titulo}
      title={titulo}
      className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </button>
  );
}

/* ── Impresión ────────────────────────────────────────────────────────────── */

function VistaImpresion({ orden, alCerrar }: { orden: Orden; alCerrar: () => void }) {
  const { estado } = useConsulta<Item[]>(() => cargarItemsDeOrden(orden.id));
  const descuento = useConsulta(() => cargarDescuentoDeOrden(orden.id));
  const firmas = useConsulta(() => cargarFirmasDeOrden(orden.id));

  return (
    <Impresion titulo={`Vista previa · ${orden.numero}`} alCerrar={alCerrar}>
      {estado.estado === "listo" ? (
        <OrdenImprimible orden={orden} items={estado.datos} descuento={descuento.estado.estado === "listo" ? descuento.estado.datos : undefined}
          firmas={firmas.estado.estado === "listo" ? firmas.estado.datos : null} />
      ) : (
        <p className="mx-auto max-w-[210mm] rounded-2xl bg-white p-10 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Preparando la orden…"}
        </p>
      )}
    </Impresion>
  );
}
