"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha } from "@/lib/formato";
import { resolverSolicitudDePagnol } from "@/lib/pagnol/navegador";
import { RAIZ_ABASTECIMIENTO } from "@/lib/secciones";
import { puede, useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

/**
 * Solicitudes de compra desde Pagnol (Fase 5 · C del contrato).
 *
 * Una solicitud aprobada en Pagnol llega sola como borrador de solicitud, con
 * las líneas autorizadas. Si viene de un contrato de Pagnol que Valar aún no
 * conoce, espera acá: se elige a qué contrato de Valar corresponde, una sola
 * vez, y las siguientes salen ya asignadas.
 */

type Aviso = {
  webhook_id: string;
  recibido_en: string;
  error: string | null;
  payload: { data?: { codigo?: string; contrato?: { nombre?: string } | null; solicitante?: { nombre?: string } | null; lineas?: { estado?: string }[] } };
};

type Borrador = { id: string; numero: string; contrato_id: string; pagnol_solicitud_codigo: string | null };

type Datos = { contratos: ContratoBreve[]; pendientes: Aviso[]; borradores: Borrador[] };

async function cargar(): Promise<Datos> {
  const [contratos, pendientes, borradores] = await Promise.all([
    cargarContratosBreve(),
    supabase
      .from("pagnol_webhooks_recibidos")
      .select("webhook_id, recibido_en, error, payload")
      .eq("tipo", "solicitud_compra.aprobada")
      .is("procesado_en", null)
      .order("recibido_en", { ascending: false }),
    supabase.from("solped").select("id, numero, contrato_id, pagnol_solicitud_codigo").eq("origen", "pagnol-solicitud").eq("estado", "borrador"),
  ]);
  return {
    contratos,
    // Si la 0093 no está aplicada, estas consultas fallan: la sección no se muestra.
    pendientes: (pendientes.error ? [] : pendientes.data ?? []) as Aviso[],
    borradores: (borradores.error ? [] : borradores.data ?? []) as Borrador[],
  };
}

export function SolicitudesPagnol() {
  const usuario = useUsuario();
  const procesa = puede(usuario, "solped.crear");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [version, setVersion] = useState(0);
  /** Qué contrato eligió la persona para cada aviso, antes de armar la solicitud. */
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    cargar().then((d) => vigente && setDatos(d));
    return () => {
      vigente = false;
    };
  }, [version]);

  if (!datos || (datos.pendientes.length === 0 && datos.borradores.length === 0)) return null;
  const nombreContrato = new Map(datos.contratos.map((c) => [c.id, c.nombre]));

  async function armar(aviso: Aviso) {
    const contrato = elegidos[aviso.webhook_id];
    if (!contrato) return;
    setTrabajando(aviso.webhook_id);
    setMensaje(null);
    const r = await resolverSolicitudDePagnol(aviso.webhook_id, contrato);
    setTrabajando(null);
    setMensaje(r.ok ? { ok: true, texto: "Solicitud armada en borrador. Ya salió de la bandeja." } : { ok: false, texto: r.error });
    setVersion((v) => v + 1);
  }

  return (
    <section className="mt-8 rounded-2xl border border-mist-deep bg-white">
      <div className="border-b border-mist px-6 py-5 lg:px-8">
        <h2 className="font-display text-lg font-semibold text-ink">Solicitudes de compra desde Pagnol</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Cuando una solicitud se aprueba en Pagnol, llega acá como borrador con las líneas autorizadas. Nada se envía sin que
          alguien lo revise. Si viene de un contrato de Pagnol que aún no conocemos, se elige una vez a cuál de Valar corresponde.
        </p>
      </div>

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2 lg:px-8">
        <div className="min-w-0">
          <h3 className="flex min-h-9 items-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Esperando contrato</h3>
          {datos.pendientes.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No hay solicitudes pendientes.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {datos.pendientes.map((a) => {
                const d = a.payload.data ?? {};
                const autorizadas = (d.lineas ?? []).filter((l) => l.estado === "autorizada").length;
                return (
                  <li key={a.webhook_id} className="rounded-xl border border-mist-deep px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-ink">{d.codigo ?? "Solicitud"}</span>
                      <span className="text-xs text-ink-soft">{autorizadas} {autorizadas === 1 ? "línea" : "líneas"}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {formatearFecha(a.recibido_en.slice(0, 10))}
                      {d.solicitante?.nombre ? ` · ${d.solicitante.nombre}` : ""}
                      {` · Contrato en Pagnol: ${d.contrato?.nombre ?? "sin contrato"}`}
                    </p>
                    {a.error && <p className="mt-1 text-xs text-[#8a5a09]">{a.error}</p>}
                    {procesa && (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <select aria-label={`Contrato de ${d.codigo ?? "la solicitud"}`} value={elegidos[a.webhook_id] ?? ""}
                          onChange={(e) => setElegidos((x) => ({ ...x, [a.webhook_id]: e.target.value }))}
                          className="w-full min-w-0 truncate rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink sm:flex-1">
                          <option value="">— Elige el contrato de Valar —</option>
                          {datos.contratos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <button type="button" onClick={() => armar(a)} disabled={!elegidos[a.webhook_id] || trabajando === a.webhook_id}
                          className="rounded-full border border-cyan px-3 py-1.5 text-xs font-semibold text-cyan-deep hover:bg-cyan/5 disabled:opacity-50">
                          {trabajando === a.webhook_id ? "Armando…" : "Armar solicitud"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {mensaje && (
            <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm ${mensaje.ok ? "bg-[#e7f4ec] text-[#1f6b3b]" : "bg-[#fdeeec] text-[#a52f24]"}`}>
              {mensaje.ok ? "✓ " : ""}
              {mensaje.texto}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="flex min-h-9 items-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Borradores por revisar</h3>
          {datos.borradores.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No hay borradores abiertos.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {datos.borradores.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-mist-deep px-3 py-2 text-sm">
                  <Link href={`${RAIZ_ABASTECIMIENTO}/solped/`} className="font-semibold text-cyan-deep hover:underline">{b.numero}</Link>
                  <span className="min-w-0 truncate text-xs text-ink-soft">
                    {b.pagnol_solicitud_codigo ? `${b.pagnol_solicitud_codigo} · ` : ""}
                    {nombreContrato.get(b.contrato_id) ?? b.contrato_id}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
