"use client";

import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { FormularioCompra } from "../formularios/FormularioCompra";
import { FormularioReembolso } from "../formularios/FormularioReembolso";
import { CicloOrden } from "../CicloOrden";
import { FormularioServicio } from "../formularios/FormularioServicio";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, type Tono } from "../ui/Chip";
import { AccionesFila, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Buscador, coincide } from "../ui/Buscador";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarProveedores, type Proveedor } from "@/lib/abastecimiento";
import { cargarCampos, type CampoContrato } from "@/lib/campos";
import { cargarCategorias, type Categoria } from "@/lib/categorias";
import { useConsulta } from "@/lib/consulta";
import { usePuede, useUsuario } from "@/lib/sesion";
import { cargarOrdenes, type Orden } from "@/lib/ordenes";
import { cargarAnexos, type Anexo } from "@/lib/anexos";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { opcionesDeUnidad, unidadDe, unidades } from "@/lib/unidades";
import {
  cargarCompras,
  cargarEgresosTerceros,
  cargarServicios,
  tiposServicio,
  type Compra,
  type EgresoTercero,
  type Servicio,
} from "@/lib/egresos";
import { diasHastaFecha, formatearFecha, formatearMonto, mesLargo, enPeriodo, gruposDePeriodo } from "@/lib/formato";

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

type Filtrado = "todos" | "compras" | "ordenes" | "servicios" | "reembolsos" | "recurrentes" | "sinFactura" | "porPagar" | "vencidos" | "pagados" | "activos";

/* Filtros secundarios; los primarios son el contrato y el mes. */
const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "compras", titulo: "Compras" },
  { id: "ordenes", titulo: "Órdenes de compra" },
  { id: "servicios", titulo: "Servicios" },
  { id: "reembolsos", titulo: "Reembolsos" },
  { id: "recurrentes", titulo: "Recurrentes" },
  { id: "sinFactura", titulo: "Sin factura" },
  { id: "porPagar", titulo: "Por pagar" },
  { id: "vencidos", titulo: "Vencidos" },
  { id: "pagados", titulo: "Pagados" },
  { id: "activos", titulo: "Activos" },
];

/** Una compra o servicio anulado se ve en la lista, pero no suma ni resta. */
const cuenta = (e: EgresoTercero) => e.estadoPago !== "anulada";

/**
 * Falta el documento del proveedor. Un reembolso se respalda con su rendición,
 * no con factura. En una OC, falta factura de lo que ya llegó.
 */
const sinFactura = (e: EgresoTercero) =>
  cuenta(e) &&
  !e.rendidoPor &&
  (e.origen === "orden" ? e.netoRecibido > e.netoFacturado : e.origen === "compra" ? !e.documento : !e.vencimiento && !e.fechaFactura);

/** Neto que falta facturar: en una OC, lo recibido que el proveedor no ha facturado. */
const netoSinFactura = (e: EgresoTercero) =>
  !sinFactura(e) ? 0 : e.origen === "orden" ? e.netoRecibido - e.netoFacturado : e.neto;

/**
 * Deuda con proveedores: lo que se debe y todavía no se pagó (los reembolsos
 * van aparte). Una OC se paga solo con factura: debe lo facturado y no pagado.
 */
const debe = (e: EgresoTercero) =>
  cuenta(e) && !e.rendidoPor && (e.origen === "orden" ? e.totalFacturado > e.totalPagado : e.estadoPago !== "pagada");

/** Con IVA, lo que hay que pagar hoy de esa fila. */
const montoPorPagar = (e: EgresoTercero) => (!debe(e) ? 0 : e.origen === "orden" ? e.totalFacturado - e.totalPagado : e.total);

/** Impago y con el plazo ya cumplido. */
const vencido = (e: EgresoTercero) => debe(e) && !!e.vencimiento && diasHastaFecha(e.vencimiento) < 0;

/**
 * Dónde va el pago de un servicio: sin factura todavía, por vencer, vencido o
 * pagado. El gasto ya cuenta en su mes desde que se registra; esto controla
 * cuándo hay que pagarlo (el plazo corre desde la factura).
 */
