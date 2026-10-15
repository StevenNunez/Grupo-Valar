"use client";

import { SeccionRespaldos, useRespaldos } from "@/components/ui/Respaldos";
import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, type FormEvent } from "react";
import { actualizar, crearConId } from "@/lib/crud";
import { useConsulta } from "@/lib/consulta";
import { formatearMonto, formatearNumero, formatearPesos, mesLargo } from "@/lib/formato";
import { errorDeHaberes, haberesEnCero, haberesParaGuardar, type Haberes } from "@/lib/haberes";
import { cargarNominasOficina, type NominaOficina } from "@/lib/oficina-central";
import { cargarFiniquitos, type Finiquito } from "@/lib/finiquitos";
import { motivosHhExtra } from "@/lib/haberes";
import { PanelFiniquitos } from "../Finiquitos";
import { HorasYCosto } from "./VistaPersonal";
import { FichaHaberes } from "../formularios/FichaHaberes";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import {
  Ancho, CampoMes, CampoNumero, CampoTexto, Campos, Confirmacion, Dialogo, Pie, useBorrado, useFormulario,
} from "../ui/Formulario";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";

/**
 * La nómina del personal de Oficina Central.
 *
 * Igual que el personal de un contrato (pedido del 05-10-2026): un registro
 * por mes con la misma ficha —dotación, HH, sueldo bruto, HH extra por motivo,
 * no imponible, descuentos, imposiciones, aporte patronal, otros haberes— y la nómina en PDF adjunta con
 * el clip de la fila. Lo único distinto es que no cuelga de un contrato.
 */

const PERMISO = "personal.editar";
const TABLA = "nominas_oficina_central";

async function cargar(): Promise<{ nominas: NominaOficina[]; finiquitos: Finiquito[] }> {
  const [nominas, finiquitos] = await Promise.all([cargarNominasOficina(), cargarFiniquitos("oficina")]);
  return { nominas, finiquitos };
}

