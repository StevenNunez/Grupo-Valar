"use client";

import { useCallback, useEffect, useState } from "react";
import { BotonAdjuntos } from "./Adjuntos";
import { Dialogo } from "./Formulario";
import { useConsulta } from "@/lib/consulta";
import { contarAdjuntos } from "@/lib/adjuntos";
import { cargarHistorial, type Accion, type Movimiento } from "@/lib/auditoria";
import { formatearNumero } from "@/lib/formato";
import { usePuede } from "@/lib/sesion";

/**
 * Historial de un registro: quién lo creó, quién lo tocó y qué cambió.
 *
 * Se lee de la bitácora que escriben los triggers de la base, así que muestra
 * también los cambios hechos fuera de la aplicación.
 */

const acciones: Record<Accion, { titulo: string; color: string }> = {
  creado: { titulo: "Creó el registro", color: "bg-[#0e7a4f]" },
  modificado: { titulo: "Modificó", color: "bg-cyan-deep" },
  eliminado: { titulo: "Eliminó el registro", color: "bg-[#a52f24]" },
};

/** Nombres de columna en algo que se pueda leer. */
const nombres: Record<string, string> = {
  monto_neto: "monto neto",
  costo_real: "costo real",
  avance_periodo: "avance del período",
  fecha_presentacion: "fecha de presentación",
  fecha_aprobacion: "fecha de aprobación",
  fecha_emision: "fecha de emisión",
  monto_autorizado: "monto autorizado",
  estado_cobro: "estado de cobro",
  estado_pago: "estado de pago",
  horas_hombre: "HH ordinarias",
  horas_extra_cantidad: "N° de horas extraordinarias",
  sueldo_bruto: "sueldo bruto",
  horas_extra_monto: "total HH extra",
  hh_reemplazo: "HH extra por reemplazo",
  hh_parada_planta: "HH extra por parada de planta",
  hh_feriado_compensado: "HH extra por feriado compensado",
  hh_apoyo_oficina: "HH extra por apoyo oficina",
  hh_otras: "otras HH extra",
  monto_hh_reemplazo: "costo HH extra por reemplazo",
  monto_hh_parada_planta: "costo HH extra por parada de planta",
  monto_hh_feriado_compensado: "costo HH extra por feriado compensado",
  monto_hh_apoyo_oficina: "costo HH extra por apoyo oficina",
  monto_hh_otras: "costo de otras HH extra",
  total_no_imponible: "total no imponible",
  otros_haberes: "otros haberes",
  remuneraciones: "total haberes",
  leyes_sociales: "leyes sociales",
  indemnizacion_anios: "indemnización por años de servicio",
  indemnizacion_aviso: "indemnización sustitutiva del aviso previo",
  feriado_proporcional: "feriado proporcional",
  otros_montos: "otros montos",
  fecha_pago: "fecha de pago",
  con_reserva: "firmó con reserva de derechos",
  reserva_detalle: "qué se reservó",
  contrato_id: "contrato",
  estado_pago_id: "estado de pago",
  dias_sin_accidentes: "días sin accidentes",
  hh_acumuladas: "HH acumuladas",
  ultima_auditoria: "última auditoría",
};

function nombreDe(campo: string) {
  return nombres[campo] ?? campo.replace(/_/g, " ");
}

function mostrar(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "number") return formatearNumero(valor);
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  return String(valor);
}

