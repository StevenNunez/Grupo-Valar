"use client";

import { mensajeParaPersona } from "@/lib/errores";
import { useState } from "react";
import { Dialogo } from "../ui/Formulario";
import { seleccionarCotizacion, type Cotizacion, type Solped } from "@/lib/abastecimiento";
import { formatearPesos } from "@/lib/formato";
import { Etiqueta, Ayuda } from "./piezas";

/* ── Elegir proveedor ─────────────────────────────────────────────────────── */

export function DialogoSeleccion({
  solped,
  cotizacion,
  mejor,
  motivoInicial,
  alCerrar,
  alElegido,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  mejor: number;
  motivoInicial?: string;
  alCerrar: () => void;
  alElegido: () => void;
}) {
  const esElMasBarato = cotizacion.costoPuesto <= mejor;
  const [motivo, setMotivo] = useState(
    motivoInicial ?? (esElMasBarato ? "Menor costo puesto en obra" : ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const diferencia = cotizacion.costoPuesto - mejor;

  async function confirmar() {
    setError(null);
    setGuardando(true);
    try {
      await seleccionarCotizacion(solped.id, cotizacion.id, motivo);
      alElegido();
      alCerrar();
    } catch (e) {
      setError(mensajeParaPersona(e, "CotizacionesDeSolped"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      titulo={`Elegir a ${cotizacion.proveedor}`}
      descripcion={`${formatearPesos(cotizacion.costoPuesto)} puestos en obra`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-lg"
    >
      <div className="px-6 py-6">
        {!esElMasBarato && (
          <p className="mb-4 rounded-xl bg-alerta-suave px-4 py-3 text-sm text-alerta">
            No es la más barata: hay otra {formatearPesos(diferencia)} más abajo. Puede
            haber buenas razones —plazo, stock, garantía—, y conviene que queden escritas.
          </p>
        )}

        <label>
          <Etiqueta>Motivo de la selección</Etiqueta>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Entrega en 3 días y tiene stock completo."
            className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-cyan"
          />
          <Ayuda>
            Queda guardado en la cotización. Es lo que sirve cuando alguien pregunte seis
            meses después por qué se le compró a este.
          </Ayuda>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-mist px-6 py-5">
        <button
          type="button"
          onClick={alCerrar}
          disabled={guardando}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={guardando || !motivo.trim()}
          className="rounded-full bg-cyan-deep px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Elegir este proveedor"}
        </button>
      </div>
    </Dialogo>
  );
}
