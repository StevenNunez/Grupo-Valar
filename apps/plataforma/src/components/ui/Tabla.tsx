/**
 * Tabla del módulo. Una sola definición para las cinco vistas, así todas se
 * ven y se comportan igual: encabezado en versalita, filas que se iluminan al
 * pasar, números alineados a la derecha con cifras de ancho fijo, y desborde
 * horizontal contenido en su propia caja en vez de estirar la página.
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
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            {columnas.map((c, i) => (
              <th
                key={c.clave}
                scope="col"
                className={`whitespace-nowrap py-4 ${c.ancho ?? ""} ${
                  c.derecha ? "text-right" : ""
                } ${orillas(i, columnas.length)}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {filas.map((fila) => (
            <tr
              key={claveDe(fila)}
              className="border-b border-mist transition-colors last:border-0 hover:bg-mist/30"
            >
              {columnas.map((c, i) =>
                c.encabezado ? (
                  <th
                    key={c.clave}
                    scope="row"
                    className={`py-4 text-left font-normal ${orillas(i, columnas.length)}`}
                  >
                    {c.celda(fila)}
                  </th>
                ) : (
                  <td
                    key={c.clave}
                    className={`py-4 ${c.derecha ? "text-right tabular-nums" : ""} ${orillas(
                      i,
                      columnas.length,
                    )}`}
                  >
                    {c.celda(fila)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>

        {pie && (
          <tfoot>
            <tr className="border-t-2 border-mist-deep bg-mist/30 text-sm font-semibold text-ink">
              {pie}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Más aire en la primera y la última columna, para que no toquen el borde. */
function orillas(i: number, total: number) {
  if (i === 0) return "pl-6 pr-4 lg:pl-8";
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
      className={`px-4 py-4 first:pl-6 last:pr-6 lg:first:pl-8 lg:last:pr-8 ${
        derecha ? "text-right tabular-nums" : ""
      }`}
    >
      {children}
    </td>
  );
}
