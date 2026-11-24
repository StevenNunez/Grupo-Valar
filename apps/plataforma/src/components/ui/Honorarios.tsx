"use client";

import { formatearNumero, formatearPesos } from "@/lib/formato";
import { retencionDe, tasaRetencion } from "@/lib/honorarios";
import { Ancho } from "./Formulario";

/*
 * Boleta de honorarios o de prestación de servicios de terceros, igual en
 * Servicios, Compras y Oficina Central (0128/0129): la casilla que la marca y
 * el resumen bruto · retención · líquido que reemplaza al del IVA.
 */

export function CasillaHonorarios({
  marcada,
  alCambiar,
  fecha,
}: {
  marcada: boolean;
  alCambiar: (v: boolean) => void;
  /** La fecha de la boleta: fija la tasa del año. */
  fecha: string | null | undefined;
}) {
  return (
    <Ancho>
      <label className="flex items-start gap-3 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(e) => alCambiar(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-mist-deep accent-cyan"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">
            Es boleta de honorarios o de prestación de servicios de terceros
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
            No lleva IVA: se retiene el {formatearNumero(tasaRetencion(fecha))}% del bruto y se paga al SII; al
            prestador se le paga el líquido. Al gasto se carga el bruto.
          </span>
        </span>
      </label>
    </Ancho>
  );
}

export function ResumenHonorarios({ bruto, fecha }: { bruto: number; fecha: string | null | undefined }) {
  const retencion = retencionDe(bruto, fecha);
  return (
    <Ancho>
      <div className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
        <p>
          Bruto <strong className="tabular-nums text-ink">{formatearPesos(bruto)}</strong>
          {" · "}Retención {formatearNumero(tasaRetencion(fecha))}%{" "}
          <strong className="tabular-nums text-ink">{formatearPesos(retencion)}</strong>
          {" · "}Líquido al prestador{" "}
          <strong className="tabular-nums text-ink">{formatearPesos(bruto - retencion)}</strong>
        </p>
        <p className="mt-0.5 text-xs">
          Sin IVA. La retención se declara y paga en el F29 del mes siguiente a la boleta; el gasto es el bruto.
        </p>
      </div>
    </Ancho>
  );
}

/** Si el error de la base es porque falta la migración de la boleta, lo dice en castellano. */
export function errorSinMigracionHonorarios(e: unknown, migracion: string): unknown {
  if (e instanceof Error && /boleta_honorarios|retencion/.test(e.message)) {
    return new Error(`Para guardar boletas de honorarios falta aplicar la migración ${migracion} en Supabase.`);
  }
  return e;
}
