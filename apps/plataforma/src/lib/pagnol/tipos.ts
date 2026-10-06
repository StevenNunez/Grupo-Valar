import type { components } from "./schema";

/** Los recursos de Pagnol tal como los define su contrato (generados en `schema.d.ts`). */
export type MaterialPagnol = components["schemas"]["Material"];
export type ProveedorPagnol = components["schemas"]["Proveedor"];

/** Lo que devuelve cada búsqueda: los datos, o un error escrito para la pantalla. */
export type Resultado<T> =
  | { ok: true; datos: T[]; siguiente: string | null }
  | { ok: false; error: string };

/** Lo que la plataforma usa de un pañol (`GET /panoles`). */
export type PanolPagnol = { id: string; nombre: string; ubicacion: string | null; activo: boolean };

/** Cómo quedó lo que se le informó a Pagnol de una recepción. */
export type ResumenEnvio = {
  /** Envíos directos (activos por unidad + ingresos de stock). */
  total: number;
  enviados: number;
  /** Lo que falló o no se pudo preparar, escrito para la pantalla. */
  errores: string[];
};
