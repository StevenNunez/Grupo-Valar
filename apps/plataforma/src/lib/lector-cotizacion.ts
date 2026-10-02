"use client";

/**
 * Leer la cotización que mandó el proveedor en vez de teclearla.
 *
 * POR QUÉ ASÍ Y NO CON UN SERVICIO DE IA. La plataforma es un export estático:
 * no hay servidor donde esconder una clave, así que cualquier API (Parseur,
 * PDF.ai, Airparser) tendría que llamarse desde el navegador con la clave a la
 * vista de cualquiera que abra las herramientas de desarrollo. Además los
 * precios de los proveedores saldrían de la empresa hacia un tercero, y todos
 * esos servicios cobran por página después de una cuota mensual.
 *
 * Acá se usa **pdf.js** (Mozilla, Apache-2.0), la misma librería con que Chrome
 * y Firefox muestran PDFs. Corre entera en el navegador: el archivo no viaja a
 * ninguna parte, no hay clave que filtrar, no hay cuota que se acabe y no hay
 * un servidor más que mantener.
 *
 * QUÉ LEE Y QUÉ NO. Lee PDFs de texto —los que salen de un sistema, que son
 * los que manda un proveedor—. No lee fotos ni escaneos: eso necesitaría OCR
 * (Tesseract), que pesa unos 10 MB, es lento y se equivoca justo en los dígitos
 * de los precios. Para esos casos está pegar la tabla, que es más rápido que
 * revisar lo que un OCR adivinó.
 *
 * CÓMO ARMA LAS FILAS. pdf.js no devuelve tablas: devuelve pedazos de texto con
 * su posición. Las filas se reconstruyen agrupando por altura, y las columnas
 * mirando dónde está cada título del encabezado. Una descripción larga ocupa
 * dos o tres renglones, así que se va acumulando hasta que aparece un renglón
 * con cantidad y precio: ese cierra el ítem.
 */

export type FilaLeida = {
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number | null;
  total: number | null;
};

export type LecturaCotizacion = {
  filas: FilaLeida[];
  /** "Crédito 30 días" y compañía, si el documento lo dice. */
  condicion: string | null;
  flete: number | null;
  descuento: number | null;
  /** Qué pasó, en una frase, para mostrarlo en pantalla. */
  aviso: string | null;
};

/* ── Números chilenos ─────────────────────────────────────────────────────── */

/**
 * "$ 1.234.567", "1.234,50", "4.400" → número.
 *
 * El punto es separador de miles y la coma decimal. Devuelve null cuando no hay
 * un número, que es distinto de cero: un precio que no se pudo leer no es un
 * precio de cero.
 */
export function aNumero(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,-]/g, "").trim();
  if (!limpio || !/\d/.test(limpio)) return null;

  const conComa = limpio.includes(",");
  const normalizado = conComa
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio.replace(/\.(?=\d{3}\b)/g, "");

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/* ── Encabezados que sabemos reconocer ────────────────────────────────────── */

type Columna =
  | "numero"
  | "descripcion"
  | "cantidad"
  | "precio"
  | "total"
  | "unidad"
  | "otra";

