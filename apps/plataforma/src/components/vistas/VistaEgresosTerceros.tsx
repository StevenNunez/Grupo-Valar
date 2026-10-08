"use client";

import { useMemo, useState } from "react";
import { FormularioCompra } from "../formularios/FormularioCompra";
import { FormularioOrden } from "../formularios/FormularioOrden";
import { FormularioReembolso } from "../formularios/FormularioReembolso";
import { CicloOrden } from "../CicloOrden";
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
import { usePuede, useUsuario } from "@/lib/sesion";
import { cargarOrdenes, type Orden } from "@/lib/ordenes";
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

type Filtrado = "todos" | "compras" | "servicios" | "reembolsos" | "recurrentes" | "plazos";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "compras", titulo: "Compras" },
  { id: "servicios", titulo: "Servicios" },
  { id: "reembolsos", titulo: "Reembolsos" },
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
  ordenes: Orden[];
};

async function cargar(): Promise<Datos> {
  const [egresos, compras, servicios, contratos, campos, proveedores, categorias, ordenes] =
    await Promise.all([
      cargarEgresosTerceros(),
      cargarCompras(),
      cargarServicios(),
      cargarContratosBreve(),
      cargarCampos(),
      cargarProveedores(),
      cargarCategorias(),
      cargarOrdenes(),
    ]);
  return { egresos, compras, servicios, contratos, campos, proveedores, categorias, ordenes };
}