export function VistaPersonalOficina() {
  const { estado, recargar } = useConsulta(cargar);
  const edicion = useEdicion<NominaOficina>(TABLA);

  return (
    <>
      <Encabezado
        titulo="Personal de Oficina Central"
        descripcion="Los haberes del mes del personal de Oficina Central, como vienen en la nómina de pagos: la misma ficha que el personal de los contratos. La nómina se adjunta con el clip de la fila."
        acciones={<BotonNuevo permiso={PERMISO} onClick={edicion.abrirNuevo}>Nueva nómina</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {({ nominas, finiquitos }) => (
          <>
            <Contenidos filas={nominas} finiquitos={finiquitos} edicion={edicion} alCambiar={recargar} />
            {edicion.editando && (
              <FormularioNominaOficina registro={edicion.registro} nominas={nominas}
                alCerrar={edicion.cerrar} alGuardado={recargar} />
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

type Estatus = "todos" | "hhExtra" | "finiquitos" | "reserva";

const estatusPersonal: { id: Estatus; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "hhExtra", titulo: "Con HH extra" },
  { id: "finiquitos", titulo: "Con finiquitos" },
  { id: "reserva", titulo: "Finiquito con reserva" },
];

const delMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

function Contenidos({ filas: todas, finiquitos: todosFiniquitos, edicion, alCambiar }: {
  filas: NominaOficina[];
  finiquitos: Finiquito[];
  edicion: ReturnType<typeof useEdicion<NominaOficina>>;
  alCambiar: () => void;
}) {
  const [mes, setMes] = useFiltro<string>("personal-oficina:mes", "todos");
  const [estatus, setEstatus] = useFiltro<Estatus>("personal-oficina:estatus", "todos");

  const meses = useMemo(
    () => [...new Set([...todas, ...todosFiniquitos].map((f) => delMes(f.periodo)))].sort().reverse()
      .map((m) => ({ id: m, titulo: mesLargo(m) })),
    [todas, todosFiniquitos],
  );

  // Oficina Central no cuelga de un contrato: el filtro es el período y el estatus.
  const delPeriodo = mes === "todos" ? todas : todas.filter((f) => delMes(f.periodo) === mes);
  const finiquitosDelPeriodo = mes === "todos" ? todosFiniquitos : todosFiniquitos.filter((f) => delMes(f.periodo) === mes);

  const visibles = estatus === "hhExtra"
    ? delPeriodo.filter((f) => f.horas_extra_cantidad > 0 || f.horas_extra_monto > 0)
    : estatus === "finiquitos" || estatus === "reserva" ? [] : delPeriodo;
  const finiquitosVisibles = estatus === "hhExtra" ? []
    : estatus === "reserva" ? finiquitosDelPeriodo.filter((f) => f.conReserva)
    : finiquitosDelPeriodo;

  const suma = (campo: "total_haberes" | "aporte_patronal" | "horas_extra_monto" | "costo_total" | "horas_hombre") =>
    visibles.reduce((t, f) => t + f[campo], 0);
  const costo = suma("costo_total");
  const finiquitos = finiquitosVisibles.reduce((t, f) => t + f.total, 0);
  const conReserva = finiquitosVisibles.filter((f) => f.conReserva);
  const horas = suma("horas_hombre");
  const costoHhExtra = suma("horas_extra_monto");
  const cuando = mes === "todos" ? "Acumulado" : mesLargo(mes);
  // La dotación del último mes es la foto de hoy; sumar meses contaría a la misma persona varias veces.
  const ultimo = visibles.reduce<NominaOficina | null>((u, f) => (u === null || f.periodo > u.periodo ? f : u), null);

  return (
    <>
      <Resumen datos={[
        { etiqueta: "Pago de personal", valor: formatearMonto(costo),
          nota: `${cuando} · haberes ${formatearMonto(suma("total_haberes"))} · aporte patronal ${formatearMonto(suma("aporte_patronal"))} · sin finiquitos` },
        { etiqueta: "Dotación actual", valor: formatearNumero(ultimo?.dotacion ?? 0), nota: ultimo ? `Personas en ${mesLargo(ultimo.periodo)}` : "Sin registro" },
        { etiqueta: "Horas hombre", valor: formatearNumero(horas),
          nota: costoHhExtra > 0 ? `${cuando} · HH extra ${formatearMonto(costoHhExtra)}` : `${cuando}, sin HH extra` },
        { etiqueta: "Finiquitos", valor: formatearMonto(finiquitos),
          nota: `Informativo, no suma al costo · ${finiquitosVisibles.length} ${finiquitosVisibles.length === 1 ? "finiquito" : "finiquitos"}${conReserva.length > 0 ? ` · ${conReserva.length} con reserva de derechos` : ""}`,
          acento: conReserva.length > 0 ? "aviso" : undefined },
      ]} />

      <Panel titulo="Detalle por mes"
        nota={`${visibles.length} de ${todas.length} nóminas · las tarjetas siguen los filtros · costo por HH ${formatearPesos(horas > 0 ? Math.round(costo / horas) : 0)}`}
        filtrosAbajo
        filtros={<>
          <CampoFiltro etiqueta="Período">
            <Desplegable etiqueta="Período" valor={mes} alCambiar={setMes}
              grupos={[{ opciones: [{ id: "todos", titulo: "Todos los meses" }] }, { titulo: "Un mes", opciones: meses }]} />
          </CampoFiltro>
          <CampoFiltro etiqueta="Estatus">
            <Filtro etiqueta="Estatus" opciones={estatusPersonal} valor={estatus} alCambiar={setEstatus} />
          </CampoFiltro>
        </>}>
        <Tabla columnas={columnas(edicion)} filas={visibles} claveDe={(f) => f.id}
          vacio={todas.length === 0 ? "Todavía no hay nóminas de Oficina Central. Crea la primera con «Nueva nómina»."
            : estatus === "finiquitos" || estatus === "reserva" ? "Este estatus solo mira finiquitos (abajo)." : "Ninguna nómina con este filtro."}
          pie={visibles.length > 1 ? <>
            <Total colSpan={2}>Total</Total>
            <Total derecha>{formatearNumero(horas)}</Total>
            <Total derecha>{formatearMonto(suma("total_haberes"))}</Total>
            <Total derecha>{formatearMonto(suma("aporte_patronal"))}</Total>
            <Total derecha>{formatearMonto(costoHhExtra)}</Total>
            <Total derecha>{formatearMonto(costo)}</Total>
            <Total />
          </> : undefined} />
      </Panel>

      <div className="mt-6">
        <PanelFiniquitos de="oficina" filas={finiquitosVisibles} alCambiar={alCambiar} />
      </div>

      {visibles.some((f) => f.horas_extra_cantidad > 0 || f.horas_extra_monto > 0) && (
        <div className="mt-6">
          <Panel titulo="Desglose de horas extra" nota="Motivos, horas y costo, igual que en los contratos.">
            <Tabla filas={visibles.filter((f) => f.horas_extra_cantidad > 0 || f.horas_extra_monto > 0)}
              claveDe={(f) => f.id} columnas={columnasHorasExtra} />
          </Panel>
        </div>
      )}
    </>
  );
}

const columnas = (edicion: ReturnType<typeof useEdicion<NominaOficina>>): Columna<NominaOficina>[] => [
  { clave: "mes", titulo: "Mes", encabezado: true, celda: (f) => <>
    <span className="block whitespace-nowrap font-semibold text-ink">{mesLargo(f.periodo)}</span>
    {f.observaciones && <span className="text-xs text-ink-soft">{f.observaciones}</span>}
  </> },
  { clave: "dotacion", titulo: "Dotación", derecha: true, celda: (f) => <span className="text-ink-soft">{formatearNumero(f.dotacion)}</span> },
  { clave: "hh", titulo: "Horas hombre", derecha: true, celda: (f) => <span className="text-ink-soft">{formatearNumero(f.horas_hombre)}</span> },
  { clave: "haberes", titulo: "Total haberes", derecha: true, celda: (f) => <span className="text-ink-soft">{formatearMonto(f.total_haberes)}</span> },
  { clave: "aporte", titulo: "Aporte patronal", derecha: true, celda: (f) => <span className="text-ink-soft">{formatearMonto(f.aporte_patronal)}</span> },
  { clave: "hhExtra", titulo: "Costo total de las HH extra", derecha: true, celda: (f) => <span className="text-ink-soft">{formatearMonto(f.horas_extra_monto)}</span> },
  { clave: "costo", titulo: "Costo total", derecha: true, celda: (f) => <span className="font-semibold text-ink">{formatearMonto(f.costo_total)}</span> },
  { clave: "acciones", titulo: "", derecha: true, celda: (f) => (
    <AccionesFila permiso={PERMISO}
      alEditar={() => edicion.abrirEdicion(f)}
      alVerHistorial={() => edicion.verHistorial(f.id, `Nómina de ${mesLargo(f.periodo)}`)}
      alVerAdjuntos={() => edicion.verAdjuntos(f.id, `Nómina de ${mesLargo(f.periodo)}`)}
      cuantosAdjuntos={edicion.cuantosAdjuntos(f.id)} />
  ) },
];

const columnasHorasExtra: Columna<NominaOficina>[] = [
  { clave: "mes", titulo: "Mes", encabezado: true, celda: (f) => <span className="font-semibold text-ink">{mesLargo(f.periodo)}</span> },
  ...motivosHhExtra.map((m) => ({
    clave: m.horas,
    titulo: m.corto,
    derecha: true,
    celda: (f: NominaOficina) => <HorasYCosto horas={f[m.horas]} costo={f[m.monto]} />,
  })),
  { clave: "total", titulo: "Total HH extra", derecha: true, celda: (f) => <strong className="text-ink">{formatearNumero(f.horas_extra_cantidad)}</strong> },
  { clave: "costo", titulo: "Costo HH extra", derecha: true, celda: (f) => <strong className="text-ink">{formatearPesos(f.horas_extra_monto)}</strong> },
];

/* ── El formulario: el mismo de los contratos, sin contrato ───────────────── */

const mesActual = () => new Date().toISOString().slice(0, 8) + "01";

type Borrador = Haberes & { periodo: string; dotacion: number; horas_hombre: number; observaciones: string };
const camposHaberes = Object.keys(haberesEnCero) as (keyof Haberes)[];

function FormularioNominaOficina({ registro, nominas, alCerrar, alGuardado }: {
  registro: NominaOficina | null;
  nominas: NominaOficina[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(registro
    ? {
        ...(Object.fromEntries(camposHaberes.map((k) => [k, registro[k]])) as Haberes),
        periodo: registro.periodo, dotacion: registro.dotacion, horas_hombre: registro.horas_hombre,
        observaciones: registro.observaciones ?? "",
      }
    : { ...haberesEnCero, periodo: mesActual(), dotacion: 0, horas_hombre: 0, observaciones: "" });
  const borrado = useBorrado(TABLA, registro?.id, () => { alGuardado(); alCerrar(); });

  const respaldos = useRespaldos("costos_personal", registro ? registro.id : null);
  function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!f.datos.periodo) return f.setError("Elige el mes de la nómina.");
    if (nominas.some((n) => n.periodo === f.datos.periodo && n.id !== registro?.id)) {
      return f.setError(`Ya hay una nómina de ${mesLargo(f.datos.periodo)}. Edítala en vez de crear otra.`);
    }
    const problema = errorDeHaberes(f.datos);
    if (problema) return f.setError(problema);
    const fila = { ...haberesParaGuardar(f.datos), observaciones: f.datos.observaciones.trim() || null };
    f.enviar(async () => {
      if (registro) await actualizar(TABLA, registro.id, fila);
      else void respaldos.subirA(await crearConId(TABLA, fila));
    }, () => { alGuardado(); alCerrar(); });
  }

  return (
    <>
      <Dialogo titulo={registro ? "Editar nómina de Oficina Central" : "Nueva nómina de Oficina Central"} abierto alCerrar={alCerrar}
        descripcion="Los haberes del mes, como vienen en la nómina de pagos. Los totales se calculan solos.">
        <form onSubmit={guardar}>
          <Campos>
            <CampoMes etiqueta="Mes" requerido ayuda="El mes de la nómina que se está cargando." {...f.campo("periodo")} />
            <div />
            <FichaHaberes datos={f.datos} campo={f.campo} horasHombre={f.datos.horas_hombre} antesDeHhExtra={<>
              <CampoNumero etiqueta="Dotación" min={0} sufijo="pers." ayuda="Personas de Oficina Central ese mes." {...f.campo("dotacion")} />
              <CampoNumero etiqueta="HH ordinarias" min={0} sufijo="HH" ayuda="Horas de jornada normal. Las extras van más abajo." {...f.campo("horas_hombre")} />
            </>} />
            <Ancho><CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} /></Ancho>
          </Campos>
          <Pie extra={<SeccionRespaldos respaldos={respaldos} />} error={f.error} guardando={f.guardando} alCancelar={alCerrar}
            textoGuardar={registro ? "Guardar cambios" : "Crear registro"} alEliminar={registro ? borrado.abrir : undefined} />
        </form>
      </Dialogo>
      {registro && (
        <Confirmacion abierto={borrado.confirmando} titulo="Eliminar nómina"
          detalle={`Se eliminará la nómina de ${mesLargo(registro.periodo)} (${formatearPesos(registro.costo_total)} de costo).`}
          error={borrado.error} procesando={borrado.borrando} alCancelar={borrado.cerrar} alConfirmar={borrado.confirmar} />
      )}
    </>
  );
}
