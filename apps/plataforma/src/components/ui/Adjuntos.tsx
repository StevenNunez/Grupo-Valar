"use client";

import { useRef, useState } from "react";
import { Confirmacion, Dialogo } from "./Formulario";
import { useConsulta } from "@/lib/consulta";
import { puede, useUsuario } from "@/lib/sesion";

/**
 * Qué permiso deja subir o borrar respaldos de cada ficha: el mismo que deja
 * editarla. Basta uno de la lista. La base lo vuelve a revisar al guardar
 * (`ve_registro` en la 0043); esto solo evita ofrecer lo que va a fallar.
 */
const permisoParaAdjuntar: Record<string, string[]> = {
  contratos: ["contratos.editar"],
  estados_pago: ["gestion.editar"],
  ordenes_compra: ["gestion.editar"],
  facturas: ["gestion.editar"],
  compras: ["gestion.editar", "pagos.programar", "pagos.marcar"],
  servicios: ["gestion.editar"],
  costos_personal: ["personal.editar"],
  egresos_oficina_central: ["gestion.editar"],
  garantias: ["gestion.editar"],
  finiquitos: ["personal.editar"],
  solped: ["solped.crear", "solped.aprobar", "cotizacion.gestionar"],
  ordenes_compra_proveedor: ["ordenes.emitir", "recepcion.registrar"],
  proveedores: ["proveedores.editar"],
  articulos: ["articulos.editar"],
};
import {
  borrarAdjunto,
  claseDe,
  enlaceDeAdjunto,
  formatearPeso,
  cargarAdjuntos,
  subirAdjunto,
  TIPOS_ACEPTADOS,
  type Adjunto,
} from "@/lib/adjuntos";

/**
 * Los documentos de respaldo de un registro.
 *
 * Es la otra mitad de la digitalización: el número vive en la plataforma y el
 * papel que lo respalda —la factura, la planilla de sueldos, el estado de pago
 * que mandó el mandante— se sube acá y queda colgado de ese registro. Excel,
 * Word, PDF o una foto de la faena.
 *
 * El archivo se guarda en un bucket privado: para abrirlo se pide un enlace
 * firmado que dura una hora, con la sesión de quien está mirando. No hay URL
 * pública que se pueda pasar por fuera.
 */

const iconos: Record<ReturnType<typeof claseDe>, { color: string; etiqueta: string }> = {
  pdf: { color: "bg-[#a52f24]", etiqueta: "PDF" },
  excel: { color: "bg-[#0e7a4f]", etiqueta: "XLS" },
  word: { color: "bg-cyan-deep", etiqueta: "DOC" },
  imagen: { color: "bg-ink-soft", etiqueta: "IMG" },
  archivo: { color: "bg-ink-soft", etiqueta: "ARC" },
};

