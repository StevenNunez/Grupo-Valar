import type { Datos } from "./campos";
import type { TipoEdp } from "./ingresos";

/**
 * El formato visual es común; estos son los datos que pide cada mandante.
 *
 * Los ids son los de siempre (así quedaron guardados en los contratos y en los
 * EDP ya emitidos); los títulos dicen qué cobra cada plantilla, no a qué
 * contrato se le hizo primero.
 *
 * "Configurable" (0058) reúne todos los campos de las demás y en cada contrato
 * se marcan los que van. Su comportamiento —convertir con la UF, desglosar
 * retenciones, destacar el avance— sale de los campos marcados.
 */
export type PlantillaEdp = "miscelaneos" | "carpas" | "torres" | "general" | "configurable";
export const plantillasEdp: { id: PlantillaEdp; titulo: string; ayuda: string }[] = [
  { id: "general", titulo: "General", ayuda: "Para contratos que no necesitan un detalle especial en su EDP." },
  { id: "miscelaneos", titulo: "Uso de recursos", ayuda: "Se cobra lo que se usó: EDP ordinarios y extraordinarios, con horas hombre y monto GR." },
  { id: "torres", titulo: "Arriendos", ayuda: "Equipos arrendados en el período, conceptos en UF y conversión con la UF del período." },
  { id: "carpas", titulo: "Avance de actividades", ayuda: "Se cobra el avance: real y programado, con retenciones desglosadas." },
  { id: "configurable", titulo: "Configurable", ayuda: "Todos los campos disponibles: en el contrato se marcan los que lleva su EDP." },
];

/** Conserva el formato con que se emitió un EDP aunque luego cambie el contrato. */
export function resolverPlantillaEdp(valor: unknown, actual: PlantillaEdp): PlantillaEdp {
  return plantillasEdp.some((p) => p.id === valor) ? valor as PlantillaEdp : actual;
}

/** Lo mismo para la selección de una plantilla configurable: la del EDP manda. */
export function resolverSeleccionEdp(valor: unknown, actual: string[]): string[] {
  return Array.isArray(valor) && valor.every((v) => typeof v === "string") ? valor as string[] : actual;
}

export type CampoEdp = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "moneda";
  unidad?: string;
  soloExtraordinario?: boolean;
};

const descripcion: CampoEdp = { clave: "descripcion", etiqueta: "Descripción del trabajo", tipo: "texto" };
const hh: CampoEdp = { clave: "cantidad_hh", etiqueta: "Cantidad de HH", tipo: "numero", unidad: "HH" };
const gr: CampoEdp = { clave: "monto_gr", etiqueta: "Monto GR", tipo: "moneda", soloExtraordinario: true };
const observaciones: CampoEdp = { clave: "observaciones", etiqueta: "Observaciones", tipo: "texto" };

const avance: CampoEdp[] = [
  { clave: "avance_real", etiqueta: "Avance real", tipo: "numero", unidad: "%" },
  { clave: "avance_programado", etiqueta: "Avance programado", tipo: "numero", unidad: "%" },
];
const CLAVES_RETENCION = ["retencion_calidad", "retencion_anticipo", "retencion_fiel_cumplimiento"] as const;
const retenciones: CampoEdp[] = [
  { clave: "retencion_calidad", etiqueta: "Retención por calidad de los trabajos", tipo: "moneda" },
  { clave: "retencion_anticipo", etiqueta: "Retención de anticipo", tipo: "moneda" },
  { clave: "retencion_fiel_cumplimiento", etiqueta: "Retención por fiel cumplimiento", tipo: "moneda" },
];

const conceptosTorres = [
  ["torres_contrato", "Torres del contrato"],
  ["torres_adicionales", "Torres adicionales"],
  ["traslados", "Traslados"],
  ["mantenciones", "Mantenciones"],
] as const;
const arriendo: CampoEdp[] = [
  { clave: "torres_vigentes", etiqueta: "Equipos vigentes", tipo: "numero" },
  ...conceptosTorres.flatMap(([clave, etiqueta]): CampoEdp[] => [
    { clave: `cantidad_${clave}`, etiqueta: `Cantidad de ${etiqueta.toLowerCase()}`, tipo: "numero" },
    { clave: `uf_${clave}`, etiqueta: `Monto de ${etiqueta.toLowerCase()}`, tipo: "numero", unidad: "UF" },
  ]),
];

/**
 * Todos los campos que puede llevar un EDP, en el orden en que se muestran.
 * La plantilla "configurable" se arma eligiendo de esta lista.
 */
export const catalogoCamposEdp: { grupo: string; campos: CampoEdp[] }[] = [
  { grupo: "Trabajo", campos: [descripcion, hh, gr] },
  { grupo: "Avance", campos: avance },
  { grupo: "Retenciones", campos: retenciones },
  { grupo: "Arriendo (conceptos en UF)", campos: arriendo },
  { grupo: "Otros", campos: [observaciones] },
];
const todos = catalogoCamposEdp.flatMap((g) => g.campos);

export function camposEdp(plantilla: PlantillaEdp, tipo: TipoEdp, seleccion: string[] = []): CampoEdp[] {
  if (plantilla === "general") return [];
  if (plantilla === "configurable") {
    const marcadas = new Set(seleccion);
    return todos.filter((c) => marcadas.has(c.clave) && (!c.soloExtraordinario || tipo === "extraordinario"));
  }
  if (plantilla === "torres") return [descripcion, ...arriendo, observaciones];
  const campos = [descripcion, hh, ...(tipo === "extraordinario" ? [gr] : [])];
  if (plantilla === "carpas") campos.push(...avance, ...retenciones);
  return [...campos, observaciones];
}

/**
 * Qué hace el EDP además de pedir campos. Las plantillas fijas lo traen dado;
 * la configurable lo deduce de lo marcado.
 */
export function comportamientoEdp(plantilla: PlantillaEdp, seleccion: string[] = []) {
  const marcadas = new Set(seleccion);
  const configurable = plantilla === "configurable";
  return {
    /** Los montos van en UF y el neto sale con la UF del período. */
    usaUf: plantilla === "torres" || (configurable && conceptosTorres.some(([c]) => marcadas.has(`uf_${c}`))),
    /** Las retenciones se cargan una por una y su suma es la retención. */
    desglosaRetenciones: plantilla === "carpas" || (configurable && CLAVES_RETENCION.some((c) => marcadas.has(c))),
    /** El avance real se destaca en la cabecera del documento. */
    destacaAvance: plantilla === "carpas" || (configurable && marcadas.has("avance_real")),
  };
}

export const clavesRetencion = CLAVES_RETENCION;

export function montoUfTorres(datos: Datos): number {
  return conceptosTorres.reduce((total, [clave]) => total + (Number(datos[`uf_${clave}`]) || 0), 0);
}

export function clavesEdp(plantilla: PlantillaEdp, seleccion: string[] = []): string[] {
  return camposEdp(plantilla, "extraordinario", seleccion).map((campo) => campo.clave);
}
