"use client";

import { useEffect, useRef, useState } from "react";
import { PadDeFirma, type PadDeFirmaRef } from "./PadDeFirma";
import { avisar } from "@/lib/avisos";
import { useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

/**
 * «Mi firma»: cada persona dibuja la suya una vez. Se estampa sola en las
 * órdenes de compra que envía (como quien emite) y, si la empresa la designó,
 * como quien autoriza. Solo su dueña la ve: ver la 0095.
 */
export function FirmaPerfil() {
  const usuario = useUsuario();
  const pad = useRef<PadDeFirmaRef>(null);
  const [guardada, setGuardada] = useState<string | null | undefined>(undefined);
  const [cambiando, setCambiando] = useState(false);
  const [hayTrazo, setHayTrazo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    supabase
      .from("firmas")
      .select("imagen")
      .eq("usuario_id", usuario.id)
      .maybeSingle()
      .then(({ data, error: falla }) => {
        if (!vigente) return;
        // Sin la 0095 la consulta falla: se muestra sin firma y el guardado explicará qué falta.
        setGuardada(falla ? null : ((data?.imagen as string | undefined) ?? null));
      });
    return () => {
      vigente = false;
    };
  }, [usuario.id]);

  async function guardar() {
    const png = pad.current?.aPng();
    if (!png) return setError("Dibuja tu firma en el recuadro.");
    setTrabajando(true);
    setError(null);
    const { error: falla } = await supabase.from("firmas").upsert({ usuario_id: usuario.id, imagen: png, actualizada_en: new Date().toISOString() }, { onConflict: "usuario_id" });
    setTrabajando(false);
    if (falla) {
      return setError(/firmas/.test(falla.message) && /exist|schema cache/i.test(falla.message) ? "Falta aplicar la migración 0095 en la base." : falla.message);
    }
    setGuardada(png);
    setCambiando(false);
    avisar("Firma guardada");
  }

  async function quitar() {
    setTrabajando(true);
    setError(null);
    const { error: falla } = await supabase.from("firmas").delete().eq("usuario_id", usuario.id);
    setTrabajando(false);
    if (falla) return setError(falla.message);
    setGuardada(null);
    avisar("Firma eliminada");
  }

  const mostrandoPad = cambiando || guardada === null;

  return (
    <section className="rounded-2xl border border-mist-deep bg-white p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold">Mi firma</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Se estampa sola en las órdenes de compra que envíes. Solo tú puedes verla o cambiarla: nadie más tiene acceso a la imagen.
      </p>

      <div className="mt-6">
        {guardada === undefined ? (
          <p className="text-sm text-ink-soft">Cargando…</p>
        ) : mostrandoPad ? (
          <>
            <PadDeFirma ref={pad} alCambiar={setHayTrazo} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={guardar} disabled={trabajando || !hayTrazo}
                className="rounded-full bg-cyan px-7 py-3 font-semibold text-white hover:bg-cyan-deep disabled:cursor-not-allowed disabled:opacity-60">
                {trabajando ? "Guardando…" : "Guardar firma"}
              </button>
              <button type="button" onClick={() => pad.current?.limpiar()} disabled={!hayTrazo}
                className="rounded-full border border-mist-deep px-5 py-3 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50">
                Borrar y empezar de nuevo
              </button>
              {guardada && (
                <button type="button" onClick={() => setCambiando(false)} className="text-sm font-semibold text-ink-soft hover:text-ink">
                  Cancelar
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-mist-deep bg-white p-4">
              {/* La firma guardada es una imagen de datos propia: no pasa por el optimizador de imágenes. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={guardada ?? ""} alt="Tu firma guardada" className="mx-auto max-h-32 w-auto" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { setCambiando(true); setHayTrazo(false); }}
                className="rounded-full border border-cyan px-6 py-2.5 text-sm font-semibold text-cyan-deep hover:bg-cyan/5">
                Cambiar mi firma
              </button>
              <button type="button" onClick={quitar} disabled={trabajando}
                className="text-sm font-semibold text-[#a52f24] hover:underline disabled:opacity-50">
                Eliminar
              </button>
            </div>
          </>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">{error}</p>}
      </div>
    </section>
  );
}