function cuando(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DialogoAdjuntos({
  tabla,
  registroId,
  titulo,
  abierto,
  alCerrar,
  alCambiar,
}: {
  tabla: string;
  registroId: string;
  titulo: string;
  abierto: boolean;
  alCerrar: () => void;
  /** Para que la vista actualice el contador del clip en la fila. */
  alCambiar?: () => void;
}) {
  if (!abierto) return null;

  return (
    <Dialogo titulo="Respaldos del registro" descripcion={titulo} abierto alCerrar={alCerrar}>
      <Contenido tabla={tabla} registroId={registroId} alCambiar={alCambiar} alCerrar={alCerrar} />
    </Dialogo>
  );
}

function Contenido({
  tabla,
  registroId,
  alCambiar,
  alCerrar,
}: {
  tabla: string;
  registroId: string;
  alCambiar?: () => void;
  alCerrar: () => void;
}) {
  const { estado, recargar } = useConsulta<Adjunto[]>(() => cargarAdjuntos(tabla, registroId));
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<Adjunto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  /* Lo elegido queda EN ESPERA hasta apretar «Guardar»: se ve qué se va a subir,
     se puede quitar un archivo equivocado y recién ahí se manda. Antes subía en
     cuanto se elegía, sin dar chance de revisar ni botón que confirmara. */
  const [porSubir, setPorSubir] = useState<File[]>([]);
  const entrada = useRef<HTMLInputElement>(null);
  const usuario = useUsuario();
  const puedeEscribir = (permisoParaAdjuntar[tabla] ?? []).some((p) => puede(usuario, p));

  function agregar(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setError(null);
    setPorSubir((previos) => {
      const yaEstan = new Set(previos.map((a) => `${a.name}:${a.size}`));
      return [...previos, ...Array.from(archivos).filter((a) => !yaEstan.has(`${a.name}:${a.size}`))];
    });
    if (entrada.current) entrada.current.value = "";
  }

  async function guardar() {
    if (porSubir.length === 0) return;

    setError(null);
    setSubiendo(true);
    const pendientes = [...porSubir];
    try {
      // De a uno y en orden: si el tercero falla, los dos primeros ya están
      // guardados, salen de la lista y quedan en espera el que falló y los que siguen.
      while (pendientes.length > 0) {
        await subirAdjunto({ tabla, registroId, archivo: pendientes[0] });
        pendientes.shift();
        setPorSubir([...pendientes]);
      }
      recargar();
      alCambiar?.();
    } catch (e) {
      setError(
        `${pendientes[0] ? `No se pudo subir «${pendientes[0].name}»: ` : ""}${e instanceof Error ? e.message : String(e)}`,
      );
      recargar();
      alCambiar?.();
    } finally {
      setSubiendo(false);
    }
  }

  async function abrir(adjunto: Adjunto, descargar: boolean) {
    setError(null);
    try {
      const url = await enlaceDeAdjunto(adjunto, descargar);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmarBorrado() {
    if (!porBorrar) return;
    setBorrando(true);
    setError(null);
    try {
      await borrarAdjunto(porBorrar);
      setPorBorrar(null);
      recargar();
      alCambiar?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <>
      <div className="px-6 py-6">
        {/* Zona de carga. Sin permiso de escritura sobre la ficha, los
            respaldos se abren y se descargan, pero no se suben ni se borran. */}
        {!puedeEscribir ? (
          <p className="rounded-xl bg-mist/40 px-4 py-3 text-sm text-ink-soft">
            Puedes abrir y descargar los respaldos. Para subir o borrar, se necesita
            permiso de edición sobre este registro.
          </p>
        ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            agregar(e.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            arrastrando ? "border-cyan bg-cyan/5" : "border-mist-deep bg-mist/30"
          }`}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
            className="mx-auto text-ink-soft"
          >
            <path d="M12 16V5m0 0L8 9m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
          </svg>

          <p className="mt-3 text-sm text-ink-soft">
            Arrastra el documento acá, o{" "}
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={subiendo}
              className="font-semibold text-cyan-deep underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              elígelo del computador
            </button>
          </p>
          <p className="mt-1.5 text-xs text-ink-soft">
            Excel, Word, PDF, CSV o foto · hasta 25 MB cada uno
          </p>

          <input
            ref={entrada}
            type="file"
            multiple
            accept={TIPOS_ACEPTADOS}
            onChange={(e) => agregar(e.target.files)}
            className="hidden"
          />
        </div>
        )}

        {/* En espera de «Guardar» */}
        {puedeEscribir && porSubir.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Por guardar ({porSubir.length})
            </p>
            <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              {porSubir.map((a, i) => (
                <li
                  key={`${a.name}:${a.size}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-mist/50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-semibold text-ink" title={a.name}>
                    {a.name} <span className="font-normal text-ink-soft">· {formatearPeso(a.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPorSubir((p) => p.filter((_, j) => j !== i))}
                    disabled={subiendo}
                    className="shrink-0 text-xs font-semibold text-[#a52f24] disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
          >
            {error}
          </p>
        )}

        {/* Lo que ya está subido */}
        <div className="mt-6">
          {estado.estado === "cargando" && (
            <p className="py-6 text-center text-sm text-ink-soft">Cargando respaldos…</p>
          )}

          {estado.estado === "error" && (
            <p role="alert" className="py-6 text-center text-sm text-[#a52f24]">
              No se pudieron leer los respaldos: {estado.mensaje}
            </p>
          )}

          {estado.estado === "listo" && estado.datos.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-soft">
              Este registro todavía no tiene ningún documento de respaldo.
            </p>
          )}

          {estado.estado === "listo" && estado.datos.length > 0 && (
            <ul className="flex max-h-[18rem] flex-col gap-2 overflow-y-auto">
              {estado.datos.map((a) => {
                const icono = iconos[claseDe(a)];
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-mist px-3 py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white ${icono.color}`}
                    >
                      {icono.etiqueta}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink" title={a.nombre}>
                        {a.nombre}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {formatearPeso(a.tamano)} · {cuando(a.creadoEn)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Accion titulo="Abrir" onClick={() => void abrir(a, false)}>
                        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </Accion>
                      <Accion titulo="Descargar" onClick={() => void abrir(a, true)}>
                        <path d="M12 4v11m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 19h14" strokeLinecap="round" />
                      </Accion>
                      {puedeEscribir && (
                        <Accion titulo="Eliminar" onClick={() => setPorBorrar(a)}>
                          <path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12h9.4l.8-12" strokeLinecap="round" strokeLinejoin="round" />
                        </Accion>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* El botón que faltaba: sin él, no había forma de confirmar la subida. */}
      <div className="flex items-center justify-end gap-3 border-t border-mist px-6 py-4">
        <button
          type="button"
          onClick={alCerrar}
          disabled={subiendo}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          {porSubir.length > 0 ? "Cancelar" : "Cerrar"}
        </button>
        {puedeEscribir && (
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={subiendo || porSubir.length === 0}
            className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {subiendo
              ? "Guardando…"
              : porSubir.length > 0
                ? `Guardar ${porSubir.length === 1 ? "el respaldo" : `${porSubir.length} respaldos`}`
                : "Guardar"}
          </button>
        )}
      </div>

      <Confirmacion
        abierto={porBorrar !== null}
        titulo="Eliminar respaldo"
        detalle={`Se va a borrar "${porBorrar?.nombre}" del registro y del almacenamiento. Esto no se puede deshacer.`}
        error={null}
        procesando={borrando}
        alCancelar={() => setPorBorrar(null)}
        alConfirmar={() => void confirmarBorrado()}
      />
    </>
  );
}

function Accion({
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </button>
  );
}

/** El clip que abre los respaldos, con la cuenta de los que ya hay. */
export function BotonAdjuntos({
  cuantos,
  onClick,
  alVer,
}: {
  cuantos?: number;
  onClick: () => void;
  /** El ojo: abre el respaldo sin entrar al diálogo. Solo aparece si hay alguno. */
  alVer?: () => void;
}) {
  return (
    <>
      {alVer && !!cuantos && (
        <button
          type="button"
          onClick={alVer}
          aria-label={cuantos === 1 ? "Ver respaldo" : "Ver respaldos"}
          title={cuantos === 1 ? "Ver el respaldo" : "Ver los respaldos"}
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}
      <ClipDeRespaldos cuantos={cuantos} onClick={onClick} />
    </>
  );
}

function ClipDeRespaldos({ cuantos, onClick }: { cuantos?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={cuantos ? `Respaldos (${cuantos})` : "Respaldos"}
      title={cuantos ? `${cuantos} respaldo${cuantos === 1 ? "" : "s"}` : "Adjuntar respaldo"}
      className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l7-7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!!cuantos && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan px-1 text-[10px] font-bold text-white">
          {cuantos}
        </span>
      )}
    </button>
  );
}
