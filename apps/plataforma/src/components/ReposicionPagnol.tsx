"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chip } from "./ui/Chip";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearFecha } from "@/lib/formato";
import { listarPanolesDePagnol, procesarReposicionPendiente } from "@/lib/pagnol/navegador";
import type { PanolPagnol } from "@/lib/pagnol/tipos";
import { RAIZ_ABASTECIMIENTO } from "@/lib/secciones";
import { administra, puede, useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

/**
 * Reposición desde Pagnol (Fase 4 del contrato).
 *
 * Cuando un consumible baja de su mínimo en Pagnol, la plataforma arma sola un
 * borrador de solicitud en el contrato del pañol. Acá se decide a qué contrato
 * va cada pañol, y se ve lo que quedó sin solicitud y por qué.
 */

type Aviso = {
  webhook_id: string;
  recibido_en: string;
  error: string | null;
  payload: { data?: { nombre?: string; material_id?: string; stock_actual?: number; stock_minimo?: number; panol?: { nombre: string } | null } };
};

type Datos = {
  panoles: PanolPagnol[] | null;
  errorPanoles: string | null;
  asociaciones: Map<string, string>;
  contratos: ContratoBreve[];
  pendientes: Aviso[];
  borradores: { id: string; numero: string; contrato_id: string }[];
};

async function cargar(): Promise<Datos> {
  const [panoles, asociaciones, contratos, pendientes, borradores] = await Promise.all([
    listarPanolesDePagnol(),
    supabase.from("pagnol_panoles_contratos").select("panol_id, contrato_id"),
    cargarContratosBreve(),
    supabase
      .from("pagnol_webhooks_recibidos")
      .select("webhook_id, recibido_en, error, payload")
      .eq("tipo", "stock.bajo_minimo")
      .is("procesado_en", null)
      .order("recibido_en", { ascending: false }),
    supabase.from("solped").select("id, numero, contrato_id").eq("origen", "pagnol").eq("estado", "borrador"),
  ]);
  return {
    panoles: panoles.ok ? panoles.datos : null,
    errorPanoles: panoles.ok ? null : panoles.error,
    asociaciones: new Map((asociaciones.data ?? []).map((a) => [a.panol_id as string, a.contrato_id as string])),
    contratos,
    // Si la 0057 no está aplicada, estas consultas fallan: la sección se muestra vacía.
    pendientes: (pendientes.error ? [] : pendientes.data ?? []) as Aviso[],
    borradores: (borradores.error ? [] : borradores.data ?? []) as Datos["borradores"],
  };
}

export function ReposicionPagnol() {
  const usuario = useUsuario();
  const editaPanoles = administra(usuario, "abastecimiento");
  const procesa = puede(usuario, "solped.crear");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    cargar().then((d) => vigente && setDatos(d));
    return () => {
      vigente = false;
    };
  }, [version]);

  if (!datos) return null;
  const releer = () => setVersion((v) => v + 1);

  async function asignar(panol: PanolPagnol, contratoId: string) {
    setMensaje(null);
    const { error } = contratoId
      ? await supabase
          .from("pagnol_panoles_contratos")
          .upsert({ panol_id: panol.id, panol_nombre: panol.nombre, contrato_id: contratoId }, { onConflict: "empresa_id,panol_id" })
      : await supabase.from("pagnol_panoles_contratos").delete().eq("panol_id", panol.id);
    if (error) setMensaje(`No se pudo guardar: ${error.message}`);
    releer();
  }

  async function procesar() {
    setTrabajando(true);
    setMensaje(null);
    const r = await procesarReposicionPendiente();
    setTrabajando(false);
    setMensaje(r.ok ? `Revisados ${r.revisados} avisos: ${r.listos} quedaron en una solicitud.` : r.error);
    releer();
  }

  const nombreContrato = new Map(datos.contratos.map((c) => [c.id, c.nombre]));

  return (
    <section className="mt-8 rounded-2xl border border-mist-deep bg-white">
      <div className="border-b border-mist px-6 py-5 lg:px-8">
        <h2 className="font-display text-lg font-semibold text-ink">Reposición desde Pagnol</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Cuando un material baja de su mínimo en Pagnol, se arma solo un borrador de solicitud en el contrato de su pañol,
          con la cantidad para llegar al doble del mínimo. Nada se envía sin que alguien lo revise.
        </p>
      </div>

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2 lg:px-8">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Cada pañol, a su contrato</h3>
          {datos.errorPanoles ? (
            <p className="mt-2 text-sm text-[#8a5a09]">{datos.errorPanoles}</p>
          ) : (datos.panoles ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Pagnol no tiene pañoles activos.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {(datos.panoles ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mist-deep px-3 py-2 text-sm">
                  <span className="text-ink">{p.nombre}</span>
                  {editaPanoles ? (
                    <select aria-label={`Contrato de ${p.nombre}`} value={datos.asociaciones.get(p.id) ?? ""}
                      onChange={(e) => asignar(p, e.target.value)}
                      className="rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink">
                      <option value="">— Sin contrato —</option>
                      {datos.contratos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  ) : (
                    <span className="text-ink-soft">{nombreContrato.get(datos.asociaciones.get(p.id) ?? "") ?? "Sin contrato"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {datos.borradores.length > 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              Borradores de reposición abiertos:{" "}
              {datos.borradores.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ", "}
                  <Link href={`${RAIZ_ABASTECIMIENTO}/solped/`} className="font-semibold text-cyan-deep hover:underline">{b.numero}</Link>
                  {` (${nombreContrato.get(b.contrato_id) ?? b.contrato_id})`}
                </span>
              ))}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Avisos sin solicitud</h3>
            {procesa && datos.pendientes.length > 0 && (
              <button type="button" onClick={procesar} disabled={trabajando}
                className="rounded-full border border-cyan px-3 py-1.5 text-xs font-semibold text-cyan-deep hover:bg-cyan/5 disabled:opacity-50">
                {trabajando ? "Procesando…" : "Procesar pendientes"}
              </button>
            )}
          </div>
          {datos.pendientes.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No hay avisos pendientes.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {datos.pendientes.slice(0, 8).map((a) => {
                const d = a.payload.data ?? {};
                return (
                  <li key={a.webhook_id} className="rounded-xl border border-mist-deep px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-ink">{d.nombre ?? d.material_id ?? "Material"}</span>
                      <Chip tono="aviso">stock {d.stock_actual ?? "?"} / mín {d.stock_minimo ?? "?"}</Chip>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {formatearFecha(a.recibido_en.slice(0, 10))}
                      {d.panol?.nombre ? ` · ${d.panol.nombre}` : ""}
                    </p>
                    {a.error && <p className="mt-1 text-xs text-[#8a5a09]">{a.error}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {mensaje && <p className="mt-3 text-sm text-ink-soft">{mensaje}</p>}
        </div>
      </div>
    </section>
  );
}