const TITULOS: { columna: Columna; patron: RegExp }[] = [
  { columna: "numero", patron: /^#$|^n\s*°?$|^item$|^nro\.?$|^n[ºo]\.?$/i },
  { columna: "descripcion", patron: /descrip|detalle|art[íi]culo|producto|glosa/i },
  { columna: "cantidad", patron: /^cant|cantidad|^qty|^cant\.?$/i },
  { columna: "precio", patron: /p\.?\s*unit|precio\s*unit|valor\s*unit|^precio$|^valor$|unitario/i },
  { columna: "total", patron: /^total|^subtotal|^importe|^monto/i },
  { columna: "unidad", patron: /^u\.?m\.?$|unidad|^um$|medida/i },
];

function columnaDe(texto: string): Columna {
  for (const t of TITULOS) if (t.patron.test(texto.trim())) return t.columna;
  return "otra";
}

/* ── El lector ────────────────────────────────────────────────────────────── */

/**
 * Lo que cierra la tabla. Se compara contra CADA celda y de forma exacta, no
 * contra el renglón entero: en una cotización real la nota al pie «Despacho
 * gratis para montos superiores a $200.000» comparte renglón con el NETO, y
 * buscando dentro del texto se leía como si el flete costara $1.986.100.
 */
const CIERRA_TABLA = /^(sub\s*total|total(\s+(neto|general|bruto))?|iva|neto|monto\s*total|son)\s*:?$/i;
const ES_FLETE = /^(flete|despacho|env[íi]o|transporte|reparto)\b/i;
const ES_DESCUENTO = /^(descuento|dcto)\b/i;

export async function leerCotizacionPdf(archivo: File): Promise<LecturaCotizacion> {
  // Carga perezosa: pdf.js pesa, y la mayoría de las veces nadie abre el lector.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const datos = new Uint8Array(await archivo.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: datos, useSystemFonts: true }).promise;

  const renglones: Renglon[] = [];
  let textoCompleto = "";

  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const contenido = await pagina.getTextContent();

    /* Un renglón por altura. La tolerancia es de 3 puntos porque dentro de una
       misma fila las celdas rara vez quedan al mismo pixel exacto. */
    const porY = new Map<number, Trozo[]>();
    for (const it of contenido.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const clave = [...porY.keys()].find((k) => Math.abs(k - y) <= 3) ?? y;
      porY.set(clave, [...(porY.get(clave) ?? []), { x: it.transform[4], texto: it.str }]);
      textoCompleto += ` ${it.str}`;
    }

    for (const [y, trozos] of porY) {
      // La página va de arriba hacia abajo: Y más grande es más arriba. Se
      // resta el número de página para que las páginas queden en orden.
      renglones.push({
        y: y - n * 100000,
        trozos: trozos.sort((a, b) => a.x - b.x),
      });
    }
  }

  renglones.sort((a, b) => b.y - a.y);

  return interpretar(renglones, textoCompleto);
}

/**
 * Lo mismo, pero con una tabla pegada desde Excel o desde el correo.
 *
 * Existe porque es el camino que nunca falla: si el PDF viene raro —o llega un
 * Excel, que es la mitad de las veces—, seleccionar la tabla y pegarla toma
 * diez segundos y no depende de que el formato del proveedor se parezca a algo.
 */
export function leerCotizacionPegada(texto: string): LecturaCotizacion {
  const renglones: Renglon[] = texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((linea, i) => ({ y: -i, trozos: celdasDe(linea) }));

  return interpretar(renglones, texto);
}

/**
 * Las celdas de una línea pegada, con su posición.
 *
 * Con tabulaciones —que es como pega Excel— se parte por tabulación y **se
 * conservan las celdas vacías**: son las que mantienen alineadas las columnas.
 * Sin ellas, un "Descuento" que solo trae monto en la última columna se leía
 * como si el monto fuera la cantidad.
 */
function celdasDe(linea: string): Trozo[] {
  const separadas = linea.includes("\t")
    ? linea.split("\t")
    : linea.split(/\s{2,}|\s*\|\s*/);

  return separadas
    .map((c, j) => ({ x: j * 100, texto: c.trim() }))
    .filter((c) => c.texto);
}

/* ── De renglones a ítems ─────────────────────────────────────────────────── */

export type Trozo = { x: number; texto: string };
export type Renglon = { y: number; trozos: Trozo[] };

/**
 * Se exporta para poder probarlo fuera del navegador contra las cotizaciones
 * reales de Valar. `scripts/_probar-lector.mjs` arma los renglones con pdf.js
 * en Node y llama a esta misma función, así que lo que se prueba es lo que
 * corre en la app y no una copia parecida.
 */
