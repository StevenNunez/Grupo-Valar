"use client";

import { useState } from "react";
import { Dialogo } from "./ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import { cargarAvanceDeSolped, cargarComparativo, cargarEnviosDeSolicitudes, cargarNombresDeProveedor, cargarItemsDeCotizacion, cargarItemsDeSolped, cargarProveedores, type Cotizacion, type Solped } from "@/lib/abastecimiento";
import { type Datos } from "./cotizaciones/piezas";
import { Comparativo, CorregirPrecios } from "./cotizaciones/Comparativo";
import { FormularioCotizacion } from "./cotizaciones/FormularioCotizacion";
import { DialogoSeleccion } from "./cotizaciones/DialogoSeleccion";

/**
 * Las cotizaciones de una solicitud, y la decisión de a quién comprarle.
 *
 * El comparativo ordena por COSTO PUESTO EN OBRA —ítems menos descuento más
 * flete—, no por el subtotal de la lista: el más barato en la lista no es
 * siempre el más barato una vez que llega a faena, y decidir por el subtotal es
 * la forma más común de comprar caro creyendo que se ahorró.
 *
 * Elegir exige motivo. No solo cuando no gana el más barato: escribir "menor
 * precio" cuesta un segundo y deja el criterio por escrito igual, que es lo que
 * sirve cuando alguien pregunte seis meses después.
 */
export function CotizacionesDeSolped({
  solped,
  alCerrar,
  alCambiar,
}: {
  solped: Solped;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const { estado, recargar } = useConsulta<Datos>(async () => {
    const [cotizaciones, items, pedidos, proveedores] = await Promise.all([
      cargarComparativo(solped.id),
      cargarAvanceDeSolped(solped.id),
      cargarItemsDeSolped(solped.id),
      cargarProveedores(),
    ]);
    const envios = await cargarEnviosDeSolicitudes(cotizaciones.map((c) => c.id));

    const solicitados: Datos["solicitados"] = {};
    await Promise.all(
      cotizaciones
        .filter((c) => c.recibidaEn === null)
        .map(async (c) => {
          const pedidoItems = await cargarItemsDeCotizacion(c.id);
          const articulos = pedidoItems
            .map((ci) => pedidos.find((p) => p.id === ci.solpedItemId)?.articuloId)
            .filter((a): a is string => !!a);
          solicitados[c.proveedorId] = {
            items: pedidoItems,
            nombres: await cargarNombresDeProveedor(c.proveedorId, articulos),
          };
        }),
    );

    return { cotizaciones, items, pedidos, proveedores, envios, solicitados };
  });

  /* Abierto = se están cargando precios. `proveedorId` viene lleno cuando se
     entra por el botón de una solicitud concreta. */
  const [cotizando, setCotizando] = useState<{ proveedorId: string | null } | null>(null);
  const [eligiendo, setEligiendo] = useState<Cotizacion | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Cotizacion | null>(null);
  /* Se abrió para sumarle lo que falta a un proveedor que ya respondió: ahí se ven
     solo los ítems pendientes, no lo que ya se compró en su orden anterior. */
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  /* Recién se le cargaron los precios de lo que faltaba: lo que sigue es elegirlo y
     emitirle la orden, así que se abre solo en vez de dejar buscar el botón. Se guarda
     el código y no la fila, porque la fila cambia cuando termina de recargar. */
  const [porElegirId, setPorElegirId] = useState<string | null>(null);
  const [porGenerarId, setPorGenerarId] = useState<string | null>(null);
  const encadenada =
    porElegirId && estado.estado === "listo"
      ? (estado.datos.cotizaciones.find((c) => c.id === porElegirId) ?? null)
      : null;
  /* Si ya era el elegido no hay nada que elegir: se pasa directo a la orden. Se
     ajusta al dibujar (no en un efecto): así no hay un cuadro intermedio en que
     se vea el paso de elegir. `porElegirId` vuelve a null, así que pasa una vez. */
  if (encadenada?.seleccionada && porElegirId) {
    setPorGenerarId(encadenada.id);
    setPorElegirId(null);
  }
  const aElegir = eligiendo ?? (encadenada?.seleccionada ? null : encadenada);

  return (
    <>
      <Dialogo
        titulo="Cotizaciones"
        descripcion={`${solped.numero} · ${solped.contrato} · ${solped.items} ítems`}
        abierto
        alCerrar={alCerrar}
        ancho="max-w-4xl"
      >
        {estado.estado === "cargando" && (
          <p className="px-6 py-12 text-center text-sm text-ink-soft">Cargando…</p>
        )}

        {estado.estado === "error" && (
          <p role="alert" className="px-6 py-12 text-center text-sm text-peligro">
            {estado.mensaje}
          </p>
        )}

        {estado.estado === "listo" && (
          <Comparativo
            solped={solped}
            datos={estado.datos}
            alAgregar={(proveedorId) => setCotizando({ proveedorId: proveedorId ?? null })}
            alElegir={setEligiendo}
            alCorregir={setCorrigiendo}
            generarId={porGenerarId}
            alGenerarAbierto={() => setPorGenerarId(null)}
            alCambiar={() => {
              recargar();
              alCambiar();
            }}
          />
        )}
      </Dialogo>

      {cotizando && estado.estado === "listo" && (
        <FormularioCotizacion
          solped={solped}
          items={estado.datos.items}
          pedidos={estado.datos.pedidos}
          solicitados={estado.datos.solicitados}
          proveedores={estado.datos.proveedores}
          cotizaciones={estado.datos.cotizaciones}
          proveedorInicial={cotizando.proveedorId}
          alAmpliar={(c) => {
            setCotizando(null);
            setSoloFaltantes(true);
            setCorrigiendo(c);
          }}
          alCerrar={() => setCotizando(null)}
          alGuardado={() => {
            recargar();
            alCambiar();
          }}
        />
      )}

      {corrigiendo && estado.estado === "listo" && (
        <CorregirPrecios
          solped={solped}
          cotizacion={corrigiendo}
          datos={estado.datos}
          soloFaltantes={soloFaltantes}
          alCerrar={() => {
            setCorrigiendo(null);
            setSoloFaltantes(false);
          }}
          alGuardado={() => {
            // Sumó lo que faltaba a su cotización: se sigue con elegirla y emitir la orden.
            if (soloFaltantes) setPorElegirId(corrigiendo.id);
            recargar();
            alCambiar();
          }}
        />
      )}

      {aElegir && (
        <DialogoSeleccion
          solped={solped}
          cotizacion={aElegir}
          motivoInicial={
            porElegirId ? "Compra de los ítems que faltaban, en una orden aparte." : undefined
          }
          mejor={
            estado.estado === "listo"
              ? Math.min(...estado.datos.cotizaciones.map((c) => c.costoPuesto))
              : aElegir.costoPuesto
          }
          alCerrar={() => {
            setEligiendo(null);
            setPorElegirId(null);
          }}
          alElegido={() => {
            if (porElegirId) setPorGenerarId(porElegirId);
            setPorElegirId(null);
            setEligiendo(null);
            recargar();
            alCambiar();
          }}
        />
      )}
    </>
  );
}
