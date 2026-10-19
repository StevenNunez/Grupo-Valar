"use client";

import { SeccionRespaldos, useRespaldos } from "@/components/ui/Respaldos";
import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip } from "../ui/Chip";
import {
  Ancho, CampoDinero, CampoFecha, CampoSeleccion, CampoTexto, Campos, Confirmacion, Dialogo, Pie,
  useBorrado, useFormulario,
} from "../ui/Formulario";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { SelectorAnexo } from "../ui/SelectorAnexo";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarProveedores, type Proveedor } from "@/lib/abastecimiento";
import { anexoRaiz, cargarAnexos, type Anexo } from "@/lib/anexos";
import { actualizar, crearConId } from "@/lib/crud";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha, formatearMonto, formatearPesos, mesLargo, enPeriodo, gruposDePeriodo } from "@/lib/formato";
import {
  abierta, cargarGarantias, estadosGarantia, vencida, type EstadoGarantia, type Garantia,
} from "@/lib/garantias";
import { useUsuario } from "@/lib/sesion";
import { opcionesDeUnidad, unidadDe, unidades } from "@/lib/unidades";

/**
 * Garantías pagadas a proveedores.
 *
 * Un depósito en garantía sale de la caja pero no es un gasto: se devuelve. Acá
 * se ve cuánto hay retenido, cuánto está por devolver, cuánto ya volvió y qué
 * garantías pasaron su fecha de devolución. No suma a ningún costo.
 */

const TABLA = "garantias";
const PERMISO = "gestion.editar";
const OFICINA = "oficina";

type Datos = { garantias: Garantia[]; contratos: ContratoBreve[]; anexos: Anexo[]; proveedores: Proveedor[] };

async function cargar(): Promise<Datos> {
  const [garantias, contratos, anexos, proveedores] = await Promise.all([
    cargarGarantias(),
    cargarContratosBreve(),
    cargarAnexos().catch(() => [] as Anexo[]),
    cargarProveedores().catch(() => [] as Proveedor[]),
  ]);
  return { garantias, contratos, anexos, proveedores };
}

type Estatus = "todas" | EstadoGarantia | "vencidas";

const estatus: { id: Estatus; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "pagada", titulo: "Pagadas" },
  { id: "por_devolver", titulo: "Pend. de devolución" },
  { id: "devuelta", titulo: "Devueltas" },
  { id: "vencidas", titulo: "Vencidas" },
];

const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

