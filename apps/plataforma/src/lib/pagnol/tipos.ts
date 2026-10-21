import type { components } from "./schema";

/** Los recursos de Pagnol tal como los define su contrato (generados en `schema.d.ts`). */
export type MaterialPagnol = components["schemas"]["Material"];
export type ProveedorPagnol = components["schemas"]["Proveedor"];
export type ActivoPagnol = components["schemas"]["Activo"];
export type ExistenciasPagnol = components["schemas"]["Existencias"];

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

/** Una línea ya informada (o por informar) de una compra directa, para mostrarla. */
export type EnvioDeCompra = {
  id: string;
  tipo: "activo" | "ingreso";
  descripcion: string | null;
  /** En los activos, cuál de las unidades de la línea. */
  unidad: number | null;
  cantidad: number | null;
  estado: "pendiente" | "enviado" | "error";
  error: string | null;
  /** Ya se revirtió en Pagnol (reverso o baja). */
  deshecho: boolean;
};
