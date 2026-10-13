"use client";

import { useEffect, useState } from "react";
import { Etiqueta } from "../ui/Chip";
import { claseCelda } from "./LineasDeGasto";
import {
  conceptosLinea,
  equiposDelContrato,
  lineaServicioVacia,
  lineasDelMesAnterior,
  netoDeLineaServicio,
  type LineaServicio,
} from "@/lib/egresos";
import { formatearPesos } from "@/lib/formato";

/**
 * El detalle por equipo del estado de pago del proveedor: una línea por torre,
 * con sus días y su valor. Es opcional; cuando hay líneas, el neto del servicio
 * es la suma de ellas y deja de escribirse a mano.
 *
 * Compara con lo que el contrato dice que se arrienda (condiciones.arriendo):
 * si el estado de pago cobra más o menos equipos, se avisa antes de guardar.
 */

const pesos = (n: number) => (n === 0 ? "" : n.toLocaleString("es-CL"));
const soloNumero = (s: string) => Number(s.replace(/\D/g, "")) || 0;

export function LineasDeServicio({
  lineas,
  alCambiar,
  contratoId,
  contratista,
  fecha,
  servicioId,
  faenaPorDefecto,
}: {
  lineas: LineaServicio[];
  alCambiar: (lineas: LineaServicio[]) => void;
  contratoId: string;
  contratista: string;
  fecha: string;
  servicioId?: string;
  faenaPorDefecto: string;
}) {
  const [contrato, setContrato] = useState<{ tipo: string; cantidad: number }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    equiposDelContrato(contratoId).then((e) => vigente && setContrato(e));
    return () => {
      vigente = false;
    };
  }, [contratoId]);

  const contratados = contrato.reduce((t, e) => t + e.cantidad, 0);
  const arrendadas = lineas.filter((l) => l.concepto === "arriendo" && l.equipo.trim());
  const equiposDistintos = new Set(arrendadas.map((l) => l.equipo.trim().toLowerCase())).size;
  const total = lineas.reduce((t, l) => t + l.neto, 0);

  function cambiar(clave: string, parte: Partial<LineaServicio>) {
    alCambiar(
      lineas.map((l) => {
        if (l.clave !== clave) return l;
        const nueva = { ...l, ...parte };
        // Cantidad y precio recalculan el neto; si se escribe el neto, manda lo escrito.
        if ("cantidad" in parte || "precioUnitario" in parte) nueva.neto = netoDeLineaServicio(nueva);
        return nueva;
      }),
    );
  }

  function cargarDelContrato() {
    const e = contrato[0];
    if (!e) return;
    const base = lineas.filter((l) => l.equipo.trim());
    const nuevas = Array.from({ length: e.cantidad }, (_, i) =>
      lineaServicioVacia({ equipo: `${e.tipo} ${String(i + 1).padStart(2, "0")}`, faena: faenaPorDefecto }),
    );
    alCambiar([...base, ...nuevas]);
  }

  async function copiarMesAnterior() {
    setAviso(null);
    try {
      const previas = await lineasDelMesAnterior(contratoId, contratista, fecha, servicioId);
      if (previas.length === 0) {
        setAviso("No hay un estado de pago anterior con detalle para copiar.");
        return;
      }
      alCambiar(previas.map((l) => lineaServicioVacia({ ...l })));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="border-t border-mist px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Detalle por equipo</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            Una línea por torre del estado de pago. Opcional: si lo llenas, el neto sale de la suma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contrato.length > 0 && (
            <Boton onClick={cargarDelContrato}>Cargar las {contratados} del contrato</Boton>
          )}
          <Boton onClick={copiarMesAnterior}>Copiar mes anterior</Boton>
          <Boton onClick={() => alCambiar([...lineas, lineaServicioVacia({ faena: faenaPorDefecto })])}>+ Agregar línea</Boton>
        </div>
      </div>

      {aviso && <p className="mb-3 text-xs text-[#a52f24]">{aviso}</p>}

      {lineas.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="py-2 pr-3">Equipo</th>
                  <th className="w-32 py-2 pr-3">Concepto</th>
                  <th className="w-36 py-2 pr-3">Faena</th>
                  <th className="w-20 py-2 pr-3 text-right">Días</th>
                  <th className="w-20 py-2 pr-3 text-right">Cant.</th>
                  <th className="w-32 py-2 pr-3 text-right">Precio unit.</th>
                  <th className="w-32 py-2 pr-3 text-right">Neto</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.clave} className="border-b border-mist last:border-0">
                    <td className="py-2 pr-3">
                      <input aria-label="Equipo" value={l.equipo} placeholder="Torre 01" className={claseCelda}
                        onChange={(e) => cambiar(l.clave, { equipo: e.target.value })} />
                    </td>
                    <td className="py-2 pr-3">
                      <select aria-label="Concepto" value={l.concepto} className={claseCelda}
                        onChange={(e) => cambiar(l.clave, { concepto: e.target.value as LineaServicio["concepto"] })}>
                        {conceptosLinea.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input aria-label="Faena" value={l.faena} className={claseCelda}
                        onChange={(e) => cambiar(l.clave, { faena: e.target.value })} />
                    </td>
                    <td className="py-2 pr-3">
                      <input aria-label="Días" type="number" min="0" value={l.dias || ""} className={`${claseCelda} text-right tabular-nums`}
                        onChange={(e) => cambiar(l.clave, { dias: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2 pr-3">
                      <input aria-label="Cantidad" type="number" min="0" step="any" value={l.cantidad} className={`${claseCelda} text-right tabular-nums`}
                        onChange={(e) => cambiar(l.clave, { cantidad: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2 pr-3">
                      <input aria-label="Precio unitario" inputMode="numeric" value={pesos(l.precioUnitario)} placeholder="0" className={`${claseCelda} text-right tabular-nums`}
                        onChange={(e) => cambiar(l.clave, { precioUnitario: soloNumero(e.target.value) })} />
                    </td>
                    <td className="py-2 pr-3">
                      <input aria-label="Neto" inputMode="numeric" value={pesos(l.neto)} placeholder="0" className={`${claseCelda} text-right font-semibold tabular-nums`}
                        onChange={(e) => cambiar(l.clave, { neto: soloNumero(e.target.value) })} />
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" aria-label="Quitar línea" onClick={() => alCambiar(lineas.filter((x) => x.clave !== l.clave))}
                        className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-[#fdeeec] hover:text-[#a52f24]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta destacada>{equiposDistintos} equipos en arriendo</Etiqueta>
              {contratados > 0 && equiposDistintos !== contratados && (
                <span className="text-xs font-semibold text-[#a15c07]">
                  El contrato contempla {contratados}; este estado de pago trae {equiposDistintos}.
                </span>
              )}
            </div>
            <p className="font-display text-lg font-semibold text-ink">
              Neto del detalle <span className="ml-2 tabular-nums">{formatearPesos(total)}</span>
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Boton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
    >
      {children}
    </button>
  );
}
