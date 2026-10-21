"use client";

import { useEffect, useState } from "react";
import {
  anunciarOrdenAPagnol,
  cancelarOrdenEnPagnol,
  listarPanolesDePagnol,
  type AnuncioDeOrden,
} from "@/lib/pagnol/navegador";
import type { PanolPagnol } from "@/lib/pagnol/tipos";

/**
 * La OC frente a Pagnol (Fase 5 · B). Solo se muestra si la empresa recibe en
 * Pagnol: ahí el pañolero ve lo comprado, con el botón Recibir, y Valar se
 * entera por aviso. Acá se ve si la orden ya se anunció, a qué pañol, y se
 * puede anunciar o corregir a mano (por ejemplo si el anuncio automático al
 * enviar la orden falló).
 */
export function PanelPagnolDeOrden({ ordenId, anuncio, puedeEscribir, alCambiar }: {
  ordenId: string;
  anuncio: AnuncioDeOrden;
  puedeEscribir: boolean;
  /** Releer el estado en Pagnol tras anunciar o cancelar. */
  alCambiar: () => void;
}) {
  const [panoles, setPanoles] = useState<PanolPagnol[] | null>(null);
  const [errorPanoles, setErrorPanoles] = useState<string | null>(null);
  const [panolId, setPanolId] = useState(anuncio.panolId ?? "");
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    let vigente = true;
    listarPanolesDePagnol().then((r) => {
      if (!vigente) return;
      if (r.ok) setPanoles(r.datos);
      else setErrorPanoles(r.error);
    });
    return () => { vigente = false; };
  }, []);

  const anunciada = anuncio.estado === "anunciada";
  const cancelada = anuncio.estado === "cancelada";
  const nombreDelPanol = (id: string | null) => panoles?.find((p) => p.id === id)?.nombre ?? null;

  async function anunciar() {
    setTrabajando(true);
    setMensaje(null);
    const r = await anunciarOrdenAPagnol(ordenId, panolId || null);
    setTrabajando(false);
    if (!r.ok) return setMensaje({ tono: "error", texto: r.error });
    setMensaje({ tono: "ok", texto: ["Pagnol quedó al día con esta orden.", ...r.avisos].join(" ") });
    alCambiar();
  }

  async function cancelar() {
    setTrabajando(true);
    setMensaje(null);
    const r = await cancelarOrdenEnPagnol(ordenId);
    setTrabajando(false);
    setCancelando(false);
    if (!r.ok) return setMensaje({ tono: "error", texto: r.error });
    setMensaje({ tono: "ok", texto: "La compra se canceló en Pagnol. Lo que ya se recibió se queda." });
    alCambiar();
  }

  const estadoTexto = anunciada
    ? `Anunciada a Pagnol${nombreDelPanol(anuncio.panolId) ? ` · pañol ${nombreDelPanol(anuncio.panolId)}` : ""}. El pañolero la recibe allá.`
    : cancelada
      ? "Cancelada en Pagnol."
      : anuncio.estado === "error"
        ? `No se pudo anunciar: ${anuncio.error ?? "error desconocido"}`
        : "Todavía no se anuncia a Pagnol. El pañolero no la ve por recibir.";

  return (
    <section className="rounded-xl border border-mist-deep p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Recepción en Pagnol</h3>
      <p className={`mt-2 text-sm ${anuncio.estado === "error" ? "text-[#a52f24]" : "text-ink"}`}>{estadoTexto}</p>

      {puedeEscribir && !cancelada && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-soft" htmlFor="panol-anuncio">Pañol de destino</label>
            <select
              id="panol-anuncio"
              value={panolId}
              onChange={(e) => setPanolId(e.target.value)}
              className="mt-1 rounded-lg border border-mist-deep bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="">{panoles === null && !errorPanoles ? "Cargando pañoles…" : anuncio.panolId ? "El de siempre" : "Elige un pañol"}</option>
              {(panoles ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.ubicacion ? ` · ${p.ubicacion}` : ""}</option>)}
            </select>
          </div>
          <button
            type="button"
            disabled={trabajando}
            onClick={anunciar}
            className="rounded-full bg-cyan px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-deep disabled:opacity-60"
          >
            {trabajando ? "Hablando con Pagnol…" : anunciada ? "Actualizar en Pagnol" : "Anunciar a Pagnol"}
          </button>
          {anunciada && (
            <button type="button" disabled={trabajando} onClick={() => setCancelando(true)} className="text-sm font-semibold text-[#a52f24] hover:underline disabled:opacity-60">
              Cancelar en Pagnol
            </button>
          )}
        </div>
      )}
      {errorPanoles && <p className="mt-2 text-xs text-[#a52f24]">{errorPanoles}</p>}

      {cancelando && (
        <div className="mt-3 rounded-lg bg-[#fdf2e1] p-3 text-sm text-[#8a5a00]">
          <p>Pagnol dejará de esperar lo que falta de esta orden. Lo que ya recibió el pañolero se queda en su inventario.</p>
          <div className="mt-2 flex gap-3">
            <button type="button" disabled={trabajando} onClick={cancelar} className="font-semibold text-[#a52f24] hover:underline">Sí, cancelar</button>
            <button type="button" onClick={() => setCancelando(false)} className="font-semibold text-ink-soft hover:underline">No</button>
          </div>
        </div>
      )}

      {mensaje && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${mensaje.tono === "ok" ? "bg-[#e6f4ee] text-[#0e7a4f]" : "bg-[#fbe9e7] text-[#a52f24]"}`}>{mensaje.texto}</p>
      )}
    </section>
  );
}
