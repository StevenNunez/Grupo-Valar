/* Service worker de la Plataforma Valar.
 *
 * Hace una sola cosa: recibir avisos push y llevar a la pantalla correcta al
 * tocarlos. A propósito NO guarda páginas ni datos en caché: la plataforma
 * muestra información de la empresa y tiene que ser siempre la de ahora. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titulo: "Plataforma Valar", cuerpo: event.data ? event.data.text() : "" }; }
  const titulo = d.titulo || "Plataforma Valar";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(titulo, {
        body: d.cuerpo || "",
        icon: "/icons/icono-192.png",
        badge: "/icons/icono-192.png",
        /* Misma etiqueta = un recordatorio reemplaza al anterior en vez de apilarse. */
        tag: d.tag || undefined,
        renotify: Boolean(d.tag),
        /* Urgente: en el escritorio se queda en pantalla hasta que lo toques. */
        requireInteraction: Boolean(d.urgente),
        data: { url: d.url || "/modulos/" },
      });
      // Si la app está abierta, que refresque la campana.
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      ventanas.forEach((v) => v.postMessage({ tipo: "push" }));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/modulos/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) {
        if (v.url.startsWith(self.location.origin) && "focus" in v) {
          await v.focus();
          if ("navigate" in v) await v.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
