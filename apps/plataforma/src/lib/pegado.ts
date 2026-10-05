/**
 * Filas copiadas de una planilla (Google Sheets, Excel) y pegadas en una tabla
 * de ítems.
 *
 * Al copiar celdas, la planilla entrega texto: una fila por línea y las
 * columnas separadas por tabulador. Las OC de Valar se arman en Sheets con
 * ÍTEM | DESCRIPCIÓN | UN | CANTIDAD | PRECIO UNITARIO | TOTALES, pero no se
 * asume ese orden: se reconoce cada columna por lo que trae, para que también
 * sirva pegando solo algunas columnas o desde otra planilla.
 */

export type FilaPegada = {
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
};

/**
 * Un número tal como viene de la planilla, o null si no es un número.
 *
 * La planilla de las OC está en formato de EE.UU. ("$ 29,900") y la de Chile
 * escribe "$ 29.900". Las dos se leen igual: un separador seguido de grupos de
 * exactamente tres cifras es de miles. Si no, la coma es decimal ("2,5").
 */
export function leerNumero(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, "").replace(/^CLP/i, "");
  if (!limpio || !/\d/.test(limpio)) return null;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(limpio)) return Number(limpio.replace(/[.,]/g, ""));
  // Miles con un separador y decimales con el otro: "1,234.5" o "1.234,5".
  if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(limpio)) return Number(limpio.replace(/,/g, ""));
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(limpio)) return Number(limpio.replace(/\./g, "").replace(",", "."));
  const n = Number(limpio.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const ENCABEZADOS = /^(ítem|item|descripci[oó]n|detalle|un|um|unidad|cantidad|cant\.?|precio.*|p\. ?unit.*|total(es)?)$/i;

/**
 * Lee una fila. Devuelve null si no es un ítem: el encabezado, las filas
 * numeradas pero vacías que trae la plantilla (12, 13… 22) o una línea en blanco.
 */
function leerFila(linea: string): FilaPegada | null {
  const celdas = linea.split("\t").map((c) => c.trim());
  const textos: string[] = [];
  const numeros: number[] = [];
  for (const celda of celdas) {
    if (!celda) continue;
    const n = leerNumero(celda);
    if (n !== null) numeros.push(n);
    else textos.push(celda);
  }

  // La descripción es el texto más largo; la unidad, uno corto (UN, KG, M2).
  const candidatos = textos.filter((t) => !ENCABEZADOS.test(t));
  const descripcion = [...candidatos].sort((a, b) => b.length - a.length)[0];
  if (!descripcion) return null;
  const unidad = candidatos.find((t) => t !== descripcion && t.length <= 6) ?? "UN";

  // Con el total presente, se busca el par cantidad × precio que lo da: así no
  // importa si al principio viene el número de ítem. Si no, en orden.
  let cantidad = 1;
  let precioUnitario = 0;
  const par = buscarPar(numeros);
  if (par) [cantidad, precioUnitario] = par;
  else if (numeros.length >= 2) [cantidad, precioUnitario] = numeros.slice(-2);
  else if (numeros.length === 1) precioUnitario = numeros[0];

  return { descripcion, unidad: unidad.toUpperCase(), cantidad, precioUnitario: Math.round(precioUnitario) };
}

/**
 * Dos números de la fila cuyo producto es otro de la misma fila (cantidad,
 * precio, total). Se prueban primero los más cercanos al total, que es donde
 * van la cantidad y el precio en cualquier planilla.
 */
function buscarPar(numeros: number[]): [number, number] | null {
  for (let k = numeros.length - 1; k >= 2; k--) {
    const total = numeros[k];
    for (let j = k - 1; j >= 1; j--) {
      for (let i = j - 1; i >= 0; i--) {
        if (total > 0 && Math.abs(numeros[i] * numeros[j] - total) <= Math.max(1, total * 0.001)) {
          return [numeros[i], numeros[j]];
        }
      }
    }
  }
  return null;
}

export function leerPegado(texto: string): FilaPegada[] {
  return texto
    .split(/\r?\n/)
    .map(leerFila)
    .filter((f): f is FilaPegada => f !== null);
}
