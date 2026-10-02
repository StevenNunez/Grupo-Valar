/**
 * Navegación interna de cada módulo.
 *
 * Dos niveles en la misma barra lateral: las secciones grandes arriba y, cuando
 * una tiene varias vistas, sus subsecciones colgando debajo. Antes esas vistas
 * eran pestañas sobre el contenido; se pasaron al menú para que se vea toda la
 * estructura del módulo de una sola mirada, sin entrar a cada sección.
 *
 * Cada módulo trae su propia lista y `MarcoModulo` recibe la que corresponde.
 * Antes la lista era una sola y estaba escrita dentro del marco: con dos
 * módulos, eso significaba que Abastecimiento mostraba el menú de Control de
 * Gestión.
 *
 * Para agregar una vista: se suma a la lista de su módulo y se crea su carpeta
 * con un `page.tsx` bajo la ruta del módulo.
 */

export const RAIZ_GESTION = "/control-de-gestion";
export const RAIZ_ABASTECIMIENTO = "/abastecimiento";

export type Subseccion = {
  titulo: string;
  href: string;
  /** El permiso "Ver…" que la abre. */
  permiso?: string;
};

export type Seccion = {
  id: string;
  titulo: string;
  icono:
    | "dashboard"
    | "contratos"
    | "ingresos"
    | "egresos"
    | "solicitudes"
    | "ordenes"
    | "pagos"
    | "articulos"
    | "proveedores";
  /** Adónde lleva el enlace de la sección (su primera subsección, si tiene). */
  href: string;
  /** Prefijo con el que se decide si la sección está activa. */
  base: string;
  /** Coincidencia exacta en vez de por prefijo (solo los paneles). */
  exacta?: boolean;
  /** El permiso "Ver…" que la abre. Sin esto la ve cualquiera que entre al
      módulo (los paneles). Las que tienen subsecciones miran las de ellas. */
  permiso?: string;
  subsecciones?: Subseccion[];
};

/* ── Control de Gestión ───────────────────────────────────────────────────── */

export const seccionesGestion: Seccion[] = [
  {
    id: "dashboard",
    titulo: "Dashboard",
    icono: "dashboard",
    href: `${RAIZ_GESTION}/`,
    base: `${RAIZ_GESTION}`,
    exacta: true,
  },
  {
    id: "contratos",
    titulo: "Contratos",
    icono: "contratos",
    href: `${RAIZ_GESTION}/contratos/`,
    base: `${RAIZ_GESTION}/contratos`,
    permiso: "contratos.ver",
  },
  {
    id: "ingresos",
    titulo: "Ingresos",
    icono: "ingresos",
    href: `${RAIZ_GESTION}/ingresos/estado-de-pago/`,
    base: `${RAIZ_GESTION}/ingresos`,
    subsecciones: [
      { titulo: "Estado de Pago", href: `${RAIZ_GESTION}/ingresos/estado-de-pago/`, permiso: "ingresos.ver" },
      { titulo: "Órdenes de Compra", href: `${RAIZ_GESTION}/ingresos/oc/`, permiso: "ingresos.ver" },
      { titulo: "Facturas", href: `${RAIZ_GESTION}/ingresos/facturas/`, permiso: "ingresos.ver" },
    ],
  },
  {
    id: "egresos",
    titulo: "Egresos",
    icono: "egresos",
    href: `${RAIZ_GESTION}/egresos/terceros/`,
    base: `${RAIZ_GESTION}/egresos`,
    subsecciones: [
      /* Compras y servicios se miran juntos: son la misma pregunta —qué se
         gastó con terceros— y en dos pantallas había que sumar de cabeza. */
      { titulo: "Compras y Servicios", href: `${RAIZ_GESTION}/egresos/terceros/`, permiso: "egresos.ver" },
      { titulo: "Personal", href: `${RAIZ_GESTION}/egresos/personal/`, permiso: "personal.ver" },
      { titulo: "Oficina Central", href: `${RAIZ_GESTION}/egresos/oficina-central/`, permiso: "oficina_central.ver" },
    ],
  },
];

/* ── Abastecimiento ───────────────────────────────────────────────────────── */