export function interpretar(renglones: Renglon[], textoCompleto: string): LecturaCotizacion {
  const cabecera = buscarCabecera(renglones);

  if (!cabecera) {
    return {
      filas: [],
      condicion: detectarCondicion(textoCompleto),
      flete: null,
      descuento: null,
      aviso:
        "No se encontró la tabla de ítems: el documento no trae un encabezado con «descripción» y «precio». Prueba pegando la tabla.",
    };
  }

  /* Dónde queda la cabecera EN CADA PÁGINA. Una cotización de dos páginas
     repite el encabezado arriba de la segunda, y sin esto todo ese preámbulo
     —el logo, el RUT, el N° de cotización— se pegaba a la descripción del
     último ítem de la página anterior y le arruinaba el total. */
  const corteDePagina = new Map<number, number>();
  for (const renglon of renglones) {
    const pagina = paginaDe(renglon.y);
    if (corteDePagina.has(pagina)) continue;
    const columnas = renglon.trozos.map((t) => ({ x: t.x, columna: columnaDe(t.texto) }));
    const clases = new Set(columnas.map((c) => c.columna));
    if (clases.has("descripcion") && (clases.has("precio") || clases.has("total"))) {
      corteDePagina.set(pagina, renglon.y);
    }
  }

  const filas: FilaLeida[] = [];
  let actual: FilaLeida | null = null;
  let flete: number | null = null;
  let descuento: number | null = null;
  let terminada = false;

  const cerrar = () => {
    if (actual && actual.descripcion.trim() && actual.precioUnitario !== null) {
      filas.push({
        ...actual,
        descripcion: actual.descripcion.replace(/\s+/g, " ").trim(),
      });
    }
    actual = null;
  };

  let paginaActual = renglones.length > 0 ? paginaDe(renglones[0].y) : 0;
  /* Al empezar una página nueva hay que dejar pasar su preámbulo —logo, RUT,
     N° de cotización— hasta el primer ítem numerado. Sin esto, todo eso se
     sumaba a la descripción del último ítem de la página anterior. */
  let esperandoPrimerItem = false;

  for (const renglon of renglones) {
    const pagina = paginaDe(renglon.y);
    if (pagina !== paginaActual) {
      cerrar();
      paginaActual = pagina;
      esperandoPrimerItem = cabecera.tieneNumero;
    }

    const corte = corteDePagina.get(pagina);
    if (corte !== undefined && renglon.y >= corte) continue;

    const celdas = repartir(renglon, cabecera.columnas);

    /* El cierre se busca celda por celda y exacto: la nota al pie «Despacho
       gratis…» viaja en el mismo renglón que el NETO, y buscar dentro del texto
       del renglón hacía que el total del documento se leyera como flete. */
    if (renglon.trozos.some((t) => CIERRA_TABLA.test(t.texto.trim()))) {
      cerrar();
      terminada = true;
      continue;
    }

    // Flete y descuento van en la columna de la descripción, como un ítem más.
    const monto = celdas.total ?? celdas.precio;
    if (monto !== null && ES_FLETE.test(celdas.descripcion)) {
      cerrar();
      flete = monto;
      continue;
    }
    if (monto !== null && ES_DESCUENTO.test(celdas.descripcion)) {
      cerrar();
      descuento = Math.abs(monto);
      continue;
    }

    if (terminada) continue;

    /* Dónde empieza cada ítem.
     *
     * Con columna de número, manda el número: es un límite exacto y aguanta que
     * la descripción siga DEBAJO del renglón del precio, que es lo que hacen
     * las cotizaciones cuando el nombre del artículo no cabe en una línea.
     * Sin ella, el corte es el renglón que trae precio, que es lo mejor que se
     * puede hacer a ciegas. */
    if (cabecera.tieneNumero) {
      if (celdas.numero !== null && Number.isInteger(celdas.numero)) {
        cerrar();
        esperandoPrimerItem = false;
      } else if (esperandoPrimerItem) {
        continue;
      }
      if (!actual) actual = fila();
    } else if (!actual) {
      actual = fila();
    }

    if (!actual) continue;

    if (celdas.descripcion) actual.descripcion += ` ${celdas.descripcion}`;
    if (celdas.cantidad !== null) actual.cantidad = celdas.cantidad;
    if (celdas.precio !== null) actual.precioUnitario = celdas.precio;
    if (celdas.total !== null) actual.total = celdas.total;

    if (!cabecera.tieneNumero && (celdas.precio !== null || celdas.total !== null)) {
      completar(actual);
      cerrar();
    }
  }

  cerrar();
  for (const f of filas) completar(f);

  return {
    filas,
    condicion: detectarCondicion(textoCompleto),
    flete,
    descuento,
    aviso:
      filas.length === 0
        ? "Se encontró la tabla pero ninguna fila con descripción y precio. Prueba pegando la tabla."
        : null,
  };
}

