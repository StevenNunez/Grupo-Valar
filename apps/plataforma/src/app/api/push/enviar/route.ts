import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { supabaseDeServicio } from "@/lib/supabase-servidor";

/**
 * Manda por push las notificaciones que la base acaba de crear.
 *
 * La llama Postgres (pg_net, desde `enviar_push()`), no el navegador: lleva un
 * secreto compartido en `x-push-secreto` y solo recibe ids de notificaciones.
 * El texto sale de la tabla, no del pedido, así que aunque alguien adivinara la
 * ruta no podría hacer llegar un mensaje inventado.
 */
export async function POST(pedido: Request) {
  const secreto = process.env.PUSH_SECRETO ?? "";
  const recibido = pedido.headers.get("x-push-secreto") ?? "";
  const a = Buffer.from(secreto);
  const b = Buffer.from(recibido);
  if (!secreto || a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const sb = supabaseDeServicio();
  if (!publica || !privada || !sb) return Response.json({ ok: false, error: "Push sin configurar." }, { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_ASUNTO ?? "mailto:hola@teolabs.app", publica, privada);

  const cuerpo = (await pedido.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(cuerpo?.ids) ? cuerpo.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (ids.length === 0) return Response.json({ ok: true, enviados: 0 });

  const { data: avisos } = await sb
    .from("notificaciones")
    .select("id, usuario_id, titulo, cuerpo, url, referencia, urgente")
    .in("id", ids)
    .is("push_enviado_en", null);
  if (!avisos?.length) return Response.json({ ok: true, enviados: 0 });

  const { data: dispositivos } = await sb
    .from("push_suscripciones")
    .select("id, usuario_id, endpoint, p256dh, auth")
    .in("usuario_id", [...new Set(avisos.map((a) => a.usuario_id))]);

  let enviados = 0;
  const muertos: string[] = [];
  await Promise.all(
    avisos.flatMap((aviso) =>
      (dispositivos ?? [])
        .filter((d) => d.usuario_id === aviso.usuario_id)
        .map(async (d) => {
          try {
            await webpush.sendNotification(
              { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
              JSON.stringify({
                titulo: aviso.titulo,
                cuerpo: aviso.cuerpo,
                url: aviso.url,
                urgente: aviso.urgente,
                tag: aviso.referencia ?? undefined,
              }),
              { TTL: 60 * 60 * 24, urgency: aviso.urgente ? "high" : "normal" },
            );
            enviados += 1;
          } catch (e) {
            const estado = (e as { statusCode?: number }).statusCode;
            // 404/410: el dispositivo desinstaló la app o revocó el permiso.
            if (estado === 404 || estado === 410) muertos.push(d.id);
          }
        }),
    ),
  );

  if (muertos.length) await sb.from("push_suscripciones").delete().in("id", muertos);
  await sb.from("notificaciones").update({ push_enviado_en: new Date().toISOString() }).in("id", avisos.map((a) => a.id));
  return Response.json({ ok: true, enviados });
}