function pagoDe(e: EgresoTercero): { tono: Tono; texto: string } | null {
  if (e.rendidoPor) return null;
  if (e.estadoPago === "anulada") return { tono: "neutro", texto: "Anulada · no cuenta" };
  if (e.origen === "orden") {
    if (e.etapa === "pagada") return { tono: "bueno", texto: e.fechaPago ? `Pagada el ${formatearFecha(e.fechaPago)}` : "Pagada" };
    if (e.etapa === "emitida") return { tono: "neutro", texto: "Emitida · por recibir" };
    if (e.etapa === "recibida") return { tono: "info", texto: "Recibida · sin factura" };
    // Facturada (toda o en parte): el plazo de pago corre desde la factura.
    if (!debe(e)) return { tono: "info", texto: "Facturada en parte" };
    if (!e.vencimiento) return { tono: "aviso", texto: e.etapa === "parcial" ? "Facturada en parte · por pagar" : "Facturada · por pagar" };
    const diasOc = diasHastaFecha(e.vencimiento);
    if (diasOc < 0) return { tono: "critico", texto: `Pago vencido hace ${-diasOc} días` };
    if (diasOc === 0) return { tono: "aviso", texto: "Paga hoy" };
    if (diasOc <= 7) return { tono: "aviso", texto: `Paga en ${diasOc} días` };
    return { tono: "info", texto: `Paga el ${formatearFecha(e.vencimiento)}` };
  }
  if (e.estadoPago === "pagada") {
    return { tono: "bueno", texto: e.fechaPago ? `Pagado el ${formatearFecha(e.fechaPago)}` : "Pagado" };
  }
  if (e.origen === "compra") return { tono: "neutro", texto: "Pendiente de pago" };
  if (!e.vencimiento) {
    const dias = -diasHastaFecha(e.fecha);
    return { tono: dias > 30 ? "aviso" : "neutro", texto: "Factura pendiente" };
  }
  const dias = diasHastaFecha(e.vencimiento);
  if (dias < 0) return { tono: "critico", texto: `Pago vencido hace ${-dias} días` };
  if (dias === 0) return { tono: "aviso", texto: "Paga hoy" };
  if (dias <= 7) return { tono: "aviso", texto: `Paga en ${dias} días` };
  return { tono: "info", texto: `Paga el ${formatearFecha(e.vencimiento)}` };
}

function diasDeServicio(e: EgresoTercero) {
  return e.origen === "servicio" && e.hasta ? diasHastaFecha(e.hasta) : null;
}

/* La carga va en dos partes. Lo que se MIRA —la lista y las órdenes— abre la
   pantalla, y abre con lo último que se vio mientras se actualiza por detrás.
   Lo que solo usan los formularios (las compras completas, proveedores,
   categorías, campos) se pide en paralelo sin bloquear nada: antes la lista
   esperaba ocho consultas para mostrar dos. */

type Lista = {
  egresos: EgresoTercero[];
  ordenes: Orden[];
  anexos: Anexo[];
};

type Apoyo = {
  compras: Compra[];
  servicios: Servicio[];
  contratos: ContratoBreve[];
  campos: CampoContrato[];
  proveedores: Proveedor[];
  categorias: Categoria[];
};

async function cargarLista(): Promise<Lista> {
  const [egresos, ordenes, anexos] = await Promise.all([cargarEgresosTerceros(), cargarOrdenes(), cargarAnexos().catch(() => [] as Anexo[])]);
  return { egresos, ordenes, anexos };
}

async function cargarApoyo(): Promise<Apoyo> {
  const [compras, servicios, contratos, campos, proveedores, categorias] = await Promise.all([
    cargarCompras(),
    cargarServicios(),
    cargarContratosBreve(),
    cargarCampos(),
    cargarProveedores(),
    cargarCategorias(),
  ]);
  return { compras, servicios, contratos, campos, proveedores, categorias };
}

/** "todos" o un mes como "2026-08-01". */
type Mes = string;

const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

/** El mes que se abre: el más reciente con movimientos que no sea futuro. */
function mesInicial(egresos: EgresoTercero[]): Mes {
  const actual = primeroDelMes(new Date().toISOString());
  const meses = [...new Set(egresos.map((e) => primeroDelMes(e.periodo)))].sort().reverse();
  return meses.find((m) => m <= actual) ?? meses[0] ?? "todos";
}

