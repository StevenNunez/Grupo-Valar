"use client";

import { DialogoAdjuntos } from "./ui/Adjuntos";
import {
  Ancho,
  CampoDinero,
  CampoFecha,
  CampoMes,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Confirmacion,
  Dialogo,
  Pie,
  useBorrado,
  useFormulario,
} from "./ui/Formulario";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "./ui/Historial";
import { SelectorAnexo } from "./ui/SelectorAnexo";
import { Tabla, Total, type Columna } from "./ui/Tabla";
import { Panel } from "./ui/Vista";
import { actualizar, crear } from "@/lib/crud";
import { categoriasDe, type Categoria } from "@/lib/categorias";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { causalesFiniquito, type CausalFiniquito, type Finiquito } from "@/lib/finiquitos";
import { formatearFecha, formatearMonto, formatearPesos, mesLargo } from "@/lib/formato";

/**
 * Los finiquitos del mes, debajo de la nómina: el de un contrato en Personal y
 * el de Oficina Central en su Personal. Cada uno es su propio registro —un
 * trabajador, un pago— con el finiquito firmado adjunto con el clip.
 */

const TABLA = "finiquitos";
const PERMISO = "personal.editar";

export function PanelFiniquitos({
  de,
  filas,
  contratos = [],
  categorias = [],
  alCambiar,
}: {
  de: "contratos" | "oficina";
  /** Los del período que se está mirando. */
  filas: Finiquito[];
  /** Solo para los de contratos. */
  contratos?: ContratoBreve[];
  categorias?: Categoria[];
  alCambiar: () => void;
}) {
  const edicion = useEdicion<Finiquito>(TABLA);
  const total = filas.reduce((t, f) => t + f.total, 0);
  const nombreContrato = (id: string | null) => contratos.find((c) => c.id === id)?.nombre ?? id ?? "";
  const titulo = (f: Finiquito) => `Finiquito de ${f.trabajador} · ${mesLargo(f.periodo)}`;

  const columnas: Columna<Finiquito>[] = [
    {
      clave: "trabajador",
      titulo: "Trabajador",
      encabezado: true,
      celda: (f) => (
        <>
          <span className="block font-semibold text-ink">
            {f.trabajador}
            {f.conReserva && (
              <span
                title={f.reservaDetalle ? `Reservó: ${f.reservaDetalle}` : "Firmó con reserva de derechos"}
                className="ml-2 inline-block rounded-full bg-[#fdf1dc] px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a5a09]"
              >
                Con reserva
              </span>
            )}
          </span>
          <span className="text-xs text-ink-soft">{[f.rut, f.cargo].filter(Boolean).join(" · ") || "—"}</span>
          {f.conReserva && f.reservaDetalle && <span className="block text-xs text-[#8a5a09]">Reservó: {f.reservaDetalle}</span>}
        </>
      ),
    },
    ...(de === "contratos"
      ? [{
          clave: "contrato",
          titulo: "Contrato",
          celda: (f: Finiquito) => (
            <>
              <span className="block text-ink">{nombreContrato(f.contratoId)}</span>
              <span className="text-xs text-ink-soft">{f.contratoId}</span>
            </>
          ),
        }]
      : []),
    {
      clave: "mes",
      titulo: "Mes",
      celda: (f) => (
        <>
          <span className="block whitespace-nowrap text-ink-soft">{mesLargo(f.periodo)}</span>
          {f.fechaPago && <span className="text-xs text-ink-soft">pagado {formatearFecha(f.fechaPago)}</span>}
        </>
      ),
    },
    {
      clave: "causal",
      titulo: "Causal",
      celda: (f) => <span className="text-ink-soft">{causalesFiniquito.find((c) => c.id === f.causal)?.titulo.replace(/ \(art\..*\)$/, "") ?? "—"}</span>,
    },
    { clave: "total", titulo: "Total pagado", derecha: true, celda: (f) => <span className="font-semibold text-ink">{formatearMonto(f.total)}</span> },
    {
      clave: "acciones",
      titulo: "",
      derecha: true,
      celda: (f) => (
        <AccionesFila
          permiso={PERMISO}
          alEditar={() => edicion.abrirEdicion(f)}
          alVerHistorial={() => edicion.verHistorial(f.id, titulo(f))}
          alVerAdjuntos={() => edicion.verAdjuntos(f.id, titulo(f))}
          cuantosAdjuntos={edicion.cuantosAdjuntos(f.id)}
        />
      ),
    },
  ];

  return (
    <>
      <Panel
        titulo="Finiquitos"
        nota="Un registro por trabajador, en el mes en que se paga. Suma al pago de personal del mes; el finiquito firmado se adjunta con el clip."
        filtros={<BotonNuevo permiso={PERMISO} onClick={edicion.abrirNuevo}>Nuevo finiquito</BotonNuevo>}
      >
        <Tabla
          columnas={columnas}
          filas={filas}
          claveDe={(f) => f.id}
          vacio="Sin finiquitos en este período."
          pie={filas.length > 1 ? <>
            <Total colSpan={de === "contratos" ? 4 : 3}>Total</Total>
            <Total derecha>{formatearMonto(total)}</Total>
            <Total />
          </> : undefined}
        />
      </Panel>

      {edicion.editando && (
        <FormularioFiniquito
          de={de}
          registro={edicion.registro}
          contratos={contratos}
          categorias={categorias}
          alCerrar={edicion.cerrar}
          alGuardado={alCambiar}
        />
      )}
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

/* ── El formulario ────────────────────────────────────────────────────────── */

const mesActual = () => new Date().toISOString().slice(0, 8) + "01";

type Borrador = {
  contrato_id: string;
  anexo_id: string;
  periodo: string;
  fecha_pago: string;
  trabajador: string;
  rut: string;
  cargo: string;
  causal: CausalFiniquito | "";
  indemnizacion_anios: number;
  indemnizacion_aviso: number;
  feriado_proporcional: number;
  otros_montos: number;
  con_reserva: boolean;
  reserva_detalle: string;
  observaciones: string;
};

function FormularioFiniquito({
  de,
  registro,
  contratos,
  categorias,
  alCerrar,
  alGuardado,
}: {
  de: "contratos" | "oficina";
  registro: Finiquito | null;
  contratos: ContratoBreve[];
  categorias: Categoria[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const editando = registro !== null;
  const f = useFormulario<Borrador>(
    registro
      ? {
          contrato_id: registro.contratoId ?? "",
          anexo_id: registro.anexoId ?? "",
          periodo: registro.periodo,
          fecha_pago: registro.fechaPago ?? "",
          trabajador: registro.trabajador,
          rut: registro.rut ?? "",
          cargo: registro.cargo ?? "",
          causal: registro.causal ?? "",
          indemnizacion_anios: registro.indemnizacionAnios,
          indemnizacion_aviso: registro.indemnizacionAviso,
          feriado_proporcional: registro.feriadoProporcional,
          otros_montos: registro.otrosMontos,
          con_reserva: registro.conReserva,
          reserva_detalle: registro.reservaDetalle ?? "",
          observaciones: registro.observaciones ?? "",
        }
      : {
          contrato_id: de === "contratos" ? (contratos[0]?.id ?? "") : "",
          anexo_id: "",
          periodo: mesActual(),
          fecha_pago: "",
          trabajador: "",
          rut: "",
          cargo: "",
          causal: "",
          indemnizacion_anios: 0,
          indemnizacion_aviso: 0,
          feriado_proporcional: 0,
          otros_montos: 0,
          con_reserva: false,
          reserva_detalle: "",
          observaciones: "",
        },
  );
  const borrado = useBorrado(TABLA, registro?.id, () => {
    alGuardado();
    alCerrar();
  });
  const d = f.datos;
  const total = d.indemnizacion_anios + d.indemnizacion_aviso + d.feriado_proporcional + d.otros_montos;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!d.trabajador.trim()) return f.setError("Indica a quién corresponde el finiquito.");
    if (de === "contratos" && !d.contrato_id) return f.setError("Elige el contrato.");
    if (total <= 0) return f.setError("Ingresa al menos un monto del finiquito.");

    const fila = {
      contrato_id: de === "contratos" ? d.contrato_id : null,
      anexo_id: de === "contratos" ? d.anexo_id || null : null,
      periodo: d.periodo,
      fecha_pago: d.fecha_pago || null,
      trabajador: d.trabajador.trim(),
      rut: d.rut.trim() || null,
      cargo: d.cargo.trim() || null,
      causal: d.causal || null,
      indemnizacion_anios: d.indemnizacion_anios,
      indemnizacion_aviso: d.indemnizacion_aviso,
      feriado_proporcional: d.feriado_proporcional,
      otros_montos: d.otros_montos,
      con_reserva: d.con_reserva,
      reserva_detalle: d.con_reserva ? d.reserva_detalle.trim() || null : null,
      observaciones: d.observaciones.trim() || null,
      // Va a la línea de personal del contrato, igual que la nómina; al editar se respeta la que tenía.
      categoria_id:
        de === "oficina"
          ? null
          : editando && registro.contratoId === d.contrato_id
            ? registro.categoriaId
            : (categoriasDe(categorias, d.contrato_id, "personal")[0]?.id ?? null),
    };

    f.enviar(
      () => (editando ? actualizar(TABLA, registro.id, fila) : crear(TABLA, fila)),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar finiquito" : "Nuevo finiquito"}
        descripcion={
          de === "contratos"
            ? "Lo que se pagó al terminar la relación laboral. Suma al costo de personal del contrato en el mes de pago."
            : "Lo que se pagó al terminar la relación laboral. Suma al pago de personal de Oficina Central en el mes de pago."
        }
        abierto
        alCerrar={alCerrar}
      >
        <form onSubmit={guardar}>
          <Campos>
            {de === "contratos" && (
              <>
                <CampoSeleccion
                  etiqueta="Contrato"
                  requerido
                  opciones={opcionesDeContrato(contratos)}
                  valor={d.contrato_id}
                  alCambiar={(v) => f.setDatos((x) => ({ ...x, contrato_id: v, anexo_id: "" }))}
                />
                <SelectorAnexo contratoId={d.contrato_id} valor={d.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />
              </>
            )}

            <CampoTexto etiqueta="Trabajador" requerido marcador="Juan Pérez Soto" {...f.campo("trabajador")} />
            <CampoTexto etiqueta="RUT" marcador="12.345.678-9" {...f.campo("rut")} />
            <CampoTexto etiqueta="Cargo" marcador="Maestro primera" {...f.campo("cargo")} />
            <CampoSeleccion
              etiqueta="Causal de término"
              opciones={[{ id: "" as const, titulo: "Sin indicar" }, ...causalesFiniquito]}
              {...f.campo("causal")}
            />

            <CampoMes etiqueta="Mes" requerido ayuda="El mes en que se paga: es el mes en que cuenta como gasto." {...f.campo("periodo")} />
            <CampoFecha etiqueta="Fecha de pago" ayuda="Opcional, la del finiquito firmado." {...f.campo("fecha_pago")} />

            <Ancho>
              <div className="border-t border-mist pt-5">
                <h3 className="font-display text-sm font-semibold text-ink">Montos del finiquito</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">Como vienen en el documento. Los que no apliquen, en cero.</p>
              </div>
            </Ancho>

            <CampoDinero etiqueta="Indemnización por años de servicio" {...f.campo("indemnizacion_anios")} />
            <CampoDinero etiqueta="Indemnización sustitutiva del aviso previo" ayuda="El mes de aviso, si no se dio." {...f.campo("indemnizacion_aviso")} />
            <CampoDinero etiqueta="Feriado proporcional" ayuda="Vacaciones pendientes y proporcionales." {...f.campo("feriado_proporcional")} />
            <CampoDinero etiqueta="Otros montos" ayuda="Remuneraciones pendientes, bonos u otros conceptos." {...f.campo("otros_montos")} />

            <Ancho>
              <p className="flex items-baseline justify-between gap-4 rounded-xl border-2 border-ink bg-white px-4 py-3">
                <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">Total del finiquito</span>
                <span className="font-display text-xl font-semibold tabular-nums text-ink">{formatearPesos(total)}</span>
              </p>
            </Ancho>

            <Ancho>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-mist-deep px-4 py-3">
                <input
                  type="checkbox"
                  checked={d.con_reserva}
                  onChange={(e) => f.cambiar("con_reserva", e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#8a5a09]"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">Firmó con reserva de derechos</span>
                  <span className="block text-xs text-ink-soft">
                    El trabajador puede reclamar después lo que se reservó. Queda marcado en la lista.
                  </span>
                </span>
              </label>
            </Ancho>
            {d.con_reserva && (
              <Ancho>
                <CampoTexto
                  etiqueta="Qué se reservó"
                  marcador="Diferencia de horas extra de agosto"
                  ayuda="Como quedó escrito en el finiquito. Opcional."
                  {...f.campo("reserva_detalle")}
                />
              </Ancho>
            )}

            <Ancho><CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} /></Ancho>
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear finiquito"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      {registro && (
        <Confirmacion
          abierto={borrado.confirmando}
          titulo="Eliminar finiquito"
          detalle={`Se eliminará el finiquito de ${registro.trabajador} (${formatearPesos(registro.total)}).`}
          error={borrado.error}
          procesando={borrado.borrando}
          alCancelar={borrado.cerrar}
          alConfirmar={borrado.confirmar}
        />
      )}
    </>
  );
}
