"use client";

import { Chip, type Tono } from "./ui/Chip";
import { Dialogo } from "./ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import {
  cargarAprobaciones,
  cargarAvanceDeSolped,
  cargarComparativo,
  cargarExpediente,
  nombreEstadoItem,
  nombreEstadoSolped,
  type Aprobacion,
  type AvanceItem,
  type Cotizacion,
  type Expediente,
} from "@/lib/abastecimiento";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";

/**
 * El expediente de una solicitud: todo el ciclo en una pantalla.
 *
 * Responde de una mirada lo que hoy obliga a abrir cuatro planillas y un correo:
 * en qué va, qué falta, quién firmó, a quién se le compró, cuánto llegó y qué
 * queda pendiente.
 *
 * Los datos no se calculan acá: salen de `expediente_solped` y
 * `solped_items_avance`, que los deducen de las órdenes y las recepciones. Un
 * contador que alguien tenga que actualizar a mano es un contador que va a estar
 * malo.
 */

type Datos = {
  expediente: Expediente | null;
  items: AvanceItem[];
  cotizaciones: Cotizacion[];
  firmas: Aprobacion[];
};

const tonoItem: Record<string, Tono> = {
  pendiente: "neutro",
  cotizado: "info",
  "comprado-parcial": "aviso",
  comprado: "info",
  recibido: "bueno",
};

export function ExpedienteSolped({
  solpedId,
  titulo,
  alCerrar,
}: {
  solpedId: string;
  titulo: string;
  alCerrar: () => void;
}) {
  const { estado } = useConsulta<Datos>(async () => {
    const [expediente, items, cotizaciones, firmas] = await Promise.all([
      cargarExpediente(solpedId),
      cargarAvanceDeSolped(solpedId),
      cargarComparativo(solpedId),
      cargarAprobaciones("solped", solpedId),
    ]);
    return { expediente, items, cotizaciones, firmas };
  });

  return (
    <Dialogo titulo="Expediente" descripcion={titulo} abierto alCerrar={alCerrar} ancho="max-w-4xl">
      {estado.estado === "cargando" && (
        <p className="px-6 py-12 text-center text-sm text-ink-soft">Armando el expediente…</p>
      )}

      {estado.estado === "error" && (
        <p role="alert" className="px-6 py-12 text-center text-sm text-[#a52f24]">
          No se pudo leer el expediente: {estado.mensaje}
        </p>
      )}

      {estado.estado === "listo" && !estado.datos.expediente && (
        <p className="px-6 py-12 text-center text-sm text-ink-soft">
          Esta solicitud ya no existe.
        </p>
      )}

      {estado.estado === "listo" && estado.datos.expediente && (
        <Cuerpo datos={estado.datos} exp={estado.datos.expediente} />
      )}
    </Dialogo>
  );
}

