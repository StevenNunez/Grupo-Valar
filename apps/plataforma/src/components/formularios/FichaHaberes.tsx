"use client";

import { Ancho, CampoDinero, CampoNumero } from "../ui/Formulario";
import { formatearNumero, formatearPesos } from "@/lib/formato";
import { totalesDe, type Haberes } from "@/lib/haberes";

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
  const { horasExtra, totalHaberes, costoTotal } = totalesDe(datos);
  const valorHoraExtra = horasExtra > 0 ? datos.horas_extra_monto / horasExtra : 0;
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

      {/* Las HH extra van por motivo: "cuánto de este mes fue parada de
          planta" es lo que se discute con el mandante. */}
      <Ancho>
        <div className="border-t border-mist pt-5">
          <h3 className="font-display text-sm font-semibold text-ink">Horas extraordinarias</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            En horas, por motivo, como en la planilla. El costo va aparte.
          </p>
        </div>
      </Ancho>

      <CampoNumero etiqueta="Reemplazo por vacaciones o licencias" min={0} sufijo="HH" {...c("hh_reemplazo")} />
      <CampoNumero etiqueta="Parada de planta" min={0} sufijo="HH" {...c("hh_parada_planta")} />
      <CampoNumero etiqueta="Feriado compensado" min={0} sufijo="HH" {...c("hh_feriado_compensado")} />
      <CampoNumero etiqueta="Apoyo oficina" min={0} sufijo="HH" {...c("hh_apoyo_oficina")} />
      <CampoNumero
        etiqueta="Otras"
        min={0}
        sufijo="HH"
        ayuda="El resto de las horas extra. Acá va la diferencia si el total no calza con tu planilla."
        {...c("hh_otras")}
      />
      <CampoDinero
        etiqueta="Costo total de las HH extra"
        ayuda="En pesos, como viene en la nómina. No se calcula: el valor de la hora cambia mes a mes."
        {...c("horas_extra_monto")}
      />

      <Ancho>
        <div className="flex flex-col gap-1.5 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3">
          <p className="flex items-baseline justify-between gap-4 text-sm text-ink-soft">
            Total HH extra
            <span className="font-display text-lg font-semibold tabular-nums text-ink">{formatearNumero(horasExtra)} HH</span>
          </p>
          <p className="text-xs leading-relaxed text-ink-soft">
            {valorHoraExtra > 0
              ? `Suma de los cinco motivos. Sale a ${formatearPesos(Math.round(valorHoraExtra))} la hora.`
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
      <CampoDinero
        etiqueta="Otros haberes"
        ayuda="Aguinaldos y asignaciones que no son HH extra ni no imponible."
        {...c("otros_haberes")}
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
            ? `Aportes del empleador. Suelen rondar el 23%: ${formatearPesos(Math.round(totalHaberes * 0.23))}.`
            : "Aportes del empleador: cotizaciones y cargas sobre la remuneración."
        }
        {...c("leyes_sociales")}
      />

      <Ancho>
        <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
          Costo total: <span className="font-semibold text-ink">{formatearPesos(costoTotal)}</span>
          {porHora > 0 && <span className="ml-2">· {formatearPesos(Math.round(porHora))} por hora hombre</span>}
          <span className="ml-2 text-xs">Total haberes más leyes sociales.</span>
          {nota && <span className="mt-1.5 block text-xs">{nota}</span>}
        </p>
      </Ancho>
    </>
  );
}
