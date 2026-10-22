"use client";

import { Resumen } from "./ui/Vista";
import type { InformativosContrato } from "@/lib/informativos-contrato";
import { formatearMonto } from "@/lib/formato";

/**
 * Los tres datos informativos que van junto a las ventas: lo que falta por cobrar,
 * el valor de los activos y lo que se debe a proveedores. Ninguno es gasto ni
 * entra en el resultado: se ven aparte para no confundirlos con él.
 */
export function InformativosDelContrato({ info }: { info: InformativosContrato }) {
  if (info.porCobrar === 0 && info.porPagar === 0 && info.activos === 0) return null;
  return (
    <Resumen
      datos={[
        {
          etiqueta: "Por cobrar",
          valor: formatearMonto(info.porCobrar),
          nota: "Estados de pago presentados, aprobados o facturados que aún no se pagan · neto · informativo",
        },
        {
          etiqueta: "Activos",
          valor: formatearMonto(info.activos),
          nota:
            info.activosFuente === "referencia"
              ? "Valor neto total · anotado en el contrato · informativo, no es gasto"
              : "Valor neto de los activos del contrato · informativo, no es gasto",
        },
        {
          etiqueta: "Por pagar a proveedores",
          valor: formatearMonto(info.porPagar),
          nota: "Facturas y servicios sin pagar, con IVA, descontadas las cuotas ya transferidas · informativo",
        },
      ]}
    />
  );
}
