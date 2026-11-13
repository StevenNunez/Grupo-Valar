"use client";

import { mensajeParaPersona } from "@/lib/errores";
import { useState } from "react";
import { Dialogo } from "../ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import { cargarItemsDeCotizacion, condicionDeProveedor, formatearRut, generarOrdenDesdeCotizacion, type ItemCotizado, type AvanceItem, type Cotizacion, type Proveedor, type Solped } from "@/lib/abastecimiento";
import { cargarAnexos, etiquetaAnexo, proyectoDeAnexo, type Anexo } from "@/lib/anexos";
import { formatearFecha, formatearNumero, formatearPesos, formatearPesosUnitario } from "@/lib/formato";
import { siguienteNumero } from "@/lib/ordenes";
import { claseCelda, Etiqueta, Ayuda, Linea, Dato } from "./piezas";

/* ── Generar la orden: qué se le compra a este proveedor ──────────────────── */

/**
 * El paso que faltaba entre elegir proveedor y tener la OC.
 *
 * Una solicitud no se le compra entera al mismo: el acero conviene en uno y la
 * pintura en otro, y esa es justamente la razón de cotizar ítem por ítem. Antes
 * la orden se generaba con todo lo cotizado y había que borrar líneas después,
 * que es donde se pierde el vínculo con lo que se pidió.
 *
 * Lo que no entra en esta orden no se pierde: queda pendiente en la solicitud y
 * puede ir en otra.
 */