export function VistaGarantias() {
  const usuario = useUsuario();
  const { estado, recargar } = useConsulta<Datos>(cargar, `${usuario.id}:${usuario.empresa}:garantias-v1`);
  const edicion = useEdicion<Garantia>(TABLA);

  return (
    <>
      <Encabezado
        titulo="Garantías"
        descripcion="Los depósitos en garantía que se pagan a proveedores (arriendos de equipos, cilindros). Se controlan desde Oficina Central: son saldo por recuperar, no un gasto ni costo de un contrato, y no entran a la rentabilidad. Cada una pasa de pagada a pendiente de devolución y a devuelta, y el comprobante se adjunta con el clip."
        acciones={<BotonNuevo permiso={PERMISO} onClick={edicion.abrirNuevo}>Nueva garantía</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos datos={datos} edicion={edicion} />
            {edicion.editando && (
              <FormularioGarantia
                registro={edicion.registro}
                contratos={datos.contratos}
                proveedores={datos.proveedores}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial tabla={TABLA} registroId={edicion.historial.id} titulo={edicion.historial.titulo}
          abierto alCerrar={edicion.cerrarHistorial} />
      )}
      {edicion.adjuntos && (
        <DialogoAdjuntos tabla={TABLA} registroId={edicion.adjuntos.id} titulo={edicion.adjuntos.titulo}
          abierto alCerrar={edicion.cerrarAdjuntos} alCambiar={edicion.recontarAdjuntos} />
      )}
    </>
  );
}

function Contenidos({ datos, edicion }: { datos: Datos; edicion: ReturnType<typeof useEdicion<Garantia>> }) {
  const { garantias: todas, contratos, anexos } = datos;
  const [periodo, setPeriodo] = useFiltro("garantias:periodo", "todos");
  const [contrato, setContrato] = useFiltro("garantias:contrato", "todos");
  const [filtro, setFiltro] = useFiltro<Estatus>("garantias:estado", "todas");
  const [texto, setTexto] = useState("");

  /* Un anexo se controla como un contrato aparte; Oficina Central, como una unidad más. */
  const unidadDeFila = (g: Garantia) => (g.contratoId ? unidadDe(anexos, g.contratoId, g.anexoId) : OFICINA);
  const opcionesContrato = useMemo(() => {
    const lista = [...unidades(contratos, anexos), { id: OFICINA, titulo: "Oficina Central" }];
    return opcionesDeUnidad(lista, todas.map((g) => (g.contratoId ? unidadDe(anexos, g.contratoId, g.anexoId) : OFICINA)));
  }, [contratos, anexos, todas]);
  const nombreUnidad = useMemo(() => new Map(opcionesContrato.map((o) => [o.id, o.titulo])), [opcionesContrato]);

  const meses = useMemo(
    () => [...new Set(todas.map((g) => primeroDelMes(g.fechaPago)))].sort().reverse().map((m) => ({ id: m, titulo: mesLargo(m) })),
    [todas],
  );

  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return todas.filter((g) => {
      if (!enPeriodo(periodo, primeroDelMes(g.fechaPago))) return false;
      if (contrato !== "todos" && unidadDeFila(g) !== contrato) return false;
      if (filtro === "vencidas" ? !vencida(g) : filtro !== "todas" && g.estado !== filtro) return false;
      if (buscado && !`${g.concepto} ${g.proveedor} ${g.documento ?? ""} ${g.id}`.toLowerCase().includes(buscado)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, anexos, periodo, contrato, filtro, texto]);

  const suma = (ls: Garantia[], campo: "monto" | "montoDevuelto" = "monto") => ls.reduce((t, g) => t + g[campo], 0);
  const abiertas = visibles.filter(abierta);
  const devueltas = visibles.filter((g) => g.estado === "devuelta");
  const vencidas = visibles.filter(vencida);
  const retenido = devueltas.reduce((t, g) => t + (g.monto - g.montoDevuelto), 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Total pagado",
            valor: formatearMonto(suma(visibles)),
            nota: `${visibles.length} ${visibles.length === 1 ? "garantía" : "garantías"} registradas`,
          },
          {
            etiqueta: "Saldo pendiente",
            valor: formatearMonto(suma(abiertas)),
            nota: `${abiertas.length} ${abiertas.length === 1 ? "abierta" : "abiertas"} · aún en poder del proveedor`,
          },
          {
            etiqueta: "Devuelto",
            valor: formatearMonto(suma(devueltas, "montoDevuelto")),
            nota: `${devueltas.length} ${devueltas.length === 1 ? "devuelta" : "devueltas"}${retenido > 0 ? ` · el proveedor retuvo ${formatearMonto(retenido)}` : ""}`,
            acento: devueltas.length > 0 ? "bueno" : undefined,
          },
          {
            etiqueta: "Vencidas",
            valor: formatearMonto(suma(vencidas)),
            nota: `${vencidas.length} ${vencidas.length === 1 ? "pasó" : "pasaron"} su fecha de devolución`,
            acento: vencidas.length > 0 ? "critico" : "bueno",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${todas.length} ${todas.length === 1 ? "garantía" : "garantías"} · las tarjetas siguen los filtros`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Período">
              <Desplegable etiqueta="Período" valor={periodo} alCambiar={setPeriodo}
                grupos={gruposDePeriodo(meses)} />
            </CampoFiltro>
            <CampoFiltro etiqueta="Contrato">
              <Desplegable etiqueta="Contrato" valor={contrato} alCambiar={setContrato}
                grupos={[{ opciones: opcionesContrato.map((o) => ({ ...o, titulo: o.id === "todos" ? "Todos los contratos" : o.titulo })) }]} />
            </CampoFiltro>
            <CampoFiltro etiqueta="Estatus">
              <Filtro etiqueta="Estatus" opciones={estatus} valor={filtro} alCambiar={setFiltro} />
            </CampoFiltro>
            <CampoFiltro etiqueta="Buscar">
              <input
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Concepto, proveedor o documento…"
                aria-label="Buscar garantías"
                className="w-56 rounded-full border border-mist-deep bg-white px-4 py-2 text-xs text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
              />
            </CampoFiltro>
          </>
        }
      >
        <Tabla
          columnas={columnas(edicion, (g) => nombreUnidad.get(unidadDeFila(g)) ?? g.contratoId ?? "Oficina Central", anexos)}
          filas={visibles}
          claveDe={(g) => g.id}
          vacio={todas.length === 0 ? "Todavía no hay garantías registradas. Crea la primera con «Nueva garantía»." : "Ninguna garantía con estos filtros."}
          pie={visibles.length > 1 ? (
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearMonto(suma(visibles))}</Total>
              <Total colSpan={2} />
              <Total derecha>{formatearMonto(suma(visibles, "montoDevuelto"))}</Total>
              <Total />
            </>
          ) : undefined}
        />
      </Panel>
    </>
  );
}

const columnas = (
  edicion: ReturnType<typeof useEdicion<Garantia>>,
  unidadDe: (g: Garantia) => string,
  anexos: Anexo[],
): Columna<Garantia>[] => [
  {
    clave: "garantia",
    titulo: "Garantía",
    encabezado: true,
    celda: (g) => (
      <>
        <span className="block font-semibold text-ink">{g.concepto}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{[g.proveedor, g.documento].filter(Boolean).join(" · ")}</span>
      </>
    ),
  },
  {
    clave: "contrato",
    titulo: "Contrato",
    celda: (g) => (
      <>
        <span className="block text-ink">{unidadDe(g)}</span>
        {g.anexoId && g.contratoId && (
          <span className="text-xs text-ink-soft">Anexo de {g.contratoId}{anexoRaiz(anexos, g.anexoId) !== g.anexoId ? " (adenda)" : ""}</span>
        )}
      </>
    ),
  },
  {
    clave: "pago",
    titulo: "Pagada el",
    celda: (g) => <span className="whitespace-nowrap text-ink-soft">{formatearFecha(g.fechaPago)}</span>,
  },
  { clave: "monto", titulo: "Monto", derecha: true, celda: (g) => <span className="font-semibold text-ink">{formatearMonto(g.monto)}</span> },
  {
    clave: "devolucion",
    titulo: "Devolución esperada",
    celda: (g) => (
      <>
        <span className="block whitespace-nowrap text-ink-soft">{g.devolucionEsperada ? formatearFecha(g.devolucionEsperada) : "—"}</span>
        {vencida(g) && <Chip tono="critico">Vencida</Chip>}
      </>
    ),
  },
  {
    clave: "estado",
    titulo: "Estado",
    celda: (g) => (
      <>
        <Chip tono={g.estado === "devuelta" ? "bueno" : g.estado === "por_devolver" ? "aviso" : "info"}>
          {estadosGarantia.find((e) => e.id === g.estado)?.titulo}
        </Chip>
        {g.estado === "devuelta" && g.fechaDevolucion && (
          <span className="mt-1 block text-xs text-ink-soft">el {formatearFecha(g.fechaDevolucion)}</span>
        )}
      </>
    ),
  },
  {
    clave: "devuelto",
    titulo: "Devuelto",
    derecha: true,
    celda: (g) => (g.estado === "devuelta" ? <span className="text-ink-soft">{formatearMonto(g.montoDevuelto)}</span> : <span className="text-ink-soft">—</span>),
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (g) => (
      <AccionesFila
        permiso={PERMISO}
        alEditar={() => edicion.abrirEdicion(g)}
        alVerHistorial={() => edicion.verHistorial(g.id, `Garantía · ${g.concepto}`)}
        alVerAdjuntos={() => edicion.verAdjuntos(g.id, `Garantía · ${g.concepto}`)}
        alVerRespaldo={() => edicion.abrirRespaldo(g.id, `Garantía · ${g.concepto}`)}
        cuantosAdjuntos={edicion.cuantosAdjuntos(g.id)}
      />
    ),
  },
];

/* ── El formulario ────────────────────────────────────────────────────────── */

const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  contrato_id: string;
  anexo_id: string;
  proveedor_id: string;
  proveedor: string;
  concepto: string;
  monto: number;
  fecha_pago: string;
  documento: string;
  devolucion_esperada: string;
  estado: EstadoGarantia;
  fecha_devolucion: string;
  monto_devuelto: number;
  observaciones: string;
};

function FormularioGarantia({
  registro, contratos, proveedores, alCerrar, alGuardado,
}: {
  registro: Garantia | null;
  contratos: ContratoBreve[];
  proveedores: Proveedor[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const editando = registro !== null;
  const f = useFormulario<Borrador>(
    registro
      ? {
          contrato_id: registro.contratoId ?? "",
          anexo_id: registro.anexoId ?? "",
          proveedor_id: registro.proveedorId ?? "",
          proveedor: registro.proveedor,
          concepto: registro.concepto,
          monto: registro.monto,
          fecha_pago: registro.fechaPago,
          documento: registro.documento ?? "",
          devolucion_esperada: registro.devolucionEsperada ?? "",
          estado: registro.estado,
          fecha_devolucion: registro.fechaDevolucion ?? "",
          monto_devuelto: registro.montoDevuelto,
          observaciones: registro.observaciones ?? "",
        }
      : {
          contrato_id: "",  // Oficina Central: una garantía no es costo de un contrato
          anexo_id: "",
          proveedor_id: "",
          proveedor: "",
          concepto: "",
          monto: 0,
          fecha_pago: hoy(),
          documento: "",
          devolucion_esperada: "",
          estado: "pagada",
          fecha_devolucion: "",
          monto_devuelto: 0,
          observaciones: "",
        },
  );
  const borrado = useBorrado(TABLA, registro?.id, () => {
    alGuardado();
    alCerrar();
  });
  const d = f.datos;

  function elegirProveedor(id: string) {
    const p = proveedores.find((x) => x.id === id);
    f.setDatos((x) => ({ ...x, proveedor_id: id, proveedor: p ? p.razonSocial : id === "" ? x.proveedor : "" }));
  }

  function cambiarEstado(estado: EstadoGarantia) {
    f.setDatos((x) => ({
      ...x,
      estado,
      // Al marcarla devuelta se propone lo habitual: hoy y el monto completo.
      fecha_devolucion: estado === "devuelta" ? x.fecha_devolucion || hoy() : "",
      monto_devuelto: estado === "devuelta" ? (x.monto_devuelto > 0 ? x.monto_devuelto : x.monto) : 0,
    }));
  }

  const respaldos = useRespaldos("garantias", editando ? registro.id : null);
  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!d.proveedor.trim()) return f.setError("Indica a qué proveedor se le pagó la garantía.");
    if (!d.concepto.trim()) return f.setError("Indica para qué es la garantía.");
    if (!(d.monto > 0)) return f.setError("Ingresa el monto de la garantía.");
    if (!d.fecha_pago) return f.setError("Indica cuándo se pagó.");
    if (d.estado === "devuelta") {
      if (!d.fecha_devolucion) return f.setError("Indica cuándo se devolvió.");
      if (d.monto_devuelto > d.monto) return f.setError("Lo devuelto no puede ser más que lo pagado.");
    }

    const fila = {
      contrato_id: d.contrato_id || null,
      anexo_id: d.contrato_id ? d.anexo_id || null : null,
      proveedor_id: d.proveedor_id || null,
      proveedor: d.proveedor.trim(),
      concepto: d.concepto.trim(),
      monto: d.monto,
      fecha_pago: d.fecha_pago,
      documento: d.documento.trim() || null,
      devolucion_esperada: d.devolucion_esperada || null,
      estado: d.estado,
      fecha_devolucion: d.estado === "devuelta" ? d.fecha_devolucion : null,
      monto_devuelto: d.estado === "devuelta" ? d.monto_devuelto : 0,
      observaciones: d.observaciones.trim() || null,
    };

    f.enviar(
      async () => {
        if (editando) await actualizar(TABLA, registro.id, fila);
        else void respaldos.subirA(await crearConId(TABLA, fila));
      },
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar garantía" : "Nueva garantía"}
        descripcion="Un depósito que se pagó a un proveedor y se devuelve. No suma al costo del contrato."
        abierto
        alCerrar={alCerrar}
      >
        <form onSubmit={guardar}>
          <Campos>
            <CampoSeleccion
              etiqueta="Contrato"
              opciones={[{ id: "", titulo: "Oficina Central (sin contrato)" }, ...opcionesDeContrato(contratos)]}
              valor={d.contrato_id}
              alCambiar={(v) => f.setDatos((x) => ({ ...x, contrato_id: v, anexo_id: "" }))}
            />
            <SelectorAnexo contratoId={d.contrato_id} valor={d.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />

            <CampoSeleccion
              etiqueta="Proveedor"
              opciones={[
                { id: "", titulo: "Otro (escribir el nombre)" },
                ...proveedores.map((p) => ({ id: p.id, titulo: p.razonSocial })),
              ]}
              valor={d.proveedor_id}
              alCambiar={elegirProveedor}
              ayuda="Si no tiene ficha, escribe el nombre abajo."
            />
            {d.proveedor_id === "" && (
              <CampoTexto etiqueta="Nombre del proveedor" requerido {...f.campo("proveedor")} />
            )}

            <Ancho><CampoTexto etiqueta="Concepto" requerido marcador="Garantía por arriendo de cilindros" {...f.campo("concepto")} /></Ancho>
            <CampoDinero etiqueta="Monto pagado" requerido {...f.campo("monto")} />
            <CampoFecha etiqueta="Fecha de pago" requerido {...f.campo("fecha_pago")} />
            <CampoTexto etiqueta="Comprobante o documento" ayuda="Transferencia, recibo o contrato. El archivo se adjunta con el clip." {...f.campo("documento")} />
            <CampoFecha etiqueta="Devolución esperada" ayuda="Pasada esta fecha sin devolverse, queda como vencida." {...f.campo("devolucion_esperada")} />

            <CampoSeleccion
              etiqueta="Estado"
              opciones={estadosGarantia}
              valor={d.estado}
              alCambiar={cambiarEstado}
              ayuda="Pagada: está en poder del proveedor. Pendiente de devolución: ya se pidió o corresponde pedirla."
            />
            {d.estado === "devuelta" && (
              <>
                <CampoFecha etiqueta="Fecha de devolución" requerido {...f.campo("fecha_devolucion")} />
                <CampoDinero etiqueta="Monto devuelto" ayuda="Menos que lo pagado si el proveedor retuvo algo." {...f.campo("monto_devuelto")} />
              </>
            )}

            <Ancho><CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} /></Ancho>
          </Campos>

          <Pie extra={<SeccionRespaldos respaldos={respaldos} />}
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear garantía"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      {registro && (
        <Confirmacion
          abierto={borrado.confirmando}
          titulo="Eliminar garantía"
          detalle={`Se eliminará la garantía «${registro.concepto}» (${formatearPesos(registro.monto)}).`}
          error={borrado.error}
          procesando={borrado.borrando}
          alCancelar={borrado.cerrar}
          alConfirmar={borrado.confirmar}
        />
      )}
    </>
  );
}