/** De qué página viene un renglón, según cómo los numera `leerCotizacionPdf`. */
const paginaDe = (y: number) => Math.max(0, Math.floor(-y / 100000));

const fila = (): FilaLeida => ({
  descripcion: "",
  cantidad: null,
  precioUnitario: null,
  total: null,
});

/** Lo que falte se deduce de lo que haya: son tres datos y basta con dos. */
function completar(f: FilaLeida) {
  if (f.precioUnitario === null && f.total !== null && f.cantidad) {
    f.precioUnitario = Math.round(f.total / f.cantidad);
  }
  if (f.total === null && f.precioUnitario !== null && f.cantidad) {
    f.total = Math.round(f.precioUnitario * f.cantidad);
  }
}

/**
 * El renglón que trae los títulos: es el que enseña dónde está cada columna.
 *
 * Se guardan TODOS los títulos, también los que no sabemos interpretar (Sku,
 * Imagen, Observaciones). Sirven de pared: sin ellos, un código de producto a
 * la izquierda de «Descripción» no tiene columna a la que caer y termina
 * metido dentro del nombre del artículo.
 */
function buscarCabecera(renglones: Renglon[]) {
  for (const renglon of renglones) {
    const columnas = renglon.trozos.map((t) => ({ x: t.x, columna: columnaDe(t.texto) }));
    const clases = new Set(columnas.map((c) => c.columna));

    // Con descripción y un número basta: hay proveedores que no ponen cantidad.
    if (clases.has("descripcion") && (clases.has("precio") || clases.has("total"))) {
      return {
        y: renglon.y,
        columnas: columnas.sort((a, b) => a.x - b.x),
        tieneNumero: clases.has("numero"),
      };
    }
  }
  return null;
}

/**
 * A qué columna pertenece cada pedazo de texto.
 *
 * Se asigna al último título que empiece a su izquierda, porque los números van
 * alineados a la derecha: un "4.400" bajo el título «Precio» arranca más a la
 * derecha que el título mismo.
 *
 * Lo que cae entre «Descripción» y la primera columna de números se suma a la
 * descripción aunque su título no lo entendamos: ahí viven la talla, la marca y
 * la unidad, y "Buzo Tyvek" sin la talla no distingue el L del XL.
 */
function repartir(renglon: Renglon, columnas: { x: number; columna: Columna }[]) {
  const juntado: Record<Columna, string[]> = {
    numero: [],
    descripcion: [],
    cantidad: [],
    precio: [],
    total: [],
    unidad: [],
    otra: [],
  };

  const xDescripcion = columnas.find((c) => c.columna === "descripcion")?.x ?? -Infinity;
  const numericas = columnas.filter(
    (c) => c.columna === "cantidad" || c.columna === "precio" || c.columna === "total",
  );
  const xPrimerNumero = numericas.length > 0 ? Math.min(...numericas.map((c) => c.x)) : Infinity;

  for (const trozo of renglon.trozos) {
    const candidatas = columnas.filter((c) => trozo.x >= c.x - 6);
    const columna =
      candidatas.length > 0 ? candidatas[candidatas.length - 1].columna : "otra";

    const entreDescripcionYNumeros =
      trozo.x >= xDescripcion - 6 && trozo.x < xPrimerNumero - 6;

    if (columna === "otra" && entreDescripcionYNumeros) juntado.descripcion.push(trozo.texto);
    else juntado[columna].push(trozo.texto);
  }

  return {
    numero: aNumero(juntado.numero.join(" ")),
    descripcion: juntado.descripcion.join(" ").trim(),
    cantidad: aNumero(juntado.cantidad.join(" ")),
    precio: aNumero(juntado.precio.join(" ")),
    total: aNumero(juntado.total.join(" ")),
  };
}

