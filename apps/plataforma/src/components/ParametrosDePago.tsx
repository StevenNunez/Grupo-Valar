"use client";

import { useState, type FormEvent } from "react";
import { CampoDinero, CampoNumero, Campos, Dialogo, Pie, useFormulario } from "./ui/Formulario";
import { guardarParametrosPago, type ParametrosPago } from "@/lib/pagos";

/**
 * Los parámetros del flujo de pago de la empresa. Quien tiene «Cambiar
 * parámetros» los edita (el RLS de `parametros_pago` decide de verdad).
 */
export function ParametrosDePago({ parametros, alCerrar, alGuardado }: {
  parametros: ParametrosPago;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario({
    umbralCuotas: parametros.umbralCuotas,
    topeSemanal: parametros.topeSemanal,
    plazoPagoDias: parametros.plazoPagoDias,
    diasAlertaVencimiento: parametros.diasAlertaVencimiento,
  });
  const [guardado, setGuardado] = useState(false);

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const d = f.datos;
    if (![d.umbralCuotas, d.topeSemanal].every((n) => Number.isFinite(n) && n >= 0)) {
      return f.setError("Los montos no pueden ser negativos.");
    }
    if (![d.plazoPagoDias, d.diasAlertaVencimiento].every((n) => Number.isInteger(n) && n >= 0) || d.plazoPagoDias < 1) {
      return f.setError("El plazo debe ser de al menos 1 día y los días de aviso, un número entero.");
    }
    void f.enviar(
      () => guardarParametrosPago({ ...parametros, ...d }),
      () => { setGuardado(true); alGuardado(); alCerrar(); },
    );
  }

  return (
    <Dialogo abierto alCerrar={alCerrar} titulo="Parámetros de pago"
      descripcion="Valen para toda la empresa y se aplican apenas los guardas.">
      <form onSubmit={guardar}>
        <Campos>
          <CampoDinero etiqueta="Pagar en cuotas desde" {...f.campo("umbralCuotas")}
            ayuda="Las facturas de este total o más ofrecen «Pagar en cuotas». Es una sugerencia: una menor también se puede pagar en cuotas." />
          <CampoDinero etiqueta="Tope de pago semanal" {...f.campo("topeSemanal")}
            ayuda="Es un aviso: la semana puede pasarse, pero se nota." />
          <CampoNumero etiqueta="Plazo de pago (días)" {...f.campo("plazoPagoDias")}
            ayuda="Desde la fecha de la factura, cuando el proveedor no tiene plazo propio." />
          <CampoNumero etiqueta="Aviso «por vencer» (días)" {...f.campo("diasAlertaVencimiento")} />
        </Campos>
        <Pie error={f.error} guardando={f.guardando || guardado} alCancelar={alCerrar} />
      </form>
    </Dialogo>
  );
}
