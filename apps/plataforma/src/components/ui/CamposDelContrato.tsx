"use client";

import { Ancho, CampoDinero, CampoFecha, CampoNumero, CampoSeleccion, CampoTexto } from "./Formulario";
import { camposDe, faltantes, type CampoContrato, type Datos, type Seccion } from "@/lib/campos";

/**
 * Los campos propios del contrato, dibujados dentro de un formulario.
 *
 * Aparecen abajo del núcleo fijo y cambian solos cuando se cambia el contrato
 * en el desplegable de arriba: es lo que hace que cargar un costo de
 * Misceláneos pida cargo, turno y horas, y uno de Torres pida número de torres
 * y días de arriendo.
 *
 * Si el contrato no tiene planilla definida, no se muestra nada: el formulario
 * queda como estaba y se puede seguir trabajando igual.
 */
export function CamposDelContrato({
  campos,
  contratoId,
  seccion,
  datos,
  alCambiar,
}: {
  campos: CampoContrato[];
  contratoId: string;
  seccion: Seccion;
  datos: Datos;
  alCambiar: (datos: Datos) => void;
}) {
  const propios = camposDe(campos, contratoId, seccion);
  if (propios.length === 0) return null;

  const falta = faltantes(propios, datos);

  const set = (clave: string, valor: Datos[string]) =>
    alCambiar({ ...datos, [clave]: valor });

  return (
    <>
      <Ancho>
        <div className="border-t border-mist pt-5">
          <h3 className="font-display text-sm font-semibold text-ink">
            Planilla del contrato
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Lo que este contrato necesita para armar su estado de pago. Cada contrato
            pide lo suyo.
            {falta.length > 0 && (
              <span className="mt-1 block text-[#8a5a09]">
                Falta completar: {falta.join(", ")}.
              </span>
            )}
          </p>
        </div>
      </Ancho>

      {propios.map((c) => {
        const valor = datos[c.clave];

        if (c.tipo === "numero") {
          return (
            <CampoNumero
              key={c.id}
              etiqueta={c.etiqueta}
              sufijo={c.unidad ?? undefined}
              ayuda={c.ayuda ?? undefined}
              requerido={c.obligatorio}
              valor={typeof valor === "number" ? valor : 0}
              alCambiar={(v) => set(c.clave, v)}
            />
          );
        }

        if (c.tipo === "moneda") {
          return (
            <CampoDinero
              key={c.id}
              etiqueta={c.etiqueta}
              ayuda={c.ayuda ?? undefined}
              requerido={c.obligatorio}
              valor={typeof valor === "number" ? valor : 0}
              alCambiar={(v) => set(c.clave, v)}
            />
          );
        }

        if (c.tipo === "fecha") {
          return (
            <CampoFecha
              key={c.id}
              etiqueta={c.etiqueta}
              ayuda={c.ayuda ?? undefined}
              requerido={c.obligatorio}
              valor={typeof valor === "string" ? valor : ""}
              alCambiar={(v) => set(c.clave, v)}
            />
          );
        }

        if (c.tipo === "opcion") {
          return (
            <CampoSeleccion
              key={c.id}
              etiqueta={c.etiqueta}
              ayuda={c.ayuda ?? undefined}
              requerido={c.obligatorio}
              opciones={[
                { id: "", titulo: "— Elegir —" },
                ...c.opciones.map((o) => ({ id: o, titulo: o })),
              ]}
              valor={typeof valor === "string" ? valor : ""}
              alCambiar={(v) => set(c.clave, v)}
            />
          );
        }

        if (c.tipo === "booleano") {
          return (
            <label
              key={c.id}
              className="flex items-start gap-3 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3"
            >
              <input
                type="checkbox"
                checked={valor === true}
                onChange={(e) => set(c.clave, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-mist-deep accent-cyan"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{c.etiqueta}</span>
                {c.ayuda && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    {c.ayuda}
                  </span>
                )}
              </span>
            </label>
          );
        }

        return (
          <CampoTexto
            key={c.id}
            etiqueta={c.etiqueta}
            ayuda={c.ayuda ?? undefined}
            requerido={c.obligatorio}
            valor={typeof valor === "string" ? valor : ""}
            alCambiar={(v) => set(c.clave, v)}
          />
        );
      })}
    </>
  );
}
