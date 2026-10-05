import "server-only";

import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Cliente de la API de Pagnol (contrato en docs/integracion-pagnol-valar.md).
 *
 * `server-only`: si algún componente del navegador llegara a importarlo, el
 * build falla. La llave vive solo en el servidor —en Vercel, nunca en una
 * variable NEXT_PUBLIC_*—, y con ella Pagnol entrega el catálogo de Valar.
 *
 * Los tipos de `./schema` salen de `npm run gen:pagnol`; no se escriben a mano.
 */

/** Más de esto y Pagnol se da por caído: la pantalla avisa en vez de quedarse esperando. */
const ESPERA_MAXIMA_MS = 8_000;

/** Los tags del contrato: el webhook de Pagnol (fase 3) los invalida. */
export type TagPagnol = "pagnol:materiales" | "pagnol:proveedores" | "pagnol:activos";

export class PagnolNoConfigurado extends Error {}

/**
 * Un cliente cuyas lecturas quedan en la caché de Next con ese tag. La caché
 * se pide en el `fetch` y no en cada llamada: openapi-fetch arma un `Request`,
 * y Next solo lee `next: { tags }` del segundo argumento de `fetch`.
 */
export function clientePagnol(tag: TagPagnol, segundos = 300) {
  const baseUrl = process.env.PAGNOL_API_URL;
  const llave = process.env.PAGNOL_API_KEY;
  if (!baseUrl || !llave) {
    throw new PagnolNoConfigurado("Faltan PAGNOL_API_URL o PAGNOL_API_KEY en las variables del servidor.");
  }
  return createClient<paths>({
    baseUrl,
    headers: { Authorization: `Bearer ${llave}` },
    fetch: (pedido: Request) =>
      fetch(pedido, {
        signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
        next: { tags: [tag], revalidate: segundos },
      }),
  });
}
