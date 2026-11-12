"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  activarAvisos,
  desactivarAvisos,
  esAppInstalada,
  esIos,
  pushSoportado,
  registrarServiceWorker,
  sincronizarSuscripcion,
} from "@/lib/push";
import { supabase } from "@/lib/supabase";

type Aviso = {
  id: string;
  titulo: string;
  cuerpo: string;
  url: string;
  urgente: boolean;
  leida_en: string | null;
  creado_en: string;
};

type EventoInstalacion = Event & { prompt: () => Promise<void> };

function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/**
 * La campana de la barra superior: los avisos de la persona (una solicitud por
 * aprobar, una aprobada…), cuántos no ha leído, y desde acá mismo se instala la
 * app y se activan los avisos del teléfono o del escritorio.
 */
export function Campana() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [permiso, setPermiso] = useState<NotificationPermission | "no-soportado">("no-soportado");
  const [suscrito, setSuscrito] = useState(false);
  const [instalable, setInstalable] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(true);
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("notificaciones")
      .select("id, titulo, cuerpo, url, urgente, leida_en, creado_en")
      .order("creado_en", { ascending: false })
      .limit(30);
    setAvisos((data as Aviso[] | null) ?? []);
  }, []);

  const revisarDispositivo = useCallback(async () => {
    setPermiso(pushSoportado() ? Notification.permission : "no-soportado");
    const reg = await navigator.serviceWorker?.getRegistration("/");
    setSuscrito(Boolean(await reg?.pushManager.getSubscription()));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => setInstalada(esAppInstalada()));
    void registrarServiceWorker().then(async () => {
      await sincronizarSuscripcion();
      await revisarDispositivo();
    });
    void Promise.resolve().then(cargar);

    const cadaMinuto = window.setInterval(() => void cargar(), 60_000);
    const alVolver = () => document.visibilityState === "visible" && void cargar();
    const alPush = (e: MessageEvent) => e.data?.tipo === "push" && void cargar();
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setInstalable(e as EventoInstalacion);
    };
    const alInstalar = () => setInstalada(true);
    document.addEventListener("visibilitychange", alVolver);
    navigator.serviceWorker?.addEventListener("message", alPush);
    window.addEventListener("beforeinstallprompt", alOfrecer);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.clearInterval(cadaMinuto);
      document.removeEventListener("visibilitychange", alVolver);
      navigator.serviceWorker?.removeEventListener("message", alPush);
      window.removeEventListener("beforeinstallprompt", alOfrecer);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, [cargar, revisarDispositivo]);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierta(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierta]);

  const sinLeer = avisos.filter((a) => !a.leida_en).length;

  // El número sobre el ícono de la app instalada.
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (sinLeer > 0) void nav.setAppBadge?.(sinLeer).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [sinLeer]);

  async function abrir(a: Aviso) {
    setAbierta(false);
    if (!a.leida_en) {
      const ahora = new Date().toISOString();
      setAvisos((previos) => previos.map((x) => (x.id === a.id ? { ...x, leida_en: ahora } : x)));
      await supabase.from("notificaciones").update({ leida_en: ahora }).eq("id", a.id);
    }
    router.push(a.url);
  }

  async function marcarTodas() {
    const ahora = new Date().toISOString();
    setAvisos((previos) => previos.map((x) => ({ ...x, leida_en: x.leida_en ?? ahora })));
    await supabase.from("notificaciones").update({ leida_en: ahora }).is("leida_en", null);
  }

  async function activar() {
    setOcupada(true);
    setError(null);
    const fallo = await activarAvisos();
    if (fallo) setError(fallo);
    await revisarDispositivo();
    setOcupada(false);
  }

  async function apagar() {
    setOcupada(true);
    await desactivarAvisos();
    await revisarDispositivo();
    setOcupada(false);
  }

  async function instalar() {
    if (!instalable) return;
    await instalable.prompt();
    setInstalable(null);
  }

  const avisosActivos = permiso === "granted" && suscrito;
  const ios = esIos();

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-label={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : "Avisos"}
        aria-expanded={abierta}
        title="Avisos"
        className="relative grid h-10 w-10 place-items-center rounded-full border border-mist-deep text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-peligro px-1 text-[11px] font-bold leading-5 text-white">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed inset-x-3 top-[4.5rem] z-40 max-h-[75svh] overflow-hidden rounded-2xl border border-mist-deep bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[24rem]">
          <div className="flex items-center justify-between border-b border-mist-deep px-4 py-3">
            <p className="text-sm font-semibold text-ink">Avisos</p>
            {sinLeer > 0 && (
              <button type="button" onClick={() => void marcarTodas()} className="text-xs font-semibold text-cyan-deep hover:underline">
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="max-h-[42svh] overflow-y-auto">
            {avisos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">No tienes avisos todavía.</p>
            ) : (
              <ul>
                {avisos.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => void abrir(a)}
                      className={`flex w-full gap-3 border-b border-mist-deep/60 px-4 py-3 text-left transition-colors hover:bg-mist/60 ${a.leida_en ? "" : "bg-cyan/5"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.leida_en ? "bg-transparent" : a.urgente ? "bg-peligro" : "bg-cyan"}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{a.titulo}</span>
                        {a.cuerpo && <span className="mt-0.5 block text-xs text-ink-soft">{a.cuerpo}</span>}
                        <span className="mt-1 block text-[11px] text-ink-soft/80">{hace(a.creado_en)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-mist-deep bg-mist/40 px-4 py-3 text-xs text-ink-soft">
            {avisosActivos ? (
              <p className="flex items-center justify-between gap-3">
                <span>✓ Avisos activados en este dispositivo.</span>
                <button type="button" disabled={ocupada} onClick={() => void apagar()} className="font-semibold text-ink-soft hover:text-ink disabled:opacity-50">
                  Desactivar
                </button>
              </p>
            ) : permiso === "denied" ? (
              <p>Los avisos están bloqueados en este navegador. Actívalos desde el candado junto a la dirección.</p>
            ) : permiso === "no-soportado" && ios && !instalada ? (
              <p>
                En iPhone: toca <strong>Compartir</strong> → <strong>Agregar a inicio</strong>, abre Valar desde el ícono y activa los avisos aquí.
              </p>
            ) : permiso === "no-soportado" ? (
              <p>Este navegador no permite avisos.</p>
            ) : (
              <button
                type="button"
                disabled={ocupada}
                onClick={() => void activar()}
                className="w-full rounded-full bg-cyan-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-50"
              >
                {ocupada ? "Activando…" : "Activar avisos en este dispositivo"}
              </button>
            )}
            {!instalada && instalable && (
              <button
                type="button"
                onClick={() => void instalar()}
                className="w-full rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink"
              >
                Instalar la app en este equipo
              </button>
            )}
            {error && <p role="alert" className="text-peligro">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
