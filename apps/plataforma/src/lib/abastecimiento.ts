/**
 * Datos del módulo de Abastecimiento: proveedores y SOLPED.
 *
 * El ciclo que sostiene es: llega una solicitud de faena → se aprueba la
 * necesidad → se cotiza → se compra. Las órdenes de compra ya existían y viven
 * en `lib/ordenes.ts`; acá está lo que va antes.
 *
 * Ver `supabase/migraciones/0015_abastecimiento.sql` para el modelo.
 */

export * from "./abastecimiento/proveedores";
export * from "./abastecimiento/condiciones-pago";
export * from "./abastecimiento/solped";
export * from "./abastecimiento/aprobaciones";
export * from "./abastecimiento/avance";
export * from "./abastecimiento/cotizaciones";
export * from "./abastecimiento/pedir-cotizacion";
export * from "./abastecimiento/envio-solicitud";
export * from "./abastecimiento/orden-desde-cotizacion";
