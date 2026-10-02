/** Formato chileno, compartido por todas las vistas del módulo. */

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const formatearPesos = (monto: number) => clp.format(monto);

/**
 * El formato de las tablas y las tarjetas: millones cuando el número es grande,
 * pesos completos cuando no. Una compra de $64.000 en millones se lee "$0,1 M",
 * que no dice nada; y un contrato de $180 millones en pesos no cabe en la celda.
 */
export function formatearMonto(monto: number) {
  return Math.abs(monto) < 1_000_000 ? clp.format(monto) : formatearMillones(monto);
}

/** Versión corta para ejes y etiquetas de gráficos: "$1.240 M". */
export function formatearMillones(monto: number) {
  const millones = monto / 1_000_000;
  const decimales = Math.abs(millones) >= 100 ? 0 : 1;
  return `$${millones.toLocaleString("es-CL", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} M`;
}

export const formatearNumero = (n: number) => n.toLocaleString("es-CL");

/**
 * La UF siempre con dos decimales y coma: "820,63". Sin esto sale el formato
 * de JavaScript ("820.63"), que en una hoja que se le presenta al mandante se
 * lee como ochocientos veinte mil.
 */
export const formatearUf = (uf: number) =>
  uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatearFecha(iso: string | null) {
  if (!iso) return "—";
  // Mediodía a propósito: con la hora en cero, la zona horaria de Chile corre
  // la fecha al día anterior.
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** "2026-09-01" → "Sep". Corta la cadena en vez de usar Date, por la zona horaria. */
export function mesCorto(iso: string) {
  return MESES[Number(iso.slice(5, 7)) - 1] ?? iso;
}

/** "2026-09-01" → "Septiembre 2026". */
export function mesLargo(iso: string) {
  const largo = new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
  return largo.charAt(0).toUpperCase() + largo.slice(1);
}

/** Días desde una fecha hasta hoy. Negativo = todavía no llega. */
export function diasDesde(iso: string) {
  const dia = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / dia);
}

/** Días calendario hasta una fecha, sin desajustes por horario de verano. */
export function diasHastaFecha(iso: string, referencia = new Date()) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const destino = Date.UTC(ano, mes - 1, dia);
  const origen = Date.UTC(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return Math.round((destino - origen) / 86_400_000);
}