/**
 * Las órdenes de compra a proveedor viven acá y ya no en Egresos.
 *
 * Estaban en Control de Gestión porque fueron lo primero que se construyó, pero
 * emitir una OC no es controlar la gestión: es el final del trabajo de
 * abastecimiento. En Control de Gestión el gasto se sigue viendo —la OC alimenta
 * las compras y estas el margen—, pero la orden se emite desde su módulo.
 */
export const seccionesAbastecimiento: Seccion[] = [
  {
    id: "panel",
    titulo: "Panel",
    icono: "dashboard",
    href: `${RAIZ_ABASTECIMIENTO}/`,
    base: `${RAIZ_ABASTECIMIENTO}`,
    exacta: true,
  },
  {
    id: "solicitudes",
    titulo: "Solicitudes",
    icono: "solicitudes",
    href: `${RAIZ_ABASTECIMIENTO}/solped/`,
    base: `${RAIZ_ABASTECIMIENTO}/solped`,
    permiso: "solped.ver",
  },
  {
    id: "ordenes",
    titulo: "Órdenes de Compra",
    icono: "ordenes",
    href: `${RAIZ_ABASTECIMIENTO}/ordenes/`,
    base: `${RAIZ_ABASTECIMIENTO}/ordenes`,
    permiso: "ordenes.ver",
  },
  {
    id: "pagos",
    titulo: "Pagos",
    icono: "pagos",
    href: `${RAIZ_ABASTECIMIENTO}/pagos/`,
    base: `${RAIZ_ABASTECIMIENTO}/pagos`,
    permiso: "pagos.ver",
  },
  {
    id: "articulos",
    titulo: "Artículos",
    icono: "articulos",
    href: `${RAIZ_ABASTECIMIENTO}/articulos/`,
    base: `${RAIZ_ABASTECIMIENTO}/articulos`,
    permiso: "articulos.ver",
  },
  {
    id: "proveedores",
    titulo: "Proveedores",
    icono: "proveedores",
    href: `${RAIZ_ABASTECIMIENTO}/proveedores/`,
    base: `${RAIZ_ABASTECIMIENTO}/proveedores`,
    permiso: "proveedores.ver",
  },
];

/* ── Lo que ve cada uno ───────────────────────────────────────────────────── */

/**
 * El menú recortado a lo que la persona puede ver.
 *
 * Una sección con subsecciones queda si le queda alguna, y su enlace pasa a
 * ser la primera que ve: a quien solo ve Personal, "Egresos" no lo puede
 * mandar a Compras y Servicios.
 */
export function seccionesVisibles(
  secciones: Seccion[],
  ve: (permiso: string) => boolean,
): Seccion[] {
  const resultado: Seccion[] = [];
  for (const s of secciones) {
    if (s.subsecciones) {
      const subsecciones = s.subsecciones.filter((sub) => !sub.permiso || ve(sub.permiso));
      if (subsecciones.length > 0) resultado.push({ ...s, href: subsecciones[0].href, subsecciones });
    } else if (!s.permiso || ve(s.permiso)) {
      resultado.push(s);
    }
  }
  return resultado;
}

/**
 * Si la ruta abierta cae en algo que la persona no ve. Para cuando entra por
 * un enlace guardado: el menú ya no se lo ofrece, pero la URL sigue sirviendo.
 */
export function rutaVedada(secciones: Seccion[], pathname: string, ve: (permiso: string) => boolean) {
  const seccion = seccionDe(secciones, pathname);
  if (!seccion) return false;
  const sub = seccion.subsecciones?.find((x) => esSubseccionActiva(pathname, x.href));
  const permiso = sub?.permiso ?? seccion.permiso;
  return !!permiso && !ve(permiso);
}

/* ── Dónde estoy ──────────────────────────────────────────────────────────── */

/** La sección a la que pertenece una ruta, para pintar la barra. */
export function seccionDe(secciones: Seccion[], pathname: string): Seccion | undefined {
  const limpio = pathname.replace(/\/$/, "");
  return (
    secciones.find((s) => !s.exacta && limpio.startsWith(s.base)) ??
    secciones.find((s) => s.exacta && limpio === s.base)
  );
}

/** Si una ruta cae dentro de una subsección concreta. */
export function esSubseccionActiva(pathname: string, href: string) {
  return pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
}
