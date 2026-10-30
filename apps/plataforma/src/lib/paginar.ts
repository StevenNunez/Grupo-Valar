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
