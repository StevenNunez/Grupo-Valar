"use client";

import { useConsulta } from "@/lib/consulta";
import { cargarEstadoUf, type EstadoUf } from "@/lib/dashboard";
import { diasDesde, formatearFecha } from "@/lib/formato";

/* ── Valor de la UF ───────────────────────────────────────────────────────── */

/**
 * Qué UF rige hoy y si la serie está al día.
 *
 * No es decoración: C-TORRES se factura en UF, así que un valor viejo se
 * traduce en un ingreso mal calculado. La serie la trae sola una tarea diaria
 * de la base; esta línea es la forma de darse cuenta si dejó de correr.
 *
 * Si la vista todavía no existe —la migración 0011 sin aplicar— no muestra
 * nada: no tiene sentido alarmar por algo que no está encendido.
 */
export function ValorUf() {
  const { estado } = useConsulta<EstadoUf | null>(cargarEstadoUf);

  if (estado.estado !== "listo" || !estado.datos) return null;

  const uf = estado.datos;
  const dias = diasDesde(uf.ultimoDiaCargado);
  // La UF se publica con anticipación, así que lo normal es que la serie llegue
  // hasta mañana o más allá. Tres días de atraso ya es que algo dejó de correr.
  const atrasada = dias > 3;

  return (
    <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span className="font-semibold text-ink">
        UF {uf.valorHoy.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
      </span>
      <span>al {formatearFecha(uf.fechaValor)}</span>
      {atrasada ? (
        <span className="rounded-full bg-peligro-suave px-2.5 py-0.5 text-xs font-semibold text-peligro">
          La serie no se actualiza hace {dias} días
        </span>
      ) : (
        <span className="text-xs">· se actualiza sola todos los días</span>
      )}
    </p>
  );
}