function Cuerpo({ datos, exp }: { datos: Datos; exp: Expediente }) {
  const elegida = datos.cotizaciones.find((c) => c.seleccionada);

  return (
    <div className="px-6 py-6">
      {/* Encabezado: de qué contrato es y en qué estado está */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist pb-5">
        <div>
          <p className="font-display text-xl font-semibold text-ink">{exp.numero}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {exp.contrato} · {exp.contratoId}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {exp.solicitanteNombre}
            {exp.solicitanteCargo ? ` · ${exp.solicitanteCargo}` : ""}
            {exp.area ? ` · ${exp.area}` : ""}
          </p>
        </div>
        <div className="text-right">
          <Chip tono={exp.estado === "cerrada" ? "bueno" : "aviso"}>
            {nombreEstadoSolped[exp.estado]}
          </Chip>
          <p className="mt-2 text-xs text-ink-soft">
            {exp.tipoGasto === "reembolsable" ? "Reembolsable" : "No reembolsable"}
            {exp.version > 1 ? ` · versión ${exp.version}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Abierta hace {exp.diasAbierta} d
            {exp.fechaRequerida ? ` · para ${formatearFecha(exp.fechaRequerida)}` : ""}
          </p>
        </div>
      </div>

      {/* Las cinco etapas del ciclo */}
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Etapa
          titulo="Solicitud"
          hecho={exp.aprobaciones > 0}
          lineas={[
            `${exp.items} ${exp.items === 1 ? "ítem" : "ítems"} · ${formatearNumero(exp.cantidadPedida)} un`,
            exp.aprobaciones > 0
              ? `${exp.aprobaciones} ${exp.aprobaciones === 1 ? "firma" : "firmas"}`
              : "Sin firmar",
          ]}
        />
        <Etapa
          titulo="Cotización"
          hecho={exp.cotizacionesRecibidas > 0}
          lineas={[
            exp.cotizaciones === 0
              ? "Sin cotizaciones"
              : `${exp.cotizacionesRecibidas} de ${exp.cotizaciones} recibidas`,
            elegida ? `Elegido: ${elegida.proveedor}` : "Sin proveedor elegido",
          ]}
        />
        <Etapa
          titulo="Compra"
          hecho={exp.ordenes > 0}
          lineas={[
            exp.ordenes === 0
              ? "Sin órdenes"
              : `${exp.ordenes} ${exp.ordenes === 1 ? "orden" : "órdenes"}`,
            formatearPesos(exp.compradoNeto),
          ]}
        />
        <Etapa
          titulo="Recepción"
          hecho={exp.items > 0 && exp.itemsRecibidos === exp.items}
          alerta={exp.itemsComprados > 0 && exp.itemsRecibidos < exp.itemsComprados}
          lineas={[
            `${formatearNumero(exp.cantidadRecibida)} de ${formatearNumero(exp.cantidadComprada)} compradas`,
            exp.itemsRecibidos === exp.items && exp.items > 0
              ? "Todo recibido"
              : `${exp.items - exp.itemsRecibidos} ítems por llegar`,
          ]}
        />
      </ol>

      {/* Ítem por ítem: el corazón del expediente */}
      <section className="mt-8">
        <h3 className="font-display text-base font-semibold text-ink">Ítem por ítem</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Cada ítem lleva su propio estado: uno puede estar recibido y otro todavía
          esperando cotización.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="w-8 py-2 pr-3">N°</th>
                <th className="py-2 pr-3">Descripción</th>
                <th className="w-24 py-2 pr-3 text-right">Pedido</th>
                <th className="w-24 py-2 pr-3 text-right">Comprado</th>
                <th className="w-24 py-2 pr-3 text-right">Recibido</th>
                <th className="w-24 py-2 pr-3 text-right">Falta</th>
                <th className="w-40 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((i) => (
                <tr key={i.id} className="border-b border-mist last:border-0">
                  <td className="py-2.5 pr-3 tabular-nums text-ink-soft">{i.linea}</td>
                  <td className="py-2.5 pr-3 text-ink">{i.descripcion}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                    {formatearNumero(i.cantidadPedida)} {i.unidad}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                    {formatearNumero(i.cantidadComprada)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                    {formatearNumero(i.cantidadRecibida)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {i.cantidadPendiente > 0 ? (
                      <span className="font-semibold text-[#8a5a09]">
                        {formatearNumero(i.cantidadPendiente)}
                      </span>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <Chip tono={tonoItem[i.estado] ?? "neutro"}>
                      {nombreEstadoItem[i.estado]}
                    </Chip>
                  </td>
                </tr>
              ))}
              {datos.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-soft">
                    Esta solicitud todavía no tiene ítems.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Comparativo, si hay cotizaciones */}
      {datos.cotizaciones.length > 0 && (
        <section className="mt-8">
          <h3 className="font-display text-base font-semibold text-ink">Cotizaciones</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Ordenadas por costo puesto en obra —ítems menos descuento más flete—, que es
            lo único que se puede comparar de verdad.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="w-28 py-2 pr-3 text-right">Ítems</th>
                  <th className="w-24 py-2 pr-3 text-right">Flete</th>
                  <th className="w-32 py-2 pr-3 text-right">Puesto en obra</th>
                  <th className="w-24 py-2 pr-3 text-right">Plazo</th>
                  <th className="w-24 py-2">Respuesta</th>
                </tr>
              </thead>
              <tbody>
                {datos.cotizaciones.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-mist last:border-0 ${
                      c.seleccionada ? "bg-cyan/5" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <span className="block font-semibold text-ink">{c.proveedor}</span>
                      {c.seleccionada && c.motivoSeleccion && (
                        <span className="mt-0.5 block text-xs text-cyan-deep">
                          Elegido · {c.motivoSeleccion}
                        </span>
                      )}
                      {c.itemsSinStock > 0 && (
                        <span className="mt-0.5 block text-xs text-[#8a5a09]">
                          {c.itemsSinStock} sin stock
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                      {formatearPesos(c.itemsNeto)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                      {c.flete > 0 ? formatearPesos(c.flete) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-ink">
                      {formatearPesos(c.costoPuesto)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                      {c.plazoEntregaDias === null ? "—" : `${c.plazoEntregaDias} d`}
                    </td>
                    <td className="py-2.5 text-ink-soft">
                      {c.recibidaEn === null
                        ? "Esperando"
                        : `${c.diasRespuesta ?? 0} d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {exp.diferenciaVsMejor !== null && exp.diferenciaVsMejor !== 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              {exp.diferenciaVsMejor > 0
                ? `Se compró ${formatearPesos(exp.diferenciaVsMejor)} por sobre la alternativa más barata.`
                : `Se compró ${formatearPesos(Math.abs(exp.diferenciaVsMejor))} bajo la alternativa más barata.`}{" "}
              La comparación es contra la mejor alternativa comparable, no contra la más
              cara: comparar contra la más cara infla el ahorro.
            </p>
          )}
        </section>
      )}

      {/* Firmas */}
      {datos.firmas.length > 0 && (
        <section className="mt-8 border-t border-mist pt-6">
          <h3 className="font-display text-base font-semibold text-ink">Firmas</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {datos.firmas.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-semibold text-ink">
                  {a.accion === "aprobado"
                    ? "Aprobó"
                    : a.accion === "rechazado"
                      ? "Rechazó"
                      : "Devolvió"}
                </span>{" "}
                <span className="text-ink-soft">
                  {a.usuarioNombre}
                  {a.usuarioCargo ? ` · ${a.usuarioCargo}` : ""} ·{" "}
                  {new Date(a.ocurridoEn).toLocaleString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {a.comentario && (
                  <span className="mt-0.5 block text-ink-soft">“{a.comentario}”</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Una etapa del ciclo, con su marca de hecho o pendiente. */
function Etapa({
  titulo,
  hecho,
  alerta,
  lineas,
}: {
  titulo: string;
  hecho: boolean;
  alerta?: boolean;
  lineas: string[];
}) {
  const color = alerta ? "#8a5a09" : hecho ? "#0e7a4f" : "#767d84";

  return (
    <li className="rounded-xl border border-mist-deep bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
          style={{ background: color }}
        >
          {hecho && !alerta && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4">
              <path d="m5 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
          {titulo}
        </h4>
      </div>
      {lineas.map((l, i) => (
        <p
          key={l}
          className={i === 0 ? "mt-2 text-sm font-semibold text-ink" : "mt-0.5 text-xs text-ink-soft"}
        >
          {l}
        </p>
      ))}
    </li>
  );
}