export function VistaEgresosTerceros() {
  const usuario = useUsuario();
  const lista = useConsulta<Lista>(cargarLista, `${usuario.id}:${usuario.empresa}:egresos-terceros-v3`);
  const apoyo = useConsulta<Apoyo>(cargarApoyo);
  const recargar = () => {
    lista.recargar();
    apoyo.recargar();
  };
  /* Nulo = todavía no se eligió: se abre en el último mes con movimientos.
     Mostrar todo de una vez eran cientos de filas para mirar un mes. */
  const [mesElegido, setMes] = useFiltro<Mes | null>("egresos-terceros:mes", null);
  const edicion = useEdicion<EgresoTercero>();
  /* La OC cuyo ciclo (recibir, facturar, NC, cerrar) está abierto: se abre desde su fila o desde el panel. */
  const [ordenAbierta, setOrdenAbierta] = useState<string | null>(null);
  const [creando, setCreando] = useState<"compra" | "servicio" | "reembolso" | null>(null);
  /* Al registrar un reembolso se abre su respaldo: la foto de la rendición y
     de las boletas queda colgando del mismo registro. */
  const [adjuntarReembolso, setAdjuntarReembolso] = useState<string | null>(null);
  const puedeCargar = usePuede("gestion.editar");

  return (
    <>
      <Encabezado
        titulo="Compras y Servicios"
        descripcion="Todo lo que se gasta con terceros: materiales, subcontratos, arriendos y fletes. Una orden de compra cuenta como gasto del mes desde que se emite; después avanza (recibida, facturada, pagada) sin cambiar de monto. El personal va aparte."
        acciones={
          puedeCargar && (
            <MenuNuevo
              opciones={[
                { id: "compra", titulo: "Nueva compra" },
                { id: "servicio", titulo: "Nuevo servicio" },
                { id: "reembolso", titulo: "Nuevo reembolso" },
              ]}
              alElegir={(id) => setCreando(id as "compra" | "servicio" | "reembolso")}
            />
          )
        }
      />

      <Contenido consulta={lista.estado}>
        {({ egresos, ordenes, anexos }) => {
          const mes = mesElegido ?? mesInicial(egresos);
          return (
            <>
              <Contenidos
                filas={egresos}
                anexos={anexos}
                edicion={edicion}
                contratos={apoyo.estado.estado === "listo" ? apoyo.estado.datos.contratos : []}
                mes={mes}
                alCambiarMes={setMes}
                actualizando={lista.actualizando}
                abrirOrden={setOrdenAbierta}
              />
              <OrdenesDeCompra ordenes={ordenes} mes={mes} abrir={setOrdenAbierta} />
              {(() => {
                const orden = ordenes.find((o) => o.id === ordenAbierta);
                return orden ? <CicloOrden orden={orden} alCerrar={() => setOrdenAbierta(null)} alCambiar={recargar} /> : null;
              })()}
            </>
          );
        }}
      </Contenido>

      {/* Los formularios aparecen cuando llegan sus datos; normalmente ya
          llegaron antes de que alguien alcance a hacer clic. */}
      {apoyo.estado.estado === "listo" && (() => {
        const datos = apoyo.estado.datos;
        return (
          <>
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
        );
      })()}

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

/** Un solo botón azul "+ Nuevo" con lo que se puede registrar. */
function MenuNuevo({
  opciones,
  alElegir,
}: {
  opciones: { id: string; titulo: string }[];
  alElegir: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div
      className="relative"
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex items-center gap-2 rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Nuevo
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"
          className={`transition-transform ${abierto ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierto && (
        <ul role="menu" className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-mist-deep bg-white py-1 shadow-lg">
          {opciones.map((o) => (
            <li key={o.id} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAbierto(false);
                  alElegir(o.id);
                }}
                className="block w-full px-4 py-2 text-left text-sm font-semibold text-ink-soft hover:bg-mist hover:text-ink"
              >
                {o.titulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Contenidos({
  filas: todas,
  anexos,
  contratos,
  edicion,
  mes,
  alCambiarMes,
  actualizando,
  abrirOrden,
}: {
  filas: EgresoTercero[];
  anexos: Anexo[];
  contratos: ContratoBreve[];
  edicion: ReturnType<typeof useEdicion<EgresoTercero>>;
  mes: Mes;
  alCambiarMes: (m: Mes) => void;
  actualizando: boolean;
  abrirOrden: (id: string) => void;
}) {
  const [filtro, setFiltro] = useFiltro<Filtrado>("egresos-terceros:estado", "todos");
  const [contrato, setContrato] = useFiltro("egresos-terceros:contrato", "todos");
  const [texto, setTexto] = useState("");

  /* Un anexo se controla como un contrato aparte: Carpas tiene su propia opción. */
  const unidadDeFila = (e: EgresoTercero) => unidadDe(anexos, e.contratoId, e.anexoId);
  const opcionesContrato = useMemo(
    () => opcionesDeUnidad(unidades(contratos, anexos), todas.map((e) => unidadDe(anexos, e.contratoId, e.anexoId))),
    [todas, contratos, anexos],
  );

  /* Los meses salen de los datos: solo se ofrece lo que tiene movimientos. */
  const meses = useMemo(
    () =>
      [...new Set(todas.map((e) => primeroDelMes(e.periodo)))]
        .sort()
        .reverse()
        .map((m) => ({ id: m, titulo: mesLargo(m) })),
    [todas],
  );

  // Todo lo de abajo —tarjetas, filtros y total— mira el mes elegido.
  const filas = useMemo(
    () =>
      todas.filter(
        (e) => enPeriodo(mes, primeroDelMes(e.periodo)) && (contrato === "todos" || unidadDeFila(e) === contrato),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todas, mes, contrato, anexos],
  );

  const visibles = useMemo(() => {
    const delEstatus =
      filtro === "compras" ? filas.filter((e) => e.origen === "compra")
      : filtro === "ordenes" ? filas.filter((e) => e.origen === "orden")
      : filtro === "servicios" ? filas.filter((e) => e.origen === "servicio")
      : filtro === "reembolsos" ? filas.filter((e) => e.rendidoPor)
      : filtro === "recurrentes" ? filas.filter((e) => e.recurrente)
      : filtro === "sinFactura" ? filas.filter(sinFactura)
      : filtro === "porPagar" ? filas.filter(debe)
      : filtro === "vencidos" ? filas.filter(vencido)
      : filtro === "pagados" ? filas.filter((e) => !e.rendidoPor && e.estadoPago === "pagada")
      : filtro === "activos" ? filas.filter((e) => e.tipo === "activo")
      : filas;
    /* Buscar recorta la lista, las tarjetas y el total: se ve cuánto suma lo buscado. */
    return delEstatus.filter((e) =>
      coincide(texto, [e.tercero, e.documento, e.detalle, e.categoria, e.contratoId, e.ordenId, e.rendidoPor]),
    );
  }, [filas, filtro, texto]);

  // Lo anulado se ve en la lista pero no suma en ninguna tarjeta ni en el total.
  const contables = visibles.filter(cuenta);
  const neto = contables.reduce((t, e) => t + e.neto, 0);
  const total = contables.reduce((t, e) => t + e.total, 0);

  const compras = contables.filter((e) => e.origen === "compra");
  const ordenes = contables.filter((e) => e.origen === "orden");
  const servicios = contables.filter((e) => e.origen === "servicio");
  const porDevolver = contables.filter((e) => e.rendidoPor && e.estadoPago !== "pagada");
  const porPagar = contables.filter(debe);
  const pagoVencido = porPagar.filter(vencido);
  const sinDocumento = contables.filter(sinFactura);
  const pagadasSinFactura = sinDocumento.filter((e) => e.origen !== "orden" && e.estadoPago === "pagada");
  const suma = (ls: EgresoTercero[], campo: "neto" | "total" = "neto") => ls.reduce((t, e) => t + e[campo], 0);
  const sumaPorPagar = (ls: EgresoTercero[]) => ls.reduce((t, e) => t + montoPorPagar(e), 0);
  const anuladas = visibles.length - contables.length;
  const avisosPlazo = visibles.filter((e) => {
    const dias = diasDeServicio(e);
    return dias !== null && dias <= 30;
  }).length;

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Gasto total",
            valor: formatearMonto(suma(contables)),
            nota: `${contables.length} movimientos · órdenes ${formatearMonto(suma(ordenes))} · compras ${formatearMonto(suma(compras))} · servicios ${formatearMonto(suma(servicios))}. La OC cuenta desde que se emite${anuladas ? ` · ${anuladas} anulada${anuladas === 1 ? "" : "s"} no suma${anuladas === 1 ? "" : "n"}` : ""}`,
          },
          {
            etiqueta: "Pendiente de pago",
            valor: formatearMonto(sumaPorPagar(porPagar)),
            nota: `${porPagar.length} por pagar (con IVA, lo facturado) · órdenes ${formatearMonto(sumaPorPagar(porPagar.filter((e) => e.origen === "orden")))} · compras ${formatearMonto(sumaPorPagar(porPagar.filter((e) => e.origen === "compra")))} · servicios ${formatearMonto(sumaPorPagar(porPagar.filter((e) => e.origen === "servicio")))}`,
            acento: porPagar.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Pendiente de factura",
            valor: formatearMonto(sinDocumento.reduce((t, e) => t + netoSinFactura(e), 0)),
            nota: `${sinDocumento.length} ${sinDocumento.length === 1 ? "factura faltante" : "facturas faltantes"} (neto; en una OC, lo ya recibido)${pagadasSinFactura.length ? ` · ${pagadasSinFactura.length} ya pagadas sin factura` : ""}`,
            acento: sinDocumento.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Pagos vencidos",
            valor: formatearMonto(sumaPorPagar(pagoVencido)),
            nota: `${pagoVencido.length} ${pagoVencido.length === 1 ? "pago vencido" : "pagos vencidos"}`,
            acento: pagoVencido.length > 0 ? "critico" : "bueno",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${actualizando ? "Actualizando… · " : ""}${visibles.length} de ${filas.length} movimientos · las tarjetas siguen los filtros`}
        avisos={
          <>
            {avisosPlazo > 0 && <Chip tono="aviso">{avisosPlazo} {avisosPlazo === 1 ? "servicio por vencer o vencido" : "servicios por vencer o vencidos"}</Chip>}
            {pagoVencido.length > 0 && <Chip tono="critico">{pagoVencido.length} {pagoVencido.length === 1 ? "pago vencido" : "pagos vencidos"} · {formatearMonto(sumaPorPagar(pagoVencido))}</Chip>}
            {porPagar.length > 0 && <Chip tono="info">{porPagar.length} por pagar · {formatearMonto(sumaPorPagar(porPagar))}</Chip>}
            {porDevolver.length > 0 && <Chip tono="aviso">{porDevolver.length} {porDevolver.length === 1 ? "reembolso por devolver" : "reembolsos por devolver"} · {formatearMonto(porDevolver.reduce((t, e) => t + e.total, 0))}</Chip>}
          </>
        }
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Período">
              <Desplegable
                etiqueta="Período"
                valor={mes}
                alCambiar={alCambiarMes}
                grupos={gruposDePeriodo(meses)}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Contrato">
              <Desplegable
                etiqueta="Contrato"
                valor={contrato}
                alCambiar={setContrato}
                grupos={[{ opciones: opcionesContrato.map((o) => ({ ...o, titulo: o.id === "todos" ? "Todos los contratos" : o.titulo })) }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Estatus">
              <Filtro etiqueta="Estatus" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
            </CampoFiltro>
          </>
        }
      >
        <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar egresos" placeholder="Buscar por proveedor, N° de OC, factura, detalle, categoría o contrato…" />
        <Tabla
          columnas={columnas(edicion, abrirOrden)}
          filas={visibles}
          claveDe={(e) => `${e.id}|${e.periodo}`}
          vacio={texto.trim() ? "Ningún movimiento coincide con la búsqueda." : mes === "todos" || mes === "cerrados" ? "Ningún movimiento en este filtro." : "Ningún movimiento en este mes con este filtro."}
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

const tonoOrigen: Record<"compra" | "servicio" | "orden", Tono> = {
  compra: "neutro",
  servicio: "info",
  orden: "info",
};

const nombreOrigen = { compra: "Compra", servicio: "Servicio", orden: "Orden de compra" } as const;

const columnas = (
  edicion: ReturnType<typeof useEdicion<EgresoTercero>>,
  abrirOrden: (id: string) => void,
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
          <Chip tono={tonoOrigen[e.origen]}>{nombreOrigen[e.origen]}</Chip>
        )}
        {e.clase && (
          <span className="mt-1 block text-xs text-ink-soft">
            {tiposServicio.find((t) => t.id === e.clase)?.titulo ?? e.clase}
          </span>
        )}
        {pagoDe(e) && (
          <span className="mt-1.5 block">
            <Chip tono={pagoDe(e)!.tono}>{pagoDe(e)!.texto}</Chip>
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
          {e.origen !== "servicio" ? mesLargo(e.periodo) : formatearFecha(e.fecha)}
        </span>
        {e.origen === "orden" && <span className="mt-0.5 block text-xs text-ink-soft">Emitida: {formatearFecha(e.fecha)}</span>}
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
        {e.origen === "orden" && (e.netoRecibido > 0 || e.netoFacturado > 0) && (
          <span className="mt-0.5 block text-xs text-ink-soft">
            recibido {formatearMonto(e.netoRecibido)} · facturado {formatearMonto(e.netoFacturado)}
          </span>
        )}
        {e.tipo === "reembolsable" && (
          <span className="mt-0.5 block text-xs text-ink-soft">reembolsable</span>
        )}
        {e.tipo === "activo" && (
          <span className="mt-0.5 block text-xs font-semibold text-cyan-deep">activo · no resta del margen</span>
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
    celda: (e) =>
      e.origen === "orden" && e.ordenId ? (
        // Una OC no se edita acá: se abre su ciclo (recibir, facturar, NC, cerrar).
        <button type="button" onClick={() => abrirOrden(e.ordenId as string)}
          className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink">
          Abrir
        </button>
      ) : (
        <AccionesFila
          permiso="gestion.editar"
          alEditar={() => edicion.abrirEdicion(e)}
          alVerHistorial={() => edicion.verHistorial(e.id, `${e.id} · ${e.tercero}`)}
          alVerAdjuntos={() => edicion.verAdjuntos(e.id, `${e.id} · ${e.tercero}`)}
          alVerRespaldo={() => edicion.abrirRespaldo(e.id, `${e.id} · ${e.tercero}`)}
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
 * Su gasto ya está en el detalle de arriba desde que se emiten (0080); este
 * panel es la cola de trabajo: las que siguen abiertas, sean del mes que sean.
 * Desde acá se abre cada una para recibir, agregar facturas, registrar la NC o
 * cerrar el saldo.
 */
function OrdenesDeCompra({ ordenes, mes, abrir }: { ordenes: Orden[]; mes: Mes; abrir: (id: string) => void }) {
  const [filtro, setFiltro] = useFiltro<"abiertas" | "todas">("egresos-terceros:ordenes", "abiertas");
  const vigentes = ordenes.filter((o) => o.estado !== "anulada" && o.estado !== "borrador");
  const abiertas = vigentes.filter((o) => estadoCiclo(o) !== "pagada");
  /* Las abiertas salen todas, sean del mes que sean: son trabajo pendiente, y
     una OC de julio sin recibir sigue siendo de hoy. "Todas" sí sigue el mes. */
  const delMes = vigentes.filter((o) => enPeriodo(mes, primeroDelMes(o.fechaEmision)));
  const visibles = filtro === "todas" ? delMes : abiertas;
  const porFacturar = vigentes.reduce((t, o) => t + Math.max(0, o.neto - o.facturado), 0);
  const nc = vigentes.filter((o) => o.solicitarNc).length;

  return (
    <div className="mt-6">
      <Panel
        titulo="Órdenes de compra"
        nota={`${formatearMonto(porFacturar)} netos por facturar${nc ? ` · ${nc} ${nc === 1 ? "orden pide" : "órdenes piden"} nota de crédito` : ""}`}
        filtros={<Filtro etiqueta="Ver" valor={filtro} alCambiar={setFiltro}
          opciones={[{ id: "abiertas", titulo: "Abiertas" }, { id: "todas", titulo: mes === "todos" || mes === "cerrados" ? "Todas" : "Todas del mes" }]} />}
      >
        <Tabla
          filas={visibles}
          claveDe={(o) => o.id}
          vacio={filtro === "abiertas" ? "No hay órdenes abiertas." : "Todavía no hay órdenes registradas."}
          columnas={columnasOrden(abrir)}
        />
      </Panel>
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
