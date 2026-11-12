import { createClient } from "@supabase/supabase-js";
import { anotarError } from "@/lib/errores-servidor";

/**
 * Los errores que ve una persona en pantalla llegan acá (lib/errores.ts) y
 * pasan al registro de errores. Es pública a propósito —una pantalla que se
 * rompe antes de tener sesión también tiene que poder avisar—, así que solo
 * acepta texto corto y un número acotado de avisos por minuto.
 *
 * Si trae el token de la sesión, se anota quién y de qué empresa; el token se
 * verifica con Supabase, no se le cree al navegador.
 */

const POR_MINUTO = 30;
const vistos = new Map<string, { desde: number; n: number }>();

function demasiados(ip: string) {
  const ahora = Date.now();
  const v = vistos.get(ip);
  if (!v || ahora - v.desde > 60_000) {
    vistos.set(ip, { desde: ahora, n: 1 });
    if (vistos.size > 5000) vistos.clear();
    return false;
  }
  v.n += 1;
  return v.n > POR_MINUTO;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

async function quienEs(pedido: Request) {
  const token = pedido.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return { usuarioId: null, empresaId: null };
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return { usuarioId: null, empresaId: null };
  const { data: empresa } = await sb.rpc("empresa_actual");
  return { usuarioId: data.user.id, empresaId: typeof empresa === "string" ? empresa : null };
}

export async function POST(pedido: Request) {
  const ip = pedido.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  if (demasiados(ip)) return new Response(null, { status: 429 });

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await pedido.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const donde = texto(cuerpo.donde, 200);
  const mensaje = texto(cuerpo.mensaje, 2000);
  if (!donde || !mensaje) return new Response(null, { status: 400 });

  const { usuarioId, empresaId } = await quienEs(pedido).catch(() => ({ usuarioId: null, empresaId: null }));

  const error = new Error(mensaje);
  const pila = texto(cuerpo.pila, 4000);
  error.stack = pila ?? undefined;

  await anotarError({
    origen: "navegador",
    donde,
    error,
    detalle: {
      pagina: texto(cuerpo.pagina, 300),
      navegador: pedido.headers.get("user-agent")?.slice(0, 300),
    },
    usuarioId,
    empresaId,
  });

  return new Response(null, { status: 204 });
}
