"use client";

import { useMemo, useState } from "react";
import { FormularioOrden } from "../formularios/FormularioOrden";
import { OrdenImprimible } from "../OrdenImprimible";
import { BotonAdjuntos, DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, Etiqueta, type Tono } from "../ui/Chip";
import { Dialogo } from "../ui/Formulario";
import { Impresion } from "../ui/Impresion";
import { BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarProveedores, type Proveedor } from "@/lib/abastecimiento";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { actualizar } from "@/lib/crud";
import { formatearFecha, formatearMonto, formatearNumero, formatearPesos } from "@/lib/formato";
import {
  cargarItemsDeOrden,
  cargarOrdenes,
  etapas,
  type EstadoOrden,
  type Item,
  type Orden,
} from "@/lib/ordenes";
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
  ordenes: Orden[];
  contratos: ContratoBreve[];
  categorias: Categoria[];
  proveedores: Proveedor[];
};

async function cargar(): Promise<Datos> {
  const [ordenes, contratos, categorias, proveedores] = await Promise.all([
    cargarOrdenes(),
    cargarContratosBreve(),
    supabase.from("categorias_costo").select("id, nombre, contrato_id").order("orden"),
    cargarProveedores(),
  ]);

  if (categorias.error) throw new Error(categorias.error.message);

  return {
    ordenes,
    contratos,
    proveedores,
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

export function VistaOrdenes() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const edicion = useEdicion<Orden>("ordenes_compra_proveedor");
  const usuario = useUsuario();
  const [imprimiendo, setImprimiendo] = useState<Orden | null>(null);
  const [recepcion, setRecepcion] = useState<Orden | null>(null);

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
              filas={datos.ordenes}
              edicion={edicion}
              alImprimir={setImprimiendo}
              alRecepcionar={setRecepcion}
            />

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
        <DialogoRecepcion
          orden={recepcion}
          alCerrar={() => setRecepcion(null)}
          alGuardado={recargar}
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
  filas,
  edicion,
  alImprimir,
  alRecepcionar,
}: {
  filas: Orden[];
  edicion: ReturnType<typeof useEdicion<Orden>>;
  alImprimir: (o: Orden) => void;
  alRecepcionar: (o: Orden) => void;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todas");
  const puedeEmitir = usePuede("ordenes.emitir");

  const visibles = useMemo(() => {
    if (filtro === "borrador") return filas.filter((o) => o.estado === "borrador");
    if (filtro === "cerradas")
      return filas.filter((o) => o.estado === "cerrada" || o.estado === "anulada");
    if (filtro === "abiertas")
      return filas.filter((o) => ["emitida", "parcial", "recibida"].includes(o.estado));
    return filas;
  }, [filas, filtro]);

  const neto = visibles.reduce((t, o) => t + o.neto, 0);
  const total = visibles.reduce((t, o) => t + o.total, 0);
  const abiertas = filas.filter((o) => ["emitida", "parcial"].includes(o.estado));
  const porRecibir = abiertas.reduce((t, o) => t + (o.neto - o.facturado), 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Emitido en órdenes",
            valor: formatearMonto(filas.reduce((t, o) => t + o.neto, 0)),
            nota: `${filas.length} ${filas.length === 1 ? "orden" : "órdenes"}`,
          },
          {
            etiqueta: "Órdenes abiertas",
            valor: String(abiertas.length),
            nota: "Emitidas o con recepción parcial",
            acento: abiertas.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Pendiente de facturar",
            valor: formatearMonto(porRecibir),
            nota: "Comprometido que el proveedor no ha facturado",
          },
          {
            etiqueta: "Reembolsables",
            valor: formatearMonto(filas.reduce((t, o) => t + o.reembolsable, 0)),
            nota: "Se le cobran al mandante",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${filas.length} órdenes`}
        filtros={<Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={setFiltro} />}
      >
        <Tabla
          columnas={columnas(edicion, alImprimir, alRecepcionar, puedeEmitir)}
          filas={visibles}
          claveDe={(o) => o.id}
          vacio="Ninguna orden con este filtro."
          pie={
            <>
              <Total colSpan={4}>Total</Total>
              <Total derecha>{formatearMonto(neto)}</Total>
              <Total derecha>{formatearMonto(total)}</Total>
              <Total colSpan={2} />
            </>
          }
        />
      </Panel>
    </>
  );
}

const columnas = (
  edicion: ReturnType<typeof useEdicion<Orden>>,
  alImprimir: (o: Orden) => void,
  alRecepcionar: (o: Orden) => void,
  puedeEmitir: boolean,
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
    celda: (o) => (
      <div className="flex flex-col items-start gap-1">
        <Chip tono={estados[o.estado].tono}>{estados[o.estado].titulo}</Chip>
        {o.reembolsable > 0 && <Etiqueta destacada>Con reembolsables</Etiqueta>}
      </div>
    ),
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
    celda: (o) => (
      <div className="flex items-center justify-end gap-1">
        <BotonIcono titulo="Imprimir" onClick={() => alImprimir(o)}>
          <path d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7Z" strokeLinejoin="round" />
        </BotonIcono>
        <BotonIcono titulo="Recepción y facturas" onClick={() => alRecepcionar(o)}>
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </BotonIcono>
        <BotonAdjuntos
          cuantos={edicion.cuantosAdjuntos(o.id)}
          onClick={() => edicion.verAdjuntos(o.id, `${o.numero} · ${o.proveedor}`)}
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

  return (
    <Impresion titulo={`Vista previa · ${orden.numero}`} alCerrar={alCerrar}>
      {estado.estado === "listo" ? (
        <OrdenImprimible orden={orden} items={estado.datos} />
      ) : (
        <p className="mx-auto max-w-[210mm] rounded-2xl bg-white p-10 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Preparando la orden…"}
        </p>
      )}
    </Impresion>
  );
}

/* ── Recepción y facturación por ítem ─────────────────────────────────────── */

function DialogoRecepcion({
  orden,
  alCerrar,
  alGuardado,
}: {
  orden: Orden;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const { estado, recargar } = useConsulta<Item[]>(() => cargarItemsDeOrden(orden.id));
  const [guardando, setGuardando] = useState<string | null>(null);
  const puedeRecibir = usePuede("recepcion.registrar");
  const [error, setError] = useState<string | null>(null);

  /**
   * Recibir una cantidad, no un ítem entero.
   *
   * El proveedor manda 10 de las 30 unidades pedidas más veces de las que manda
   * las 30: con un interruptor de todo o nada había que elegir entre mentir
   * diciendo que llegó todo o mentir diciendo que no llegó nada. El estado sale
   * de la cantidad, no al revés, así que nunca puede decir "recibido" con la
   * mitad adentro.
   */
  async function recibir(item: Item, cantidad: number) {
    setError(null);
    setGuardando(item.id);
    try {
      const recibida = Math.max(0, Math.min(cantidad, item.cantidad));
      await actualizar("items_compra", item.id, {
        estado_recepcion:
          recibida <= 0 ? "pendiente" : recibida >= item.cantidad ? "recibido" : "parcial",
        cantidad_recibida: recibida,
        fecha_recepcion: recibida <= 0 ? null : new Date().toISOString().slice(0, 10),
      });
      recargar();
      // La orden cambia de estado sola con el trigger; hay que releerla.
      alGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(null);
    }
  }

  return (
    <Dialogo
      titulo={`Recepción de ${orden.numero}`}
      descripcion="Anota lo que llegó de cada ítem, aunque llegue a medias. El estado de la orden se actualiza solo."
      abierto
      alCerrar={alCerrar}
      ancho="max-w-4xl"
    >
      {error && (
        <p role="alert" className="mx-6 mt-5 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]">
          {error}
        </p>
      )}

      <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
        {estado.estado !== "listo" ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            {estado.estado === "error" ? estado.mensaje : "Cargando ítems…"}
          </p>
        ) : estado.datos.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            Esta orden todavía no tiene ítems.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {estado.datos.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-mist-deep bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{i.descripcion}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {formatearNumero(i.cantidad)} {i.unidad} × {formatearPesos(i.precioUnitario)} ·{" "}
                    {i.categoria}
                    {i.facturaNumero && ` · factura ${i.facturaNumero}`}
                  </p>
                  {i.cantidadRecibida > 0 && i.cantidadRecibida < i.cantidad && (
                    <p className="mt-0.5 text-xs font-semibold text-[#8a5a09]">
                      Faltan {formatearNumero(i.cantidad - i.cantidadRecibida)} {i.unidad}
                    </p>
                  )}
                </div>

                {i.tipo === "reembolsable" && <Etiqueta destacada>Reembolsable</Etiqueta>}

                <Chip tono={etapas[i.etapa].tono}>{etapas[i.etapa].titulo}</Chip>

                <span className="w-28 text-right font-semibold tabular-nums text-ink">
                  {formatearPesos(i.neto)}
                </span>

                <CantidadRecibida
                  item={i}
                  guardando={guardando === i.id}
                  puede={puedeRecibir}
                  alRecibir={(cantidad) => recibir(i, cantidad)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end border-t border-mist px-6 py-5">
        <button
          type="button"
          onClick={alCerrar}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Cerrar
        </button>
      </div>
    </Dialogo>
  );
}

/**
 * Cuánto llegó de un ítem.
 *
 * Arranca en lo que falta —que es lo que llega casi siempre— y deja corregirlo.
 * "Todo" está aparte porque es el caso frecuente y no merece teclear un número.
 */
function CantidadRecibida({
  item,
  guardando,
  puede,
  alRecibir,
}: {
  item: Item;
  guardando: boolean;
  /** Sin "Registrar recepción" se ve cuánto llegó, pero no se anota. */
  puede: boolean;
  alRecibir: (cantidad: number) => void;
}) {
  const falta = item.cantidad - item.cantidadRecibida;
  const [cantidad, setCantidad] = useState(String(falta > 0 ? falta : item.cantidad));

  if (!puede) {
    return (
      <span className="text-sm tabular-nums text-ink-soft">
        {formatearNumero(item.cantidadRecibida)} de {formatearNumero(item.cantidad)} recibidos
      </span>
    );
  }

  if (item.estadoRecepcion === "recibido") {
    return (
      <button
        type="button"
        onClick={() => alRecibir(0)}
        disabled={guardando}
        className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Deshacer"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`recibe-${item.id}`}>
        Cantidad recibida de {item.descripcion}
      </label>
      <input
        id={`recibe-${item.id}`}
        type="number"
        min={0}
        max={item.cantidad}
        step="any"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        className="w-20 rounded-xl border border-mist-deep px-3 py-2 text-right text-sm tabular-nums text-ink"
      />
      <button
        type="button"
        onClick={() => alRecibir(item.cantidadRecibida + Number(cantidad || 0))}
        disabled={guardando}
        className="rounded-full bg-cyan px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-50"
      >
        {guardando ? "…" : "Recibir"}
      </button>
      <button
        type="button"
        onClick={() => alRecibir(item.cantidad)}
        disabled={guardando}
        className="rounded-full border border-mist-deep px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
      >
        Todo
      </button>
    </div>
  );
}
