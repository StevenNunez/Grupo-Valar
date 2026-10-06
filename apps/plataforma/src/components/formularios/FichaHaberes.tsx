"use client";

import { useId } from "react";
import { Ancho, CampoDinero, CampoNumero } from "../ui/Formulario";
import { formatearNumero, formatearPesos } from "@/lib/formato";
import { conceptosOtrosHaberes, motivosHhExtra, totalesDe, type Haberes, type OtroHaber } from "@/lib/haberes";

const celda =
  "w-full rounded-lg border border-mist-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";

/**
 * Otros haberes, uno por línea: qué es y cuánto. El total se suma solo. Los
 * conceptos frecuentes se sugieren al escribir, pero se puede poner cualquiera.
 */
function OtrosHaberes({ lista, alCambiar }: { lista: OtroHaber[]; alCambiar: (v: OtroHaber[]) => void }) {
  const sugerencias = useId();
  const total = lista.reduce((t, x) => t + (x.monto || 0), 0);
  const cambiar = (i: number, cambio: Partial<OtroHaber>) => alCambiar(lista.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  return (
    <Ancho>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Otros haberes</p>
        <p className="mt-1 text-xs text-ink-soft">Aguinaldos, bonos y asignaciones que no son HH extra ni no imponible. Uno por línea, con qué es.</p>
        <datalist id={sugerencias}>
          {conceptosOtrosHaberes.map((c) => <option key={c} value={c} />)}
        </datalist>
        {lista.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {lista.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label="Concepto"
                  list={sugerencias}
                  value={x.concepto}
                  placeholder="Aguinaldo fiestas patrias"
                  onChange={(e) => cambiar(i, { concepto: e.target.value })}
                  className={celda}
                />
                <div className="relative w-44 shrink-0">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-soft">$</span>
                  <input
                    aria-label={`Monto de ${x.concepto || "otro haber"}`}
                    inputMode="numeric"
                    value={x.monto ? x.monto.toLocaleString("es-CL") : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const limpio = e.target.value.replace(/\D/g, "");
                      cambiar(i, { monto: limpio === "" ? 0 : Number(limpio) });
                    }}
                    className={`${celda} pl-7 text-right tabular-nums`}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Quitar"
                  onClick={() => alCambiar(lista.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => alCambiar([...lista, { concepto: "", monto: 0 }])}
            className="rounded-full border border-mist-deep px-3 py-1 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            + Agregar otro haber
          </button>
          {total > 0 && (
            <span className="text-sm text-ink-soft">
              Total otros haberes <strong className="tabular-nums text-ink">{formatearPesos(total)}</strong>
            </span>
          )}
        </div>
      </div>
    </Ancho>
  );
}

/**
 * La ficha de haberes de la nómina: la misma para el personal de un contrato y
 * para el de Oficina Central.
 *
 * Es la misma información —sale de la misma nómina de pagos— y llenarla con
 * dos formularios distintos obligaba a recordar cuál pedía qué. Los nombres de
 * los campos son los de las columnas de la base, iguales en las dos tablas.
 */

export function FichaHaberes<T extends Haberes>({
  datos,
  campo,
  antesDeLeyes,
  horasHombre = 0,
  nota,
}: {
  datos: T;
  /** El `campo` de `useFormulario`: valor y cambio de una clave. */
  campo: <K extends keyof T>(clave: K) => { valor: T[K]; alCambiar: (v: T[K]) => void };
  /** Lo propio de cada uno que va antes de las leyes sociales (la planilla del contrato). */
  antesDeLeyes?: React.ReactNode;
  /** Para mostrar el costo por hora hombre, si se conoce. */
  horasHombre?: number;
  /** Lo que se agrega al pie del costo total (el código del registro, por ejemplo). */
  nota?: React.ReactNode;
}) {
  const { horasExtra, costoHhExtra, totalHaberes, costoTotal } = totalesDe(datos);
  const valorHoraExtra = horasExtra > 0 ? costoHhExtra / horasExtra : 0;
  const porHora = horasHombre > 0 ? costoTotal / horasHombre : 0;
  /* `campo` está tipado sobre T; acá solo se usan las claves de Haberes, que T
     tiene por construcción. */
  const c = (clave: keyof Haberes) => campo(clave as keyof T) as unknown as { valor: number; alCambiar: (v: number) => void };

  return (
    <>
      <CampoDinero
        etiqueta="Sueldo bruto"
        requerido
        ayuda="Sueldo base + gratificación: la remuneración imponible del mes, como viene en la nómina."
        {...c("sueldo_bruto")}
      />

      {/* Las HH extra van por motivo, con sus horas y lo que se pagó por
          ellas: "cuánto costó la parada de planta este mes" es lo que se
          discute con el mandante. */}
      <Ancho>
        <div className="border-t border-mist pt-5">
          <h3 className="font-display text-sm font-semibold text-ink">Horas extraordinarias</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Por motivo, como en la planilla: las horas y, al lado, lo que se pagó por ellas. El costo total se suma solo.
          </p>
        </div>
      </Ancho>

      {motivosHhExtra.map((m) => {
        const horas = datos[m.horas];
        const monto = datos[m.monto];
        const valorHora = horas > 0 && monto > 0 ? monto / horas : 0;
        return [
          <CampoNumero key={m.horas} etiqueta={m.titulo} min={0} sufijo="HH" ayuda={m.ayuda} {...c(m.horas)} />,
          <CampoDinero
            key={m.monto}
            etiqueta={`Costo · ${m.corto.toLowerCase()}`}
            ayuda={
              valorHora > 0
                ? `${formatearPesos(Math.round(valorHora))} la hora.`
                : horas > 0
                  ? "Lo que se pagó por estas horas, como viene en la nómina."
                  : undefined
            }
            {...c(m.monto)}
          />,
        ];
      })}

      <Ancho>
        <div className="flex flex-col gap-1.5 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-ink-soft">
            <span>
              Total HH extra{" "}
              <span className="font-display text-lg font-semibold tabular-nums text-ink">{formatearNumero(horasExtra)} HH</span>
            </span>
            <span>
              Costo total de las HH extra{" "}
              <span className="font-display text-lg font-semibold tabular-nums text-ink">{formatearPesos(costoHhExtra)}</span>
            </span>
          </p>
          <p className="text-xs leading-relaxed text-ink-soft">
            {valorHoraExtra > 0
              ? `Suma de los cinco motivos. En promedio sale a ${formatearPesos(Math.round(valorHoraExtra))} la hora. No se escribe.`
              : "Suma de los cinco motivos. No se escribe."}
          </p>
        </div>
      </Ancho>

      <Ancho>
        <div className="border-t border-mist pt-5">
          <h3 className="font-display text-sm font-semibold text-ink">Resto de los haberes</h3>
        </div>
      </Ancho>

      <CampoDinero etiqueta="Total no imponible" ayuda="Colación, movilización y viáticos." {...c("total_no_imponible")} />
      <OtrosHaberes
        lista={datos.otros_haberes_detalle}
        alCambiar={(campo("otros_haberes_detalle" as keyof T) as unknown as { alCambiar: (v: OtroHaber[]) => void }).alCambiar}
      />

      <Ancho>
        <div className="flex flex-col gap-1.5 rounded-xl border-2 border-ink bg-white px-4 py-3">
          <p className="flex items-baseline justify-between gap-4">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">Total haberes</span>
            <span className="font-display text-xl font-semibold tabular-nums text-ink">{formatearPesos(totalHaberes)}</span>
          </p>
          <p className="text-xs leading-relaxed text-ink-soft">
            Sueldo bruto, HH extra, no imponible y otros haberes. No se escribe: si no calza con tu nómina, la
            diferencia va en «otras» o en «otros haberes».
          </p>
        </div>
      </Ancho>

      {antesDeLeyes}

      <CampoDinero
        etiqueta="Leyes sociales"
        ayuda={
          totalHaberes > 0
            ? `Suelen rondar el 23% de los haberes: ${formatearPesos(Math.round(totalHaberes * 0.23))}.`
            : undefined
        }
        {...c("leyes_sociales")}
      />

      <Ancho>
        <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
          Costo total: <span className="font-semibold text-ink">{formatearPesos(costoTotal)}</span>
          {porHora > 0 && <span className="ml-2">· {formatearPesos(Math.round(porHora))} por hora hombre</span>}
          <span className="ml-2 text-xs">Total haberes más leyes sociales. Los finiquitos van aparte, en su propio registro.</span>
          {nota && <span className="mt-1.5 block text-xs">{nota}</span>}
        </p>
      </Ancho>
    </>
  );
}
