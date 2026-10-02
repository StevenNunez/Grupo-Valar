"use client";

import { useState } from "react";
import { Chip, type Tono } from "./ui/Chip";
import {
  CampoFecha,
  CampoSeleccion,
  CampoTexto,
  CampoDinero,
  CampoNumero,
  Campos,
  Ancho,
  Dialogo,
  Pie,
  useFormulario,
} from "./ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import {
  cargarAnexos,
  estadosAnexo,
  idDeAnexo,
  montoConSigno,
  nombreTipoAnexo,
  siguienteNumeroAnexo,
  tiposAnexo,
  type Anexo,
  type EstadoAnexo,
  type TipoAnexo,
} from "@/lib/anexos";
import type { Contrato } from "@/lib/control-de-gestion";
import { actualizar, crear } from "@/lib/crud";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { usePuede } from "@/lib/sesion";

/**
 * Los anexos de un contrato.
 *
 * El contrato original no se toca: acá se registra lo que lo modificó, y el
 * monto y el plazo vigentes se calculan sumando. Así se puede responder las dos
 * preguntas que llegan juntas: cuál era el trato y en qué quedó.
 */

const tonos: Record<EstadoAnexo, Tono> = {
  borrador: "aviso",
  vigente: "bueno",
  anulado: "neutro",
};

