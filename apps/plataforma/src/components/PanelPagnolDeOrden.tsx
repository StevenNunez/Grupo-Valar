"use client";

import { useEffect, useState } from "react";
import {
  anunciarOrdenAPagnol,
  cancelarOrdenEnPagnol,
  listarPanolesDePagnol,
  type AnuncioDeOrden,
} from "@/lib/pagnol/navegador";
import type { MaterialPagnol, PanolPagnol } from "@/lib/pagnol/tipos";
import { CampoConPagnol } from "./ui/CampoConPagnol";
import { actualizar } from "@/lib/crud";

/** Una línea de la OC, vista desde Pagnol: si ya apunta a un material del catálogo. */
export type LineaEnlazable = {
  id: string;
  descripcion: string;
  unidad: string;
  pedida: number;
  recibida: number;
  pagnolMaterialId: string | null;
};

/**
 * La OC frente a Pagnol (Fase 5 · B). Solo se muestra si la empresa recibe en
 * Pagnol: ahí el pañolero ve lo comprado, con el botón Recibir, y Valar se
 * entera por aviso. Acá se ve si la orden ya se anunció, a qué pañol, y se
 * puede anunciar o corregir a mano (por ejemplo si el anuncio automático al
 * enviar la orden falló).
 */
export function PanelPagnolDeOrden({ ordenId, anuncio, puedeEscribir, alCambiar, lineas = [] }: {
  ordenId: string;
  anuncio: AnuncioDeOrden;
  puedeEscribir: boolean;
  /** Releer el estado en Pagnol tras anunciar o cancelar. */
  alCambiar: () => void;
  /** Las líneas de la OC, para enlazarlas con el catálogo de Pagnol. */
  lineas?: LineaEnlazable[];
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
      if (r.ok) {
        setPanoles(r.datos);
        /* Las compras llegan a Oficina Central y de ahí salen a las faenas: es la
           propuesta mientras la orden no tenga pañol. Se puede cambiar. */
        const central = r.datos.find((p) => /oficina central/i.test(p.nombre));
        if (central) setPanolId((actual) => actual || central.id);
      } else setErrorPanoles(r.error);
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

  /* Enlazar una línea con un material de Pagnol NO toca su texto, su unidad ni su
     precio: la OC ya se emitió y se imprimió así. Solo guarda a qué material del
     catálogo corresponde, que es lo que Pagnol necesita para esperar la compra. */
  const [buscando, setBuscando] = useState<Record<string, string>>({});
  const [enlazando, setEnlazando] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Record<string, MaterialPagnol | null>>({});

  async function enlazar(linea: LineaEnlazable, material: MaterialPagnol | null) {
    setEnlazando(linea.id);
    setMensaje(null);
    try {
      await actualizar("items_compra", linea.id, { pagnol_material_id: material?.id ?? null });
      setElegidos((e) => ({ ...e, [linea.id]: material }));
      setBuscando((b) => ({ ...b, [linea.id]: "" }));
      alCambiar();
    } catch (e) {
      setMensaje({ tono: "error", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnlazando(null);
    }
  }

  const enlazadas = lineas.filter((l) => (l.id in elegidos ? elegidos[l.id] : l.pagnolMaterialId)).length;
  const hayAbiertas = lineas.length > 0;

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

      {hayAbiertas && !cancelada && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-ink">
            Líneas en el catálogo de Pagnol · {enlazadas} de {lineas.length}
          </h4>
          <p className="mt-1 text-xs text-ink-soft">
            Pagnol solo espera lo que apunta a un material de su catálogo. Busca el material de cada línea; el texto, la unidad y el precio
            de la orden no cambian. La cantidad se anuncia tal cual está en la orden: si compras por paquete, ajústala antes.
          </p>
          <ul className="mt-2 divide-y divide-mist rounded-lg border border-mist">
            {lineas.map((l) => {
              const material = l.id in elegidos ? elegidos[l.id] : undefined;
              const enlazada = material !== undefined ? material !== null : l.pagnolMaterialId !== null;
              return (
                <li key={l.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_minmax(0,16rem)] sm:items-start">
                  <div className="min-w-0">
                    <span className="block truncate text-sm text-ink">{l.descripcion}</span>
                    <span className="block text-[11px] tabular-nums text-ink-soft">
                      {l.pedida.toLocaleString("es-CL")} {l.unidad}
                      {l.recibida > 0 ? ` · ya recibidas en Valar: ${l.recibida.toLocaleString("es-CL")}` : ""}
                    </span>
                  </div>
                  {puedeEscribir ? (
                    <div>
                      <CampoConPagnol
                        ariaLabel={`Material de Pagnol para ${l.descripcion}`}
                        valor={buscando[l.id] ?? ""}
                        alCambiar={(t) => setBuscando((b) => ({ ...b, [l.id]: t }))}
                        alElegir={(m) => void enlazar(l, m)}
                        enlazado={material ? `${material.codigo} · ${material.nombre}` : enlazada ? "ya enlazada" : null}
                        placeholder={enlazada ? "Cambiar de material…" : "Busca el material en Pagnol…"}
                        className="w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-cyan"
                      />
                      {enlazada && (
                        <button
                          type="button"
                          disabled={enlazando === l.id}
                          onClick={() => void enlazar(l, null)}
                          className="mt-1 text-[11px] font-semibold text-[#a52f24] hover:underline disabled:opacity-60"
                        >
                          Quitar enlace
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-ink-soft">{enlazada ? "Enlazada" : "Sin enlazar"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
