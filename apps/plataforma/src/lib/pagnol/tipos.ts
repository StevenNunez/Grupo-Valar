import type { components } from "./schema";

/** Los recursos de Pagnol tal como los define su contrato (generados en `schema.d.ts`). */
export type MaterialPagnol = components["schemas"]["Material"];
export type ProveedorPagnol = components["schemas"]["Proveedor"];

/** Lo que devuelve cada búsqueda: los datos, o un error escrito para la pantalla. */
export type Resultado<T> =
  | { ok: true; datos: T[]; siguiente: string | null }
  | { ok: false; error: string };
