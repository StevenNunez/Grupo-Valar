"use client";

import { useEffect, useState } from "react";
import { Boton } from "./ui/Boton";
import { Chip } from "./ui/Chip";
import { Dialogo } from "./ui/Formulario";
import { mensajeParaPersona } from "@/lib/errores";
import { formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import { cargarAutorizacion, decidirCompra, type AutorizacionOrden } from "@/lib/abastecimiento/autorizacion";

/**
 * La autorización de una compra (0127): qué firmas pide según su neto, quién
 * firmó y qué falta. Quien emite la pide; quien está entre los firmantes de un
 * tramo la autoriza o la rechaza con un motivo. Todo lo decide la base: acá
 * solo se muestra lo que ella dice que se puede hacer.
 */

const tramo = (desde: number, hasta: number | null) =>
  hasta === null
    ? desde === 0
      ? "Cualquier monto"
      : `Desde ${formatearPesos(desde)}`
    : `${formatearPesos(desde)} a ${formatearPesos(hasta)}`;

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const verbo: Record<string, string> = {
  solicitado: "pidió la autorización",
  aprobado: "autorizó",
  rechazado: "rechazó",
  devuelto: "devolvió",
};

export function DialogoAutorizacion({
  ordenId,
  titulo,
  alCerrar,
  alCambiar,
}: {
  ordenId: string;
  /** «OC22-001140 · Ferretería X»; si falta, se usa el id. */
  titulo?: string;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const [a, setA] = useState<AutorizacionOrden | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [comentario, setComentario] = useState("");
  const [rechazando, setRechazando] = useState(false);
  /* Desde el aviso llega solo el id interno: el N° de la OC se busca. */
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    if (titulo) return;
    let vigente = true;
    supabase
      .from("ordenes_compra_proveedor")
      .select("numero, proveedor")
      .eq("id", ordenId)
      .maybeSingle()
      .then(({ data }) => vigente && data && setNombre(`${data.numero} · ${data.proveedor}`));
    return () => {
      vigente = false;
    };
  }, [ordenId, titulo]);

  useEffect(() => {
    let vigente = true;
    cargarAutorizacion(ordenId)
      .then((r) => vigente && setA(r))
      .catch((e) => vigente && setError(mensajeParaPersona(e, "DialogoAutorizacion")))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [ordenId]);

  async function decidir(accion: "solicitado" | "aprobado" | "rechazado") {
    setError(null);
    if (accion === "rechazado" && !comentario.trim()) return setError("Escribe el motivo del rechazo.");
    try {
      const r = await decidirCompra(ordenId, accion, comentario);
      setA(r);
      setComentario("");
      setRechazando(false);
      alCambiar();
    } catch (e) {
      setError(mensajeParaPersona(e, "DialogoAutorizacion"));
    }
  }

  return (
    <Dialogo titulo={`Autorización · ${titulo ?? nombre ?? "…"}`} abierto alCerrar={alCerrar} ancho="max-w-xl">
      <div className="flex flex-col gap-5 px-6 py-6 text-sm text-ink">
        {cargando ? (
          <p className="text-ink-soft">Revisando las firmas…</p>
        ) : !a ? (
          <p className="text-ink-soft">{error ?? "No se encontró la orden."}</p>
        ) : !a.requiere ? (
          <p className="rounded-xl bg-mist/50 px-4 py-3 text-ink-soft">
            Con su neto de hoy ({formatearPesos(a.neto)}), esta orden no necesita autorización: ningún tramo de
            Aprobaciones la alcanza. Se puede emitir directamente.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                Neto de la orden: <strong>{formatearPesos(a.neto)}</strong>
              </p>
              {a.completa ? (
                <Chip tono="bueno">Autorizada</Chip>
              ) : a.rechazada ? (
                <Chip tono="critico">Rechazada</Chip>
              ) : a.pedidaEn ? (
                <Chip tono="aviso">Esperando firmas</Chip>
              ) : (
                <Chip tono="neutro">Sin pedir</Chip>
              )}
            </div>

            {a.rechazada && (
              <p className="rounded-xl bg-peligro-suave px-4 py-3 text-peligro">
                La rechazó {a.rechazada.nombre}: «{a.rechazada.motivo}». Corrige la orden y vuelve a pedir la autorización.
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {a.reglas.map((r) => (
                <li key={r.id} className="rounded-xl border border-mist-deep px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{r.titulo}</span>
                    {r.firma ? <Chip tono="bueno">Firmó {r.firma.nombre}</Chip> : <Chip tono="aviso">Falta</Chip>}
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {tramo(r.desde, r.hasta)} · {r.firmantes.length ? `Firma ${r.firmantes.map((f) => f.nombre).join(" o ")}` : "Sin firmantes: revisa Aprobaciones"}
                    {r.firma && ` · ${fechaHora(r.firma.en)}`}
                  </p>
                </li>
              ))}
            </ul>

            {a.completa && a.estado === "borrador" && (
              <p className="rounded-xl bg-exito-suave px-4 py-3 text-exito">
                Tiene todas sus firmas. Edítala, pásala a «Emitida» y envíala al proveedor.
              </p>
            )}

            {(a.puedoFirmar || a.puedoRechazar) && !a.completa && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Comentario {rechazando ? "(obligatorio para rechazar)" : "(opcional)"}</span>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={2}
                  className="rounded-xl border border-mist-deep px-3.5 py-2.5 text-sm"
                />
              </label>
            )}

            {a.puedoPedir && !a.rechazada && a.pedidaEn && (
              <p className="text-xs text-ink-soft">Pedida el {fechaHora(a.pedidaEn)}. Puedes volver a avisar si se demora.</p>
            )}

            {error && <p role="alert" className="rounded-xl bg-peligro-suave px-4 py-3 text-peligro">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {a.puedoRechazar && !a.completa && (
                <Boton
                  variante="secundario"
                  onClick={() => (rechazando ? decidir("rechazado") : setRechazando(true))}
                >
                  {rechazando ? "Confirmar rechazo" : "Rechazar"}
                </Boton>
              )}
              {a.puedoFirmar && <Boton onClick={() => decidir("aprobado")}>Autorizar</Boton>}
              {a.puedoPedir && (
                <Boton variante={a.puedoFirmar ? "secundario" : "primario"} onClick={() => decidir("solicitado")}>
                  {a.rechazada ? "Pedir de nuevo" : a.pedidaEn ? "Volver a avisar" : "Pedir autorización"}
                </Boton>
              )}
            </div>

            {a.historial.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Historial</h3>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
                  {a.historial.map((h, i) => (
                    <li key={i}>
                      {fechaHora(h.en)} · <span className="text-ink">{h.nombre}</span> {verbo[h.accion] ?? h.accion}
                      {h.monto !== null && ` (${formatearPesos(h.monto)})`}
                      {h.comentario && `: «${h.comentario}»`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
