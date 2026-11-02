"use client";

import { supabase } from "./supabase";

/**
 * Avisos push del navegador (PWA).
 *
 * El service worker (`public/sw.js`) es quien recibe el aviso aunque la app
 * esté cerrada. Acá solo se pide el permiso, se crea la suscripción del
 * dispositivo y se le entrega a la base (`registrar_push`).
 */

export const LLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushSoportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    LLAVE_PUBLICA !== ""
  );
}

export function esIos(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function esAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function aBytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

async function guardarSuscripcion(sub: PushSubscription): Promise<string | null> {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return "El navegador no entregó la suscripción completa.";
  const { error } = await supabase.rpc("registrar_push", {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
    p_agente: navigator.userAgent,
  });
  return error ? error.message : null;
}

/** Si el permiso ya está dado, deja la suscripción al día a nombre de quien tiene la sesión. */
export async function sincronizarSuscripcion(): Promise<boolean> {
  if (!pushSoportado() || Notification.permission !== "granted") return false;
  const reg = await registrarServiceWorker();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  return (await guardarSuscripcion(sub)) === null;
}

/** Pide permiso y suscribe este dispositivo. Devuelve un mensaje de error, o null si salió bien. */
export async function activarAvisos(): Promise<string | null> {
  if (!pushSoportado()) return "Este navegador no permite avisos. En iPhone, primero instala la app en la pantalla de inicio.";
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return "El permiso quedó bloqueado. Actívalo en la configuración del navegador (candado junto a la dirección).";
  const reg = await registrarServiceWorker();
  if (!reg) return "No se pudo preparar la app para recibir avisos.";
  await navigator.serviceWorker.ready;
  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(LLAVE_PUBLICA) }));
    return await guardarSuscripcion(sub);
  } catch (e) {
    return e instanceof Error ? e.message : "No se pudo activar los avisos.";
  }
}

/** Apaga los avisos de ESTE dispositivo. */
export async function desactivarAvisos(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_suscripciones").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