export function VistaEgresosTerceros() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const edicion = useEdicion<EgresoTercero>();
  const [creando, setCreando] = useState<"compra" | "servicio" | "reembolso" | null>(null);
  /* Al registrar un reembolso se abre su respaldo: la foto de la rendición y
     de las boletas queda colgando del mismo registro. */
  const [adjuntarReembolso, setAdjuntarReembolso] = useState<string | null>(null);
  const puedeCargar = usePuede("gestion.editar");
  /* La OC es de Abastecimiento: registrarla pide su permiso, aunque se haga
     desde acá. Es la misma orden, no una copia. */
  const puedeRegistrarOC = usePuede("ordenes.emitir");
  const usuario = useUsuario();
  const [registrandoOC, setRegistrandoOC] = useState(false);
  const [adjuntarOC, setAdjuntarOC] = useState<string | null>(null);

  return (
    <>
      <Encabezado
        titulo="Compras y Servicios"
        descripcion="Todo lo que se gasta con terceros: materiales, subcontratos, arriendos y fletes. El personal va aparte, porque no es un gasto con un tercero."
        acciones={
          (puedeCargar || puedeRegistrarOC) && (
            <div className="flex flex-wrap gap-2">
              {puedeRegistrarOC && <BotonCrear onClick={() => setRegistrandoOC(true)}>Registrar OC</BotonCrear>}
              {puedeCargar && <BotonCrear onClick={() => setCreando("compra")}>Nueva compra</BotonCrear>}
              {puedeCargar && <BotonCrear onClick={() => setCreando("reembolso")}>Registrar reembolso</BotonCrear>}
              {puedeCargar && (
              <BotonCrear onClick={() => setCreando("servicio")} destacado>
                Nuevo servicio
              </BotonCrear>
              )}
            </div>
          )
        }
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos.egresos} edicion={edicion} />
            <OrdenesDeCompra ordenes={datos.ordenes} alCambiar={recargar} />

            {registrandoOC && (
              <FormularioOrden
                orden={null}
                registrar
                contratos={datos.contratos}
                categorias={datos.categorias}
                proveedores={datos.proveedores}
                usuario={usuario}
                alCerrar={() => setRegistrandoOC(false)}
                alGuardado={(id) => {
                  recargar();
                  // El PDF de Drive se adjunta apenas se registra: es el respaldo de la orden.
                  if (id) setAdjuntarOC(id);
                }}
              />
            )}

            {/* Cada origen abre su propio formulario, con sus campos. Un
                reembolso es una compra, pero se carga por comprobante. */}
            {(creando === "compra" || (edicion.registro?.origen === "compra" && !edicion.registro.rendidoPor)) && (
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

            {(creando === "reembolso" || (edicion.registro?.origen === "compra" && edicion.registro.rendidoPor)) && (
              <FormularioReembolso
                compra={
                  edicion.registro
                    ? (datos.compras.find((c) => c.id === edicion.registro?.id) ?? null)
                    : null
                }
                compras={datos.compras}
                contratos={datos.contratos}
                categorias={datos.categorias}
                alCerrar={() => {
                  setCreando(null);
                  edicion.cerrar();
                }}
                alGuardado={(id) => {
                  recargar();
                  if (id && creando === "reembolso") setAdjuntarReembolso(id);
                }}
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

      {adjuntarReembolso && (
        <DialogoAdjuntos
          tabla="compras"
          registroId={adjuntarReembolso}
          titulo={`Adjunta la rendición ${adjuntarReembolso}: la foto del detalle y de las boletas`}
          abierto
          alCerrar={() => setAdjuntarReembolso(null)}
        />
      )}

      {adjuntarOC && (
        <DialogoAdjuntos
          tabla="ordenes_compra_proveedor"
          registroId={adjuntarOC}
          titulo={`Adjunta el PDF de la orden ${adjuntarOC}`}
          abierto
          alCerrar={() => setAdjuntarOC(null)}
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
    if (filtro === "reembolsos") return filas.filter((e) => e.rendidoPor);
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
  const porDevolver = filas.filter((e) => e.rendidoPor && e.estadoPago !== "pagada");
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
        nota={`${visibles.length} de ${filas.length} movimientos${avisosPlazo ? ` · ${avisosPlazo} servicios por vencer o vencidos` : ""}${porDevolver.length ? ` · ${porDevolver.length} reembolsos por devolver (${formatearMonto(porDevolver.reduce((t, e) => t + e.total, 0))})` : ""}`}
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
        {e.rendidoPor ? (
          <>
            <Chip tono="aviso">Reembolso</Chip>
            <span className="mt-1 block text-xs text-ink-soft">
              {e.estadoPago === "pagada"
                ? `Devuelto${e.fechaPago ? ` el ${formatearFecha(e.fechaPago)}` : ""}`
                : "Por devolver"}
            </span>
          </>
        ) : (
          <Chip tono={tonoOrigen[e.origen]}>{e.origen === "compra" ? "Compra" : "Servicio"}</Chip>
        )}
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
        <span className="block text-ink">{e.rendidoPor ? `Rindió ${e.rendidoPor}` : e.tercero}</span>
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

/* ── Órdenes de compra ────────────────────────────────────────────────────── */

type EstadoCiclo = "por_recibir" | "retenida" | "por_facturar" | "parcial" | "facturada" | "pagada";

const ciclo: Record<EstadoCiclo, { titulo: string; tono: Tono }> = {
  retenida: { titulo: "Facturado sin recibir", tono: "critico" },
  por_recibir: { titulo: "Por recibir", tono: "aviso" },
  por_facturar: { titulo: "Recibido sin factura", tono: "info" },
  parcial: { titulo: "Facturada parcial", tono: "info" },
  facturada: { titulo: "Facturada", tono: "bueno" },
  pagada: { titulo: "Pagada", tono: "bueno" },
};

/** Lo más urgente primero: lo facturado sin llegar bloquea el pago. */
function estadoCiclo(o: Orden): EstadoCiclo {
  if (o.sinRecibir > 0) return "retenida";
  if (o.facturado >= o.neto && o.neto > 0) return o.pagado >= o.facturado ? "pagada" : "facturada";
  if (o.recibidoSinFacturar > 0) return "por_facturar";
  if (o.facturado > 0) return "parcial";
  return "por_recibir";
}

/**
 * Las OC con su ciclo: lo que llegó, lo facturado y lo pagado.
 *
 * Su costo ya pesa en el contrato desde que se emiten, pero no aparecen en el
 * detalle de arriba hasta que llega una factura. Desde acá se abre cada una
 * para recibir, agregar facturas, registrar la NC o cerrar el saldo.
 */
function OrdenesDeCompra({ ordenes, alCambiar }: { ordenes: Orden[]; alCambiar: () => void }) {
  const [filtro, setFiltro] = useState<"abiertas" | "todas">("abiertas");
  const [abierta, setAbierta] = useState<string | null>(null);
  const vigentes = ordenes.filter((o) => o.estado !== "anulada" && o.estado !== "borrador");
  const abiertas = vigentes.filter((o) => estadoCiclo(o) !== "pagada");
  const visibles = filtro === "todas" ? vigentes : abiertas;
  const porFacturar = vigentes.reduce((t, o) => t + Math.max(0, o.neto - o.facturado), 0);
  const nc = vigentes.filter((o) => o.solicitarNc).length;
  const orden = ordenes.find((o) => o.id === abierta) ?? null;

  return (
    <div className="mt-6">
      <Panel
        titulo="Órdenes de compra"
        nota={`${formatearMonto(porFacturar)} netos por facturar${nc ? ` · ${nc} ${nc === 1 ? "orden pide" : "órdenes piden"} nota de crédito` : ""}`}
        filtros={<Filtro etiqueta="Ver" valor={filtro} alCambiar={setFiltro}
          opciones={[{ id: "abiertas", titulo: "Abiertas" }, { id: "todas", titulo: "Todas" }]} />}
      >
        <Tabla
          filas={visibles}
          claveDe={(o) => o.id}
          vacio={filtro === "abiertas" ? "No hay órdenes abiertas." : "Todavía no hay órdenes registradas."}
          columnas={columnasOrden(setAbierta)}
        />
      </Panel>
      {orden && <CicloOrden orden={orden} alCerrar={() => setAbierta(null)} alCambiar={alCambiar} />}
    </div>
  );
}

const columnasOrden = (abrir: (id: string) => void): Columna<Orden>[] => [
  {
    clave: "orden",
    titulo: "Orden",
    encabezado: true,
    celda: (o) => (
      <button type="button" onClick={() => abrir(o.id)} className="text-left">
        <span className="block font-semibold text-cyan-deep hover:underline">{o.numero}</span>
        <span className="text-xs text-ink-soft">{o.proveedor} · {o.contratoId}</span>
      </button>
    ),
  },
  { clave: "emision", titulo: "Emisión", celda: (o) => <span className="whitespace-nowrap text-ink-soft">{formatearFecha(o.fechaEmision)}</span> },
  { clave: "neto", titulo: "Neto OC", derecha: true, celda: (o) => formatearMonto(o.neto) },
  { clave: "recibido", titulo: "Recibido", derecha: true, celda: (o) => formatearMonto(o.recibido) },
  { clave: "facturado", titulo: "Facturado", derecha: true, celda: (o) => formatearMonto(o.facturado) },
  { clave: "pagado", titulo: "Pagado", derecha: true, celda: (o) => formatearMonto(o.pagado) },
  {
    clave: "estado",
    titulo: "Estado",
    celda: (o) => {
      const e = ciclo[estadoCiclo(o)];
      return (
        <span className="flex flex-col items-start gap-1">
          <Chip tono={e.tono}>{e.titulo}</Chip>
          {o.solicitarNc && <span className="text-xs font-semibold text-[#a52f24]">Solicitar NC</span>}
        </span>
      );
    },
  },
  {
    clave: "abrir",
    titulo: "",
    derecha: true,
    celda: (o) => (
      <button type="button" onClick={() => abrir(o.id)}
        className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink">
        Abrir
      </button>
    ),
  },
];