export function AnexosDelContrato({
  contrato,
  alCerrar,
  alCambiar,
}: {
  contrato: Contrato;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const { estado, recargar } = useConsulta<Anexo[]>(() => cargarAnexos(contrato.id));
  const [editando, setEditando] = useState<Anexo | "nuevo" | null>(null);

  return (
    <>
      <Dialogo
        titulo="Anexos del contrato"
        descripcion={`${contrato.id} · ${contrato.nombre}`}
        abierto
        alCerrar={alCerrar}
        ancho="max-w-3xl"
      >
        {estado.estado === "cargando" && (
          <p className="px-6 py-12 text-center text-sm text-ink-soft">Cargando…</p>
        )}

        {estado.estado === "error" && (
          <p role="alert" className="px-6 py-12 text-center text-sm text-[#a52f24]">
            {estado.mensaje}
          </p>
        )}

        {estado.estado === "listo" && (
          <Lista
            contrato={contrato}
            anexos={estado.datos}
            alNuevo={() => setEditando("nuevo")}
            alEditar={setEditando}
          />
        )}
      </Dialogo>

      {editando && estado.estado === "listo" && (
        <FormularioAnexo
          contrato={contrato}
          anexo={editando === "nuevo" ? null : editando}
          existentes={estado.datos}
          alCerrar={() => setEditando(null)}
          alGuardado={() => {
            recargar();
            alCambiar();
          }}
        />
      )}
    </>
  );
}

function Lista({
  contrato,
  anexos,
  alNuevo,
  alEditar,
}: {
  contrato: Contrato;
  anexos: Anexo[];
  alNuevo: () => void;
  alEditar: (a: Anexo) => void;
}) {
  // Ver los anexos es de quien ve contratos; crearlos y corregirlos, de quien los administra.
  const puedeEditar = usePuede("contratos.editar");
  const vigentes = anexos.filter((a) => a.estado === "vigente");
  const montoVigente = vigentes.reduce((t, a) => t + a.monto, 0);
  const diasVigentes = vigentes.reduce((t, a) => t + a.diasPlazo, 0);

  return (
    <div className="px-6 py-6">
      {/* Qué era y en qué quedó */}
      <div className="grid gap-4 rounded-xl border border-mist-deep bg-mist/30 p-5 sm:grid-cols-3">
        <Dato
          etiqueta="Contrato original"
          valor={contrato.presupuesto ? formatearPesos(contrato.presupuesto) : "Sin monto total"}
          nota={`Término ${formatearFecha(contrato.termino)}`}
        />
        <Dato
          etiqueta={vigentes.length === 1 ? "1 anexo vigente" : `${vigentes.length} anexos vigentes`}
          valor={
            montoVigente === 0
              ? "Sin efecto en el monto"
              : `${montoVigente > 0 ? "+" : "−"}${formatearPesos(Math.abs(montoVigente))}`
          }
          nota={
            diasVigentes === 0
              ? "Sin cambio de plazo"
              : `${diasVigentes > 0 ? "+" : ""}${diasVigentes} días de plazo`
          }
        />
        <Dato
          etiqueta="Vigente hoy"
          valor={contrato.montoVigente === null ? "Sin monto total" : formatearPesos(contrato.montoVigente)}
          nota={`Término ${formatearFecha(contrato.terminoVigente)}`}
          destacado
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">
          {anexos.length === 0
            ? "El contrato no tiene modificaciones registradas."
            : `${anexos.length} ${anexos.length === 1 ? "anexo" : "anexos"}.`}
        </p>
        {puedeEditar && (
        <button
          type="button"
          onClick={alNuevo}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Nuevo anexo
        </button>
        )}
      </div>

      {anexos.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {anexos.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => alEditar(a)}
                disabled={!puedeEditar}
                className="flex w-full items-start justify-between gap-4 rounded-xl border border-mist px-4 py-3 text-left transition-colors hover:border-ink disabled:cursor-default disabled:hover:border-mist"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    N° {a.numero} · {nombreTipoAnexo[a.tipo]}
                    {a.documento ? ` · ${a.documento}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">{a.descripcion}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {formatearFecha(a.fecha)}
                    {a.diasPlazo !== 0 ? ` · ${a.diasPlazo > 0 ? "+" : ""}${a.diasPlazo} días` : ""}
                    {a.nuevaFechaTermino
                      ? ` · nuevo término ${formatearFecha(a.nuevaFechaTermino)}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {a.monto !== 0 && (
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        a.monto < 0 ? "text-[#a52f24]" : "text-ink"
                      }`}
                    >
                      {a.monto > 0 ? "+" : "−"}
                      {formatearPesos(Math.abs(a.monto))}
                    </p>
                  )}
                  <span className="mt-1 inline-block">
                    <Chip tono={tonos[a.estado]}>
                      {estadosAnexo.find((e) => e.id === a.estado)?.titulo ?? a.estado}
                    </Chip>
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-soft">
        Solo los anexos <strong className="text-ink-soft">vigentes</strong> mueven el monto
        y el plazo. Los que quedan en negociación o anulados se conservan igual: saber qué
        se pidió y no prosperó también sirve.
      </p>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  nota,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  destacado?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {etiqueta}
      </p>
      <p
        className={`mt-1.5 font-display font-semibold tabular-nums ${
          destacado ? "text-lg text-ink" : "text-base text-ink-soft"
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{nota}</p>
    </div>
  );
}

/* ── El formulario ────────────────────────────────────────────────────────── */

type Borrador = {
  numero: number;
  tipo: TipoAnexo;
  descripcion: string;
  monto: number;
  dias_plazo: number;
  nueva_fecha_termino: string;
  fecha: string;
  documento: string;
  estado: EstadoAnexo;
  observaciones: string;
};

function FormularioAnexo({
  contrato,
  anexo,
  existentes,
  alCerrar,
  alGuardado,
}: {
  contrato: Contrato;
  anexo: Anexo | null;
  existentes: Anexo[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const editando = anexo !== null;

  const f = useFormulario<Borrador>(
    anexo
      ? {
          numero: anexo.numero,
          tipo: anexo.tipo,
          descripcion: anexo.descripcion,
          // En pantalla el monto va siempre positivo; el signo lo pone el tipo.
          monto: Math.abs(anexo.monto),
          dias_plazo: anexo.diasPlazo,
          nueva_fecha_termino: anexo.nuevaFechaTermino ?? "",
          fecha: anexo.fecha,
          documento: anexo.documento ?? "",
          estado: anexo.estado,
          observaciones: anexo.observaciones ?? "",
        }
      : {
          numero: siguienteNumeroAnexo(existentes),
          tipo: "mayor_obra",
          descripcion: "",
          monto: 0,
          dias_plazo: 0,
          nueva_fecha_termino: "",
          fecha: new Date().toISOString().slice(0, 10),
          documento: "",
          estado: "vigente",
          observaciones: "",
        },
  );

  const ayudaTipo = tiposAnexo.find((t) => t.id === f.datos.tipo)?.ayuda ?? "";
  const esPlazo = f.datos.tipo === "extension_plazo";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = f.datos;

    const fila = {
      contrato_id: contrato.id,
      numero: d.numero,
      tipo: d.tipo,
      descripcion: d.descripcion.trim(),
      monto: montoConSigno(d.tipo, d.monto),
      dias_plazo: d.dias_plazo,
      nueva_fecha_termino: d.nueva_fecha_termino || null,
      fecha: d.fecha,
      documento: d.documento.trim() || null,
      estado: d.estado,
      observaciones: d.observaciones.trim() || null,
    };

    f.enviar(
      () =>
        editando
          ? actualizar("anexos", anexo.id, fila)
          : crear("anexos", { ...fila, id: idDeAnexo(contrato.id, d.numero) }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <Dialogo
      titulo={editando ? `Anexo N° ${anexo.numero}` : "Nuevo anexo"}
      descripcion={
        editando
          ? "El contrato original no cambia: lo que cambia es lo que este anexo le suma o le resta."
          : `${contrato.id} · lo que modifica el contrato original, sin editarlo.`
      }
      abierto
      alCerrar={alCerrar}
    >
      <form onSubmit={onSubmit}>
        <Campos>
          <CampoNumero
            etiqueta="N°"
            requerido
            min={1}
            ayuda="Correlativo dentro del contrato."
            {...f.campo("numero")}
          />

          <CampoSeleccion
            etiqueta="Tipo"
            requerido
            opciones={tiposAnexo}
            ayuda={ayudaTipo}
            {...f.campo("tipo")}
          />

          <Ancho>
            <CampoTexto
              etiqueta="Descripción"
              requerido
              marcador="Ampliación del alcance a la planta de cal, turno B"
              {...f.campo("descripcion")}
            />
          </Ancho>

          <CampoDinero
            etiqueta={f.datos.tipo === "menor_obra" ? "Monto que se descuenta" : "Monto que se agrega"}
            ayuda={
              f.datos.tipo === "menor_obra"
                ? "Escríbelo positivo: se guarda como resta."
                : "Déjalo en cero si el anexo no mueve el monto."
            }
            {...f.campo("monto")}
          />

          <CampoNumero
            etiqueta="Días de plazo"
            ayuda="Puede ser negativo si el plazo se acorta."
            {...f.campo("dias_plazo")}
          />

          <CampoFecha
            etiqueta="Nueva fecha de término"
            ayuda={
              esPlazo
                ? "Si el anexo fija una fecha, manda esta por sobre los días."
                : "Solo si el anexo fija una fecha nueva."
            }
            {...f.campo("nueva_fecha_termino")}
          />

          <CampoFecha etiqueta="Fecha de firma" requerido {...f.campo("fecha")} />

          <CampoTexto
            etiqueta="Documento"
            marcador="Anexo N°2 SA 9500016393"
            ayuda="El número con que el mandante lo identifica."
            {...f.campo("documento")}
          />

          <CampoSeleccion
            etiqueta="Estado"
            requerido
            opciones={estadosAnexo}
            ayuda="Solo los vigentes mueven el monto y el plazo del contrato."
            {...f.campo("estado")}
          />

          <Ancho>
            <CampoTexto
              etiqueta="Observaciones"
              marcador="Se acordó en reunión del 12 de agosto con el ADC."
              {...f.campo("observaciones")}
            />
          </Ancho>
        </Campos>

        <Pie
          error={f.error}
          guardando={f.guardando}
          alCancelar={alCerrar}
          textoGuardar={editando ? "Guardar cambios" : "Crear anexo"}
        />
      </form>
    </Dialogo>
  );
}
