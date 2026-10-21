/**
 * Datos de la empresa. Copiados del sitio público (apps/web/src/lib/content.ts)
 * a propósito: cada app es autónoma.
 */
export const empresa = {
  nombre: "Valar",
  razonSocial: "Servicios y Proyectos Valar SpA",
  rut: "77.256.185-7",
  representante: "Francisco Valdés Araya",
  /* Dirección confirmada por el usuario el 08-09-2026: la de las órdenes de
     compra es la buena. El sitio público todavía muestra "Vicente Salgado 81,
     sector El Huáscar"; cambiarlo allá es decisión aparte. */
  direccion: "Heroes de la Concepción 8848, Antofagasta, Chile",
  email: "contacto@valar.live",
  /** Sitio público, para volver desde la plataforma. */
  sitioUrl: "https://www.grupovalar.cl",
} as const;

/**
 * Lo que va impreso en la orden de compra, tomado de las 114 órdenes que Valar
 * ya emitió (OC22-001015 en adelante).
 *
 * La dirección es la de las órdenes de compra, que es la que el proveedor
 * conoce. Confirmada por el usuario el 08-09-2026 frente a la del sitio
 * público, que es distinta.
 *
 * Quien autoriza es fijo porque es el representante legal. Quien EMITE no:
 * cambia según la persona que la hizo, y se guarda en cada orden.
 */
export const emisorOC = {
  razonSocial: "VALAR SPA",
  rut: "77256185-7",
  direccion: "Heroes de la Concepción 8848",
  ciudad: "Antofagasta",
  comuna: "Antofagasta",
  region: "Antofagasta",
  autorizadoPor: empresa.representante,
  condicionesPagoPorDefecto: "30 días",
  /* Serie y correlativo con que sigue la numeración. La última orden emitida
     fuera de la plataforma fue la OC22-001128. */
  serieOC: "OC22",
  siguienteCorrelativo: 1129,
  digitosCorrelativo: 6,
} as const;

/* ── Los datos de la empresa, editables (0094) ────────────────────────────── */

/**
 * Lo que sale impreso o escrito en documentos: viene de la fila de `empresas`
 * (se edita desde «Datos de la empresa»). Las constantes de arriba quedan como
 * valores por defecto: son lo que se usa antes de iniciar sesión (pantalla de
 * acceso) y mientras los datos cargan, y no cambian lo que ya estaba escrito.
 */
export type DatosEmpresa = {
  id: string | null;
  /** Cómo se llama en pantalla. */
  nombre: string;
  /** Razón social legal: correos, informes, pie de página. */
  razonSocial: string;
  /** Cómo la conoce el proveedor: OC y solicitudes de cotización. */
  nombreEnOrdenes: string;
  rut: string;
  direccion: string;
  ciudad: string;
  region: string;
  email: string;
  representante: string;
};

export const DATOS_POR_DEFECTO: DatosEmpresa = {
  id: null,
  nombre: "Valar SpA",
  razonSocial: empresa.razonSocial,
  nombreEnOrdenes: emisorOC.razonSocial,
  rut: empresa.rut,
  direccion: emisorOC.direccion,
  ciudad: emisorOC.ciudad,
  region: emisorOC.region,
  email: empresa.email,
  representante: empresa.representante,
};

/** Las columnas de `empresas` que arman `DatosEmpresa`. */
export const COLUMNAS_EMPRESA = "id, nombre, razon_social, nombre_en_ordenes, rut, direccion, ciudad, region, email_contacto, representante";

export type FilaEmpresa = {
  id: string;
  nombre: string | null;
  razon_social: string | null;
  nombre_en_ordenes: string | null;
  rut: string | null;
  direccion: string | null;
  ciudad: string | null;
  region: string | null;
  email_contacto: string | null;
  representante: string | null;
};

/** Una fila de la base → los datos; lo que falte se completa con los valores por defecto. */
export function datosDeFila(f: FilaEmpresa | null | undefined): DatosEmpresa {
  if (!f) return DATOS_POR_DEFECTO;
  const d = DATOS_POR_DEFECTO;
  const v = (x: string | null | undefined, por: string) => (x?.trim() ? x.trim() : por);
  const nombre = v(f.nombre, d.nombre);
  const razonSocial = v(f.razon_social, nombre);
  return {
    id: f.id,
    nombre,
    razonSocial,
    nombreEnOrdenes: v(f.nombre_en_ordenes, razonSocial.toUpperCase()),
    rut: v(f.rut, d.rut),
    direccion: v(f.direccion, d.direccion),
    ciudad: v(f.ciudad, d.ciudad),
    region: v(f.region, d.region),
    email: v(f.email_contacto, d.email),
    representante: v(f.representante, d.representante),
  };
}

/** La dirección completa en una línea: «Heroes de la Concepción 8848, Antofagasta». */
export const direccionCompleta = (d: DatosEmpresa) => [d.direccion, d.ciudad].filter(Boolean).join(", ");