export function DialogoGenerarOrden({
  solped,
  cotizacion,
  proveedor,
  avance,
  emisor,
  alCerrar,
  alCreada,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  proveedor: Proveedor;
  avance: AvanceItem[];
  emisor: { nombre: string; correo: string };
  alCerrar: () => void;
  alCreada: (numero: string) => void;
}) {
  const { estado } = useConsulta<{ cotizados: ItemCotizado[]; anexos: Anexo[] }>(
    async () => {
      const [cotizados, anexos] = await Promise.all([
        cargarItemsDeCotizacion(cotizacion.id),
        cargarAnexos(solped.contratoId),
      ]);
      return { cotizados, anexos };
    },
  );

  const [elegidos, setElegidos] = useState<Set<string> | null>(null);
  /* Lo que de verdad se compra, cuando difiere de lo cotizado (paquetes de 10). */
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [conFlete, setConFlete] = useState(true);
  // El anexo de la solicitud viene propuesto; se puede cambiar si esta parte va a otro.
  const [anexoId, setAnexoId] = useState(solped.anexoId ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (estado.estado !== "listo") {
    return (
      <Dialogo titulo="Generar orden de compra" abierto alCerrar={alCerrar} ancho="max-w-3xl">
        <p className="px-6 py-12 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Cargando los ítems cotizados…"}
        </p>
      </Dialogo>
    );
  }

  const porSolpedItem = new Map(avance.map((a) => [a.id, a]));
  const conPrecio = estado.datos.cotizados.filter((i) => i.disponible && i.precioUnitario > 0);

  /* Una solicitud se compra en varias órdenes. Lo que ya se compró por completo
     en una orden anterior no se ofrece de nuevo: esta orden es solo por lo que
     falta. Lo que dejó de estar en lista se avisa, para que no parezca perdido. */
  const pendienteDe = (i: ItemCotizado) => porSolpedItem.get(i.solpedItemId)?.cantidadPendiente;
  const comprables = conPrecio.filter((i) => (pendienteDe(i) ?? 1) > 0);
  const yaCompradosCount = conPrecio.length - comprables.length;

  /* La cantidad de esta orden es la que falta (si falta menos de lo cotizado), no la
     que se cotizó: la compra anterior ya cubrió el resto. */
  const cantidadDe = (i: ItemCotizado) =>
    cantidades[i.solpedItemId] ?? Math.min(i.cantidad, pendienteDe(i) ?? i.cantidad);

  const marcados = elegidos ?? new Set(comprables.map((i) => i.solpedItemId));

  const alternar = (id: string) => {
    const copia = new Set(marcados);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    setElegidos(copia);
  };

  const netoElegido = comprables
    .filter((i) => marcados.has(i.solpedItemId))
    .reduce((t, i) => t + Math.round(cantidadDe(i) * i.precioUnitario), 0);
  const flete = conFlete ? cotizacion.flete : 0;
  const total = netoElegido + flete;

  const vigentes = estado.datos.anexos.filter((a) => a.estado === "vigente");

  async function crearOrden() {
    if (marcados.size === 0) {
      setError("Elige al menos un ítem para la orden.");
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const numero = await siguienteNumero();
      const id = await generarOrdenDesdeCotizacion({
        solped,
        cotizacion,
        proveedor,
        numero,
        emisor,
        soloItems: [...marcados],
        cantidades: Object.fromEntries(comprables.map((i) => [i.solpedItemId, cantidadDe(i)])),
        incluirFlete: conFlete && cotizacion.flete > 0,
        anexoId: anexoId || null,
        proyecto: (() => {
          const anexo = vigentes.find((a) => a.id === anexoId);
          return anexo ? proyectoDeAnexo(anexo) : null;
        })(),
      });
      alCreada(numero || id);
    } catch (e) {
      setError(mensajeParaPersona(e, "CotizacionesDeSolped"));
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      titulo={`Orden de compra a ${proveedor.razonSocial}`}
      descripcion={`${solped.numero} · elige qué se le compra a este proveedor`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      <div className="px-6 py-6">
        {/* Los datos que ya sabe el sistema: se muestran, no se preguntan. */}
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-mist-deep bg-mist/30 p-4 text-sm sm:grid-cols-2">
          <Dato etiqueta="Proveedor">
            {proveedor.razonSocial} · {formatearRut(proveedor.rut)}
          </Dato>
          <Dato etiqueta="Forma de pago">{condicionDeProveedor(proveedor)}</Dato>
          <Dato etiqueta="Centro de costo">{solped.contrato}</Dato>
          <Dato etiqueta="Requerida en faena">{formatearFecha(solped.fechaRequerida)}</Dato>
        </dl>
        <p className="mt-2 text-xs text-ink-soft">
          Salen de la ficha del proveedor y del contrato. Si algo está mal, se corrige
          en Proveedores y vale para todas las órdenes, no solo para esta.
        </p>

        {vigentes.length > 0 && (
          <label className="mt-5 block">
            <Etiqueta>Se compra contra</Etiqueta>
            <select
              value={anexoId}
              onChange={(e) => setAnexoId(e.target.value)}
              className={claseCelda}
            >
              <option value="">Contrato base · {solped.contrato}</option>
              {vigentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {etiquetaAnexo(a)}
                </option>
              ))}
            </select>
            <Ayuda>Lo comprado contra un anexo sale en su resultado, y se imprime en la línea «Proyecto» de la orden.</Ayuda>
          </label>
        )}

        <h3 className="mt-6 font-display text-base font-semibold text-ink">
          Ítems de esta orden
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Lo que dejes fuera queda pendiente en la solicitud y puede ir en otra orden, a
          otro proveedor.
          {yaCompradosCount > 0 &&
            ` No se listan ${yaCompradosCount} ítems de esta cotización que ya se compraron por completo en una orden anterior.`}
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="w-10 py-2" />
                <th className="py-2 pr-3">Ítem</th>
                <th className="w-28 py-2 pr-3 text-right">Cantidad</th>
                <th className="w-28 py-2 pr-3 text-right">P. unitario</th>
                <th className="w-28 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {comprables.map((i) => {
                const pedido = porSolpedItem.get(i.solpedItemId);
                const yaComprado = (pedido?.cantidadComprada ?? 0) > 0;
                return (
                  <tr key={i.id} className="border-b border-mist last:border-0">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={marcados.has(i.solpedItemId)}
                        onChange={() => alternar(i.solpedItemId)}
                        aria-label={pedido?.descripcion ?? i.solpedItemId}
                        className="h-4 w-4 rounded border-mist-deep accent-cyan"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      {/* Con este nombre —el técnico que cotizó el proveedor— nace la línea de la orden. */}
                      <span className="block text-ink">{i.nombreCotizado ?? pedido?.descripcion ?? "Ítem"}</span>
                      {i.nombreCotizado && pedido && i.nombreCotizado !== pedido.descripcion && (
                        <span className="mt-0.5 block text-xs text-ink-soft">Se pidió: {pedido.descripcion}</span>
                      )}
                      {yaComprado && (
                        <span className="mt-0.5 block text-xs text-alerta">
                          Ya se compraron {formatearNumero(pedido?.cantidadComprada ?? 0)}{" "}
                          {pedido?.unidad} en otra orden
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={cantidadDe(i)}
                          onChange={(e) =>
                            setCantidades((c) => ({ ...c, [i.solpedItemId]: Number(e.target.value) || 0 }))
                          }
                          aria-label={`Cantidad a comprar de ${i.nombreCotizado ?? pedido?.descripcion ?? "ítem"}`}
                          className="w-20 rounded-md border border-mist-deep bg-white px-2 py-1 text-right text-sm tabular-nums text-ink outline-none focus:border-cyan"
                        />
                        <span className="text-xs">{pedido?.unidad ?? ""}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {formatearPesosUnitario(i.precioUnitario)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">
                      {formatearPesos(Math.round(cantidadDe(i) * i.precioUnitario))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {cotizacion.flete > 0 && (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={conFlete}
              onChange={(e) => setConFlete(e.target.checked)}
              className="h-4 w-4 rounded border-mist-deep accent-cyan"
            />
            Incluir el flete de {formatearPesos(cotizacion.flete)} como línea de la orden
            <span className="text-xs text-ink-soft">
              — desmárcalo si ya lo cobró en una orden anterior
            </span>
          </label>
        )}

        <dl className="mt-5 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
          <Linea etiqueta={`Ítems (${marcados.size})`} valor={formatearPesos(netoElegido)} />
          {flete > 0 && <Linea etiqueta="Flete" valor={formatearPesos(flete)} />}
          <div className="mt-1 flex justify-between border-t border-mist pt-2">
            <dt className="font-display font-semibold text-ink">Neto de la orden</dt>
            <dd className="font-display font-semibold tabular-nums text-ink">
              {formatearPesos(total)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-mist px-6 py-5">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
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
            onClick={() => void crearOrden()}
            disabled={guardando || marcados.size === 0}
            className="rounded-full bg-cyan-deep px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? "Generando…" : `Generar orden por ${formatearPesos(total)}`}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