/**
 * "CONDICIÓN: Crédito 30 Días" → la condición de nuestra lista.
 *
 * Solo mira el texto que sigue a la palabra «condición», o un «contado» o
 * «crédito» sueltos. NO busca 30, 60 o 90 en todo el documento: probándolo con
 * una tabla real, el 90 de un precio de $8.900 se leyó como crédito a 90 días.
 * Un precio no es un plazo, y equivocarse acá corre el vencimiento de la
 * factura dos meses.
 */
function detectarCondicion(texto: string): string | null {
  const cerca =
    /condici[oó]n(?:es)?\s*(?:de\s*pago)?\s*:?\s*([^\n]{0,40})/i.exec(texto)?.[1] ??
    /((?:al\s+)?contado|cr[eé]dito[^\n]{0,25})/i.exec(texto)?.[1];

  if (!cerca) return null;

  const trozo = cerca.toLowerCase();
  if (/contado|efectivo|anticipado/.test(trozo)) return "Contado";
  if (/\b90\b/.test(trozo)) return "Crédito 90 días";
  if (/\b60\b/.test(trozo)) return "Crédito 60 días";
  if (/\b30\b/.test(trozo)) return "Crédito 30 días";
  return null;
}


/* ── Emparejar con los ítems de la solicitud ──────────────────────────────── */

const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "con", "sin", "para", "por", "y", "a",
  "un", "una", "mm", "cm",
]);

/**
 * Las palabras que importan de una descripción, sin acentos y en singular.
 *
 * El singular no es un lujo: el proveedor escribe "Lente fotocromático" y la
 * solicitud dice "Lentes Fotocromáticos". Sin quitar el plural esas dos
 * descripciones comparten una sola palabra de tres y no calzan, que es
 * exactamente el caso que más se repite en español.
 */
function palabras(texto: string) {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 1 && !VACIAS.has(p))
      .map(singular),
  );
}

/** "lentes" → "lente", "tornillos" → "tornillo". Corto y suficiente. */
function singular(palabra: string) {
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

/** Cuánto se parecen dos descripciones, de 0 a 1 (coeficiente de Dice). */
export function parecido(a: string, b: string) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.size === 0 || pb.size === 0) return 0;

  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes += 1;
  return (2 * comunes) / (pa.size + pb.size);
}

/**
 * Qué fila leída corresponde a qué ítem de la solicitud.
 *
 * Se asigna de a una y por el mejor puntaje primero, no fila por fila: si dos
 * ítems se parecen ("Buzo Tyvek talla L" y "talla XL"), asignar en orden le
 * daría el primero al que apareciera antes y no al que más se parece.
 *
 * Bajo 0,34 no se propone nada. Es preferible que alguien teclee tres precios a
 * que se cargue el precio del guante en la línea del casco.
 */
export function emparejar(
  filas: FilaLeida[],
  items: { id: string; descripcion: string }[],
  minimo = 0.34,
) {
  const pares: { itemId: string; fila: FilaLeida; puntaje: number }[] = [];

  for (const fila of filas) {
    for (const item of items) {
      const puntaje = parecido(fila.descripcion, item.descripcion);
      if (puntaje >= minimo) pares.push({ itemId: item.id, fila, puntaje });
    }
  }

  pares.sort((a, b) => b.puntaje - a.puntaje);

  const asignadas = new Map<string, { fila: FilaLeida; puntaje: number }>();
  const usadas = new Set<FilaLeida>();

  for (const par of pares) {
    if (asignadas.has(par.itemId) || usadas.has(par.fila)) continue;
    asignadas.set(par.itemId, { fila: par.fila, puntaje: par.puntaje });
    usadas.add(par.fila);
  }

  return {
    asignadas,
    sobrantes: filas.filter((f) => !usadas.has(f)),
  };
}
