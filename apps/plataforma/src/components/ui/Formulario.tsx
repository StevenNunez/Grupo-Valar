"use client";

import { useEffect, useId, useRef, useState } from "react";
import { eliminar } from "@/lib/crud";
import { formatearPesos } from "@/lib/formato";

/**
 * Piezas de formulario del módulo.
 *
 * Todo pasa por acá para que las seis vistas se editen igual: mismo diálogo,
 * mismos campos, mismo lugar para el error, misma confirmación al borrar.
 */

/* ── Diálogo ──────────────────────────────────────────────────────────────── */

export function Dialogo({
  titulo,
  descripcion,
  abierto,
  alCerrar,
  children,
  ancho = "max-w-2xl",
}: {
  titulo: string;
  descripcion?: string;
  abierto: boolean;
  alCerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  /* Si ya se escribió algo, un clic fuera, Escape o la X no cierran de golpe:
     preguntan. Antes un clic de más en el fondo borraba una OC entera. El
     botón "Cancelar" del pie sí cierra directo: ese es a propósito. */
  const tocado = useRef(false);
  const [confirmando, setConfirmando] = useState(false);
  const intentarCerrar = useRef(() => {});
  useEffect(() => {
    intentarCerrar.current = () => {
      if (tocado.current) setConfirmando(true);
      else alCerrar();
    };
  });

  // Cualquier cosa que se escriba o elija adentro cuenta como cambio.
  useEffect(() => {
    const nodo = caja.current;
    if (!abierto || !nodo) return;
    tocado.current = false;
    const marcar = () => {
      tocado.current = true;
    };
    nodo.addEventListener("input", marcar);
    nodo.addEventListener("change", marcar);
    return () => {
      nodo.removeEventListener("input", marcar);
      nodo.removeEventListener("change", marcar);
    };
  }, [abierto]);

  // Escape cierra, y el fondo no se desplaza mientras el diálogo está abierto.
  useEffect(() => {
    if (!abierto) return;

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Con un diálogo encima (una confirmación), Escape es de ese.
      const dialogos = document.querySelectorAll('[role="dialog"]');
      if (dialogos[dialogos.length - 1] !== caja.current) return;
      intentarCerrar.current();
    };
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";

    // El foco entra al diálogo para que el teclado no se quede atrás.
    caja.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();

    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => intentarCerrar.current()}
        className="fixed inset-0 bg-ink/50 backdrop-blur-sm"
      />

      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative w-full ${ancho} rounded-2xl border border-mist-deep bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist px-6 py-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{titulo}</h2>
            {descripcion && (
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{descripcion}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => intentarCerrar.current()}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 p-2 text-ink-soft transition-colors hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {confirmando && (
          <div
            role="alertdialog"
            aria-label="Descartar cambios"
            className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#f1d9a8] bg-[#fdf4e6] px-6 py-3"
          >
            <p className="text-sm font-medium text-[#8a5a09]">
              Tienes cambios sin guardar. ¿Cerrar y perderlos?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmando(false)}
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmando(false);
                  alCerrar();
                }}
                className="rounded-full border border-[#a52f24]/40 px-4 py-1.5 text-xs font-semibold text-[#a52f24] hover:bg-[#fdeeec]"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

/* ── Campos ───────────────────────────────────────────────────────────────── */

const claseCampo =
  "w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20 disabled:bg-mist/50 disabled:text-ink-soft";

function Envoltura({
  id,
  etiqueta,
  ayuda,
  requerido,
  children,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft"
      >
        {etiqueta}
        {requerido && <span className="ml-1 text-cyan-deep">*</span>}
      </label>
      <div className="mt-2">{children}</div>
      {ayuda && <p className="mt-1.5 text-xs text-ink-soft">{ayuda}</p>}
    </div>
  );
}

export function CampoTexto({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  requerido,
  deshabilitado,
  marcador,
  sugerencias,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  ayuda?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
  marcador?: string;
  /** Lo que se ofrece al escribir; igual se puede poner cualquier otra cosa. */
  sugerencias?: string[];
}) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} requerido={requerido}>
      {sugerencias && sugerencias.length > 0 && (
        <datalist id={`${id}-sugerencias`}>
          {sugerencias.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      <input
        id={id}
        type="text"
        list={sugerencias && sugerencias.length > 0 ? `${id}-sugerencias` : undefined}
        value={valor}
        required={requerido}
        disabled={deshabilitado}
        placeholder={marcador}
        onChange={(e) => alCambiar(e.target.value)}
        className={claseCampo}
      />
    </Envoltura>
  );
}

/**
 * Campo de dinero: se escribe en pesos y se muestra con separadores de miles
 * mientras se escribe, porque un monto de nueve dígitos sin puntos es
 * imposible de revisar de un vistazo.
 */
export function CampoDinero({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  requerido,
}: {
  etiqueta: string;
  valor: number;
  alCambiar: (v: number) => void;
  ayuda?: string;
  requerido?: boolean;
}) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} requerido={requerido}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-soft">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          required={requerido}
          value={valor === 0 ? "" : valor.toLocaleString("es-CL")}
          placeholder="0"
          onChange={(e) => {
            const limpio = e.target.value.replace(/\D/g, "");
            alCambiar(limpio === "" ? 0 : Number(limpio));
          }}
          className={`${claseCampo} pl-8 tabular-nums`}
        />
      </div>
    </Envoltura>
  );
}

