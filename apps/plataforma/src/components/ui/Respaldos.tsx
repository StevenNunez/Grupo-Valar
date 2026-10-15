"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DialogoAdjuntos } from "./Adjuntos";
import { RespaldosDeFicha } from "./RespaldosDeFicha";
import { avisar } from "@/lib/avisos";
import { subirAdjunto, TIPOS_ACEPTADOS } from "@/lib/adjuntos";

/**
 * Respaldos dentro de cualquier formulario de registro.
 *
 * Donde se agrega un registro se puede adjuntar su documento:
 *  - un registro nuevo todavía no existe, así que los archivos se eligen ahora
 *    y suben apenas se guarda (`subirA`, que el formulario llama al terminar);
 *  - uno existente muestra sus documentos con "Ver adjunto" y "Descargar", y
 *    "Adjuntar respaldo" los sube al instante, sin cerrar el formulario.
 *
 * Si un archivo no sube, el registro queda guardado igual y un aviso lo dice.
 */
export function useRespaldos(tabla: string, registroId: string | null) {
  const [porSubir, setPorSubir] = useState<File[]>([]);

  async function subirA(id: string) {
    for (const archivo of porSubir) {
      try {
        await subirAdjunto({ tabla, registroId: id, archivo });
      } catch (e) {
        avisar(`Guardado, pero no se pudo adjuntar ${archivo.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { tabla, registroId, porSubir, setPorSubir, subirA };
}

export type RespaldosDeFormulario = ReturnType<typeof useRespaldos>;

export function SeccionRespaldos({ respaldos }: { respaldos: RespaldosDeFormulario }) {
  const { tabla, registroId, porSubir, setPorSubir } = respaldos;
  const [adjuntando, setAdjuntando] = useState(false);

  return (
    <div className="mb-5 border-b border-mist pb-5">
      <h3 className="font-display text-sm font-semibold text-ink">Respaldos</h3>

      {registroId ? (
        <>
          <RespaldosDeFicha tabla={tabla} registroId={registroId} />
          <button
            type="button"
            onClick={() => setAdjuntando(true)}
            className="mt-3 rounded-full border border-mist-deep px-4 py-2 text-xs font-semibold text-ink hover:border-ink"
          >
            Adjuntar respaldo
          </button>
          <p className="mt-1.5 text-xs text-ink-soft">
            El archivo se guarda al subirlo. Los cambios del formulario se guardan con el botón de abajo.
          </p>
          {/* Fuera del formulario en el DOM: sus botones no deben enviarlo. */}
          {adjuntando &&
            createPortal(
              <DialogoAdjuntos tabla={tabla} registroId={registroId} titulo={registroId} abierto alCerrar={() => setAdjuntando(false)} />,
              document.body,
            )}
        </>
      ) : (
        <>
          <input
            type="file"
            multiple
            accept={TIPOS_ACEPTADOS}
            aria-label="Adjuntar respaldo"
            onChange={(e) => {
              const nuevos = Array.from(e.target.files ?? []);
              setPorSubir((previos) => [...previos, ...nuevos]);
              e.target.value = "";
            }}
            className="mt-2 block w-full text-xs text-ink-soft file:mr-3 file:rounded-full file:border file:border-mist-deep file:bg-white file:px-4 file:py-2 file:text-xs file:font-semibold file:text-ink"
          />
          {porSubir.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
              {porSubir.map((a, i) => (
                <li key={a.name + i} className="flex items-center justify-between rounded-lg bg-mist/50 px-3 py-1.5">
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setPorSubir((p) => p.filter((_, j) => j !== i))}
                    className="ml-3 font-semibold text-[#a52f24]"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-ink-soft">Se adjuntan al guardar el registro.</p>
        </>
      )}
    </div>
  );
}
