/**
 * Tabla del módulo. Una sola definición para las cinco vistas, así todas se
 * ven y se comportan igual: encabezado en versalita, filas que se iluminan al
 * pasar, números alineados a la derecha con cifras de ancho fijo, y desborde
 * horizontal contenido en su propia caja en vez de estirar la página.
 *
 * En teléfono (menos de 768 px) cada fila pasa a ser una tarjeta: la primera
 * columna es el título, las demás van como "ETIQUETA ··· valor" y la columna de
 * acciones queda al pie. Es solo CSS sobre la misma tabla (el contenido no se
 * duplica), con el título de cada columna en `data-label`.
 */

export type Columna<T> = {
  clave: string;
  titulo: string;
  /** Los montos y las cantidades van a la derecha; el texto, a la izquierda. */
  derecha?: boolean;
  /** Clases de ancho, p. ej. "w-44". */
  ancho?: string;
  /** La primera columna hace de encabezado de fila para lectores de pantalla. */
  encabezado?: boolean;
  /** Queda pegada al borde derecho al hacer scroll (p. ej. los botones de acción). */
  fija?: boolean;
  celda: (fila: T) => React.ReactNode;
};

export function Tabla<T>({
  columnas,
  filas,
  claveDe,
  vacio = "Todavía no hay registros.",
  pie,
}: {
  columnas: Columna<T>[];
  filas: T[];
  claveDe: (fila: T) => string;
  vacio?: string;
  /** Fila de totales, opcional. */
  pie?: React.ReactNode;
}) {
  if (filas.length === 0) {
    return (
      <p className="px-6 py-14 text-center text-sm text-ink-soft lg:px-8">{vacio}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm max-md:block">
        <thead className="max-md:hidden">
          <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            {columnas.map((c, i) => (
              <th
                key={c.clave}
                scope="col"
                className={`whitespace-nowrap py-4 ${c.ancho ?? ""} ${
                  c.derecha ? "text-right" : ""
                } ${c.fija ? FIJA_ENCABEZADO : ""} ${orillas(i, columnas.length, c.fija)}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="max-md:block max-md:px-4 max-md:py-3">
          {filas.map((fila) => (
            <tr
              key={claveDe(fila)}
              className="group border-b border-mist transition-colors last:border-0 hover:bg-mist/30 max-md:mb-3 max-md:block max-md:rounded-xl max-md:border max-md:border-mist-deep max-md:bg-white max-md:px-4 max-md:py-3 max-md:last:mb-0"
            >
              {columnas.map((c, i) =>
                c.encabezado ? (
                  <th
                    key={c.clave}
                    scope="row"
                    className={`py-4 text-left font-normal ${orillas(i, columnas.length, c.fija)} ${TARJETA_TITULO}`}
                  >
                    {c.celda(fila)}
                  </th>
                ) : (
                  <td
                    key={c.clave}
                    data-label={i === 0 ? undefined : c.titulo || undefined}
                    className={`py-4 ${c.derecha ? "text-right tabular-nums" : ""} ${
                      c.fija ? FIJA_CELDA : ""
                    } ${orillas(
                      i,
                      columnas.length,
                      c.fija,
                    )} ${i === 0 ? TARJETA_TITULO : TARJETA_CAMPO}`}
                  >
                    {/* En tarjeta, el valor es un solo bloque a la derecha de su etiqueta, aunque traiga varias líneas. */}
                    <span className="contents max-md:block max-md:min-w-0">{c.celda(fila)}</span>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>

        {pie && (
          <tfoot className="max-md:block">
            <tr className="border-t-2 border-mist-deep bg-mist/30 text-sm font-semibold text-ink max-md:flex max-md:flex-wrap max-md:gap-x-6 max-md:gap-y-1 max-md:border-t max-md:px-4 max-md:py-3">
              {pie}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Más aire en la primera y la última columna, para que no toquen el borde. */
/* Fondo sólido: la columna se monta sobre lo que corre por debajo. */
const FIJA_ENCABEZADO = "sticky right-0 bg-white";
const FIJA_CELDA =
  "sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)] group-hover:bg-mist max-md:static max-md:bg-transparent max-md:shadow-none max-md:group-hover:bg-transparent";

/* En teléfono: la primera columna es el título de la tarjeta… */
const TARJETA_TITULO = "max-md:block max-md:border-b max-md:border-mist max-md:px-0 max-md:pb-2 max-md:pt-0 max-md:text-left max-md:font-semibold";
/* …y las demás, una línea «etiqueta · valor». Sin etiqueta (acciones), el valor va solo, a la derecha. */
const TARJETA_CAMPO =
  "max-md:flex max-md:items-start max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1.5 max-md:text-right before:max-md:content-[attr(data-label)] before:max-md:shrink-0 before:max-md:pt-0.5 before:max-md:text-left before:max-md:text-xs before:max-md:font-semibold before:max-md:uppercase before:max-md:tracking-[0.1em] before:max-md:text-ink-soft";

function orillas(i: number, total: number, fija?: boolean) {
  if (i === 0) return "pl-6 pr-4 lg:pl-8";
  /* La columna de botones fijos va más pegada a su vecina: gana espacio para que no tape a «Total». */
  if (i === total - 1 && fija) return "pl-2 pr-6 lg:pr-8";
  if (i === total - 1) return "pl-4 pr-6 lg:pr-8";
  return "px-4";
}

/** Celda de total, para usar dentro de `pie`. */
export function Total({
  children,
  derecha = false,
  colSpan,
}: {
  children?: React.ReactNode;
  derecha?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-4 first:pl-6 last:pr-6 max-md:p-0 max-md:first:pl-0 max-md:last:pr-0 lg:first:pl-8 lg:last:pr-8 ${
        derecha ? "text-right tabular-nums" : ""
      }`}
    >
      {children}
    </td>
  );
}