export function CampoNumero({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  requerido,
  min,
  max,
  sufijo,
}: {
  etiqueta: string;
  valor: number;
  alCambiar: (v: number) => void;
  ayuda?: string;
  requerido?: boolean;
  min?: number;
  max?: number;
  sufijo?: string;
}) {
  const id = useId();
  const [enFoco, setEnFoco] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [tocado, setTocado] = useState(false);
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} requerido={requerido}>
      <div className="relative">
        <input
          id={id}
          type="number"
          value={enFoco ? borrador : Number.isFinite(valor) && (valor !== 0 || tocado) ? valor : ""}
          required={requerido}
          min={min}
          max={max}
          step="any"
          onFocus={() => {
            setBorrador(valor === 0 && !tocado ? "" : String(valor));
            setEnFoco(true);
          }}
          onBlur={() => setEnFoco(false)}
          onChange={(e) => {
            const texto = e.target.value;
            setBorrador(texto);
            setTocado(texto !== "");
            alCambiar(texto === "" ? 0 : Number(texto));
          }}
          className={`${claseCampo} tabular-nums ${sufijo ? "pr-12" : ""}`}
        />
        {sufijo && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-ink-soft">
            {sufijo}
          </span>
        )}
      </div>
    </Envoltura>
  );
}

export function CampoFecha({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  requerido,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  ayuda?: string;
  requerido?: boolean;
}) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} requerido={requerido}>
      <input
        id={id}
        type="date"
        value={valor ?? ""}
        required={requerido}
        onChange={(e) => alCambiar(e.target.value)}
        className={claseCampo}
      />
    </Envoltura>
  );
}

/**
 * Un mes, guardado como el día 1.
 *
 * Control de Gestión trabaja por mes —los egresos se cargan mensuales porque el
 * resultado se calcula por mes—, y pedir un día exacto invita a poner el 17 y
 * después preguntarse a qué mes pertenece. El input de mes no tiene esa duda.
 */
export function CampoMes({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  requerido,
}: {
  etiqueta: string;
  /** ISO completo: "2026-09-01". */
  valor: string;
  alCambiar: (v: string) => void;
  ayuda?: string;
  requerido?: boolean;
}) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} requerido={requerido}>
      <input
        id={id}
        type="month"
        value={(valor ?? "").slice(0, 7)}
        required={requerido}
        onChange={(e) => alCambiar(e.target.value ? `${e.target.value}-01` : "")}
        className={claseCampo}
      />
    </Envoltura>
  );
}

export function CampoSeleccion<T extends string>({
  etiqueta,
  valor,
  opciones,
  alCambiar,
  ayuda,
  requerido,
}: {
  etiqueta: string;
  valor: T;
  opciones: { id: T; titulo: string }[];
  alCambiar: (v: T) => void;
  ayuda?: string;
  requerido?: boolean;
}) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} requerido={requerido}>
      <select
        id={id}
        value={valor}
        required={requerido}
        onChange={(e) => alCambiar(e.target.value as T)}
        className={claseCampo}
      >
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.titulo}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

/* ── Cuerpo y pie del formulario ──────────────────────────────────────────── */

