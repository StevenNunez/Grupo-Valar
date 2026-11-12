/**
 * Trae todas las filas de una consulta.
 *
 * PostgREST corta cada respuesta en 1000 filas sin avisar: una lista que crece
 * pasado ese tope deja de mostrar las más viejas (o las más nuevas) y nada falla.
 * Esto pide de a tandas hasta agotar, para que las pantallas muestren todo de una.
 * La consulta tiene que traer un orden estable (con desempate por `id`), si no las
 * tandas pueden repetir o saltarse filas.
 */
const TANDA = 1000;

export async function traerTodo<T>(
  tanda: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TANDA) {
    const { data, error } = await tanda(desde, desde + TANDA - 1);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < TANDA) return filas;
  }
}

/**
 * Lo mismo que `traerTodo`, pero con la forma `{ data, error }` de Supabase:
 * para cambiar una consulta suelta por su versión completa sin tocar el código
 * que lee su resultado (que puede decidir seguir sin ella si falla).
 */
export async function todasLasFilas<T = Record<string, unknown>>(
  tanda: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  try {
    return { data: (await traerTodo(tanda)) as T[], error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