function cuando(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DialogoHistorial({
  tabla,
  registroId,
  titulo,
  abierto,
  alCerrar,
}: {
  tabla: string;
  registroId: string;
  titulo: string;
  abierto: boolean;
  alCerrar: () => void;
}) {
  if (!abierto) return null;

  return (
    <Dialogo
      titulo="Historial del registro"
      descripcion={titulo}
      abierto={abierto}
      alCerrar={alCerrar}
    >
      <Contenido tabla={tabla} registroId={registroId} />
    </Dialogo>
  );
}

function Contenido({ tabla, registroId }: { tabla: string; registroId: string }) {
  const { estado } = useConsulta<Movimiento[]>(() => cargarHistorial(tabla, registroId));

  if (estado.estado === "cargando") {
    return <p className="px-6 py-10 text-center text-sm text-ink-soft">Cargando historial…</p>;
  }

  if (estado.estado === "error") {
    return (
      <p role="alert" className="px-6 py-10 text-center text-sm text-[#a52f24]">
        No se pudo leer el historial: {estado.mensaje}
      </p>
    );
  }

  if (estado.datos.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-ink-soft">
        Sin movimientos registrados. La bitácora empieza a grabar desde que el registro se crea o se
        edita en la plataforma.
      </p>
    );
  }

  return (
    <ol className="max-h-[26rem] overflow-y-auto px-6 py-6">
      {estado.datos.map((m, i) => (
        <li key={m.id} className="relative flex gap-4 pb-6 last:pb-0">
          {/* Línea de tiempo: el hilo se corta en el último. */}
          {i < estado.datos.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[7px] top-5 h-full w-px bg-mist-deep"
            />
          )}
          <span
            aria-hidden="true"
            className={`mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-white ${acciones[m.accion].color}`}
          />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{acciones[m.accion].titulo}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {m.usuario} · {cuando(m.ocurridoEn)}
            </p>

            {m.cambios.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {m.cambios.map((c) => (
                  <li key={c.campo} className="text-sm">
                    <span className="text-ink-soft">{nombreDe(c.campo)}: </span>
                    <span className="text-ink-soft line-through">{mostrar(c.antes)}</span>
                    <span className="mx-1.5 text-ink-soft">→</span>
                    <span className="font-semibold text-ink">{mostrar(c.despues)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Botones de fila ──────────────────────────────────────────────────────── */

export function AccionesFila({
  alEditar,
  alVerHistorial,
  alVerAdjuntos,
  cuantosAdjuntos,
  permiso,
}: {
  alEditar: () => void;
  /** El permiso para editar. Sin él no aparece el lápiz; el historial y los
      respaldos se siguen viendo. Si no se pasa, el lápiz va siempre. */
  permiso?: string;
  alVerHistorial: () => void;
  /** Solo aparece el clip en las vistas que pasan esto. */
  alVerAdjuntos?: () => void;
  cuantosAdjuntos?: number;
}) {
  const puedeEditar = usePuede(permiso ?? "");
  const conLapiz = !permiso || puedeEditar;

  return (
    <div className="flex items-center justify-end gap-1">
      {alVerAdjuntos && <BotonAdjuntos cuantos={cuantosAdjuntos} onClick={alVerAdjuntos} />}
      <button
        type="button"
        onClick={alVerHistorial}
        aria-label="Ver historial"
        title="Ver historial"
        className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {conLapiz && (
        <button
          type="button"
          onClick={alEditar}
          aria-label="Editar"
          title="Editar"
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Botón "Nuevo" del encabezado de cada vista. */
export function BotonNuevo({
  onClick,
  children,
  permiso,
}: {
  onClick: () => void;
  children: React.ReactNode;
  /** El permiso para crear. Sin él, el botón no aparece. */
  permiso?: string;
}) {
  const puedeCrear = usePuede(permiso ?? "");
  if (permiso && !puedeCrear) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
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

/**
 * Estado de "qué estoy editando": una fila, una nueva, o nada.
 *
 * Con el nombre de la tabla además cuenta los respaldos de cada registro, para
 * que el clip de la fila muestre cuántos documentos tiene. Es una sola consulta
 * por vista, no una por fila.
 */
export function useEdicion<T>(tabla?: string) {
  const [editando, setEditando] = useState<T | "nuevo" | null>(null);
  const [historial, setHistorial] = useState<{ id: string; titulo: string } | null>(null);
  const [adjuntos, setAdjuntos] = useState<{ id: string; titulo: string } | null>(null);
  const [cuentas, setCuentas] = useState<Map<string, number>>(new Map());

  const contar = useCallback(() => {
    if (!tabla) return;
    // Si falla, se queda sin número: el clip sigue abriendo los respaldos.
    contarAdjuntos(tabla)
      .then(setCuentas)
      .catch(() => undefined);
  }, [tabla]);

  useEffect(contar, [contar]);

  return {
    editando,
    esNuevo: editando === "nuevo",
    registro: editando === "nuevo" || editando === null ? null : editando,
    abrirNuevo: () => setEditando("nuevo"),
    abrirEdicion: (fila: T) => setEditando(fila),
    cerrar: () => setEditando(null),
    historial,
    verHistorial: (id: string, titulo: string) => setHistorial({ id, titulo }),
    cerrarHistorial: () => setHistorial(null),
    adjuntos,
    verAdjuntos: (id: string, titulo: string) => setAdjuntos({ id, titulo }),
    cerrarAdjuntos: () => setAdjuntos(null),
    cuantosAdjuntos: (id: string) => cuentas.get(id),
    recontarAdjuntos: contar,
  };
}