export function Campos({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">{children}</div>;
}

/** Ocupa el ancho completo de la rejilla de dos columnas. */
export function Ancho({ children }: { children: React.ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}

/* ── IVA ──────────────────────────────────────────────────────────────────── */

/** El IVA en Chile. */
export const TASA_IVA = 0.19;

/** El IVA de un neto: el 19%, redondeado al peso. Exento, cero. */
export const ivaDe = (neto: number, afecto = true) => (afecto ? Math.round(neto * TASA_IVA) : 0);

/**
 * El IVA y el total de un neto. No se escribe: basta con el neto. La casilla
 * es para lo que no lleva IVA (exentos, boletas de honorarios); si no se pasa
 * `alCambiarAfecto`, el documento siempre es afecto.
 */
export function ResumenIva({
  neto,
  afecto = true,
  alCambiarAfecto,
  nota,
}: {
  neto: number;
  afecto?: boolean;
  alCambiarAfecto?: (afecto: boolean) => void;
  /** Por qué es o no afecto, cuando no lo decide la casilla (la categoría, por ejemplo). */
  nota?: string;
}) {
  const iva = ivaDe(neto, afecto);
  return (
    <Ancho>
      <div className="flex flex-col gap-3 rounded-xl bg-mist/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-ink-soft">
          <p>
            {afecto ? "IVA 19%" : "Sin IVA"}{" "}
            <strong className="tabular-nums text-ink">{formatearPesos(iva)}</strong>
            {" · "}Total <strong className="tabular-nums text-ink">{formatearPesos(neto + iva)}</strong>
          </p>
          <p className="mt-0.5 text-xs">{nota ?? "Se calcula solo con el neto."}</p>
        </div>
        {alCambiarAfecto && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={!afecto}
              onChange={(e) => alCambiarAfecto(!e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-mist-deep accent-cyan"
            />
            Exento o boleta (sin IVA)
          </label>
        )}
      </div>
    </Ancho>
  );
}

export function Pie({
  error,
  guardando,
  alCancelar,
  textoGuardar = "Guardar",
  alEliminar,
}: {
  error: string | null;
  guardando: boolean;
  alCancelar: () => void;
  textoGuardar?: string;
  alEliminar?: () => void;
}) {
  return (
    <div className="border-t border-mist px-6 py-5">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {alEliminar && (
          <button
            type="button"
            onClick={alEliminar}
            disabled={guardando}
            className="mr-auto rounded-full px-4 py-2.5 text-sm font-semibold text-[#a52f24] transition-colors hover:bg-[#fdeeec] disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
        <button
          type="button"
          onClick={alCancelar}
          disabled={guardando}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70"
        >
          {guardando ? "Guardando…" : textoGuardar}
        </button>
      </div>
    </div>
  );
}

/* ── Confirmación de borrado ──────────────────────────────────────────────── */

export function Confirmacion({
  abierto,
  titulo,
  detalle,
  error,
  procesando,
  deshabilitado = false,
  alCancelar,
  alConfirmar,
}: {
  abierto: boolean;
  titulo: string;
  detalle: string;
  error: string | null;
  procesando: boolean;
  deshabilitado?: boolean;
  alCancelar: () => void;
  alConfirmar: () => void;
}) {
  return (
    <Dialogo titulo={titulo} abierto={abierto} alCerrar={alCancelar} ancho="max-w-md">
      <div className="px-6 py-6">
        <p className="text-sm leading-relaxed text-ink-soft">{detalle}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Queda registrado en la bitácora quién lo borró y cuándo, con una copia del registro
          completo.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-mist px-6 py-5">
        <button
          type="button"
          onClick={alCancelar}
          disabled={procesando}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={alConfirmar}
          disabled={procesando || deshabilitado}
          className="rounded-full bg-[#a52f24] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8a2820] disabled:cursor-wait disabled:opacity-70"
        >
          {procesando ? "Eliminando…" : "Sí, eliminar"}
        </button>
      </div>
    </Dialogo>
  );
}

/* ── Estado de un formulario ──────────────────────────────────────────────── */

/** Guarda el borrador, el error y el "guardando" de cualquier formulario. */
export function useFormulario<T extends object>(inicial: T) {
  const [datos, setDatos] = useState<T>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /* Cambiar un campo sin pasar por su control: sirve cuando escribir uno llena
     otro —el neto que calcula el IVA, el proveedor que copia su razón social—. */
  const cambiar = <K extends keyof T>(clave: K, valor: T[K]) =>
    setDatos((d) => ({ ...d, [clave]: valor }));

  const campo = <K extends keyof T>(clave: K) => ({
    valor: datos[clave],
    alCambiar: (v: T[K]) => cambiar(clave, v),
  });

  async function enviar(accion: () => Promise<void>, alTerminar: () => void) {
    setError(null);
    setGuardando(true);
    try {
      await accion();
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return {
    datos,
    setDatos,
    cambiar,
    campo,
    error,
    setError,
    guardando,
    enviar,
    reiniciar: () => setDatos(inicial),
  };
}

/** Confirmación y borrado de un registro. Mismo flujo en las seis vistas. */
export function useBorrado(tabla: string, id: string | undefined, alHecho: () => void) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function confirmar() {
    if (!id) return;
    setError(null);
    setBorrando(true);
    try {
      await eliminar(tabla, id);
      alHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(false);
    }
  }

  return {
    confirmando,
    abrir: () => setConfirmando(true),
    cerrar: () => setConfirmando(false),
    error,
    borrando,
    confirmar,
  };
}
