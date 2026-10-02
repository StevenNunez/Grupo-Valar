import type { Datos } from "./campos";
import type { TipoEdp } from "./ingresos";

/** El formato visual es común; estos son los datos que pide cada mandante. */
export type PlantillaEdp = "miscelaneos" | "carpas" | "torres" | "general";
export const plantillasEdp: { id: PlantillaEdp; titulo: string; ayuda: string }[] = [
  { id: "general", titulo: "General", ayuda: "Para contratos que no necesitan un detalle especial en su EDP." },
  { id: "miscelaneos", titulo: "Misceláneos", ayuda: "EDP ordinarios y extraordinarios, con horas hombre y monto GR." },
  { id: "torres", titulo: "Torres", ayuda: "Torres vigentes, conceptos en UF y conversión con la UF del período." },
  { id: "carpas", titulo: "Carpas", ayuda: "Avance real y programado, con retenciones desglosadas." },
];

/** Conserva el formato con que se emitió un EDP aunque luego cambie el contrato. */
export function resolverPlantillaEdp(valor: unknown, actual: PlantillaEdp): PlantillaEdp {
  return plantillasEdp.some((p) => p.id === valor) ? valor as PlantillaEdp : actual;
}
export type CampoEdp = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "moneda";
  unidad?: string;
  soloExtraordinario?: boolean;
};

const base: CampoEdp[] = [
  { clave: "descripcion", etiqueta: "Descripción del trabajo", tipo: "texto" },
  { clave: "cantidad_hh", etiqueta: "Cantidad de HH", tipo: "numero", unidad: "HH" },
];

const gr: CampoEdp = {
  clave: "monto_gr",
  etiqueta: "Monto GR",
  tipo: "moneda",
  soloExtraordinario: true,
};

const observaciones: CampoEdp = { clave: "observaciones", etiqueta: "Observaciones", tipo: "texto" };

const conceptosTorres = [
  ["torres_contrato", "Torres del contrato"],
  ["torres_adicionales", "Torres adicionales"],
  ["traslados", "Traslados"],
  ["mantenciones", "Mantenciones"],
] as const;

export function camposEdp(plantilla: PlantillaEdp, tipo: TipoEdp): CampoEdp[] {
  if (plantilla === "general") return [];
  const comunes = base.filter((campo) => campo.clave !== "cantidad_hh");
  if (plantilla === "torres") {
    return [
      ...comunes,
      { clave: "torres_vigentes", etiqueta: "Torres vigentes", tipo: "numero" },
      ...conceptosTorres.flatMap(([clave, etiqueta]): CampoEdp[] => [
        { clave: `cantidad_${clave}`, etiqueta: `Cantidad de ${etiqueta.toLowerCase()}`, tipo: "numero" },
        { clave: `uf_${clave}`, etiqueta: `Monto de ${etiqueta.toLowerCase()}`, tipo: "numero", unidad: "UF" },
      ]),
      observaciones,
    ];
  }
  const campos = [...base, ...(tipo === "extraordinario" ? [gr] : [])];
  if (plantilla === "carpas") {
    campos.push(
      { clave: "avance_real", etiqueta: "Avance real", tipo: "numero", unidad: "%" },
      { clave: "avance_programado", etiqueta: "Avance programado", tipo: "numero", unidad: "%" },
      { clave: "retencion_calidad", etiqueta: "Retención por calidad de los trabajos", tipo: "moneda" },
      { clave: "retencion_anticipo", etiqueta: "Retención de anticipo", tipo: "moneda" },
      { clave: "retencion_fiel_cumplimiento", etiqueta: "Retención por fiel cumplimiento", tipo: "moneda" },
    );
  }
  return [...campos, observaciones];
}

export function montoUfTorres(datos: Datos): number {
  return conceptosTorres.reduce((total, [clave]) => total + (Number(datos[`uf_${clave}`]) || 0), 0);
}

export function clavesEdp(plantilla: PlantillaEdp): string[] {
  return camposEdp(plantilla, "extraordinario").map((campo) => campo.clave);
}
