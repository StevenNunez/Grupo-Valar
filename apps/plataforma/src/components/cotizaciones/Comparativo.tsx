"use client";

import { mensajeParaPersona } from "@/lib/errores";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Chip } from "../ui/Chip";
import { Dialogo } from "../ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import { cargarItemsDeCotizacion, darPorCompletoItem, type AvanceItem, type Cotizacion, type Solped } from "@/lib/abastecimiento";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";
import { puede, useUsuario } from "@/lib/sesion";
import { type Datos, EstadoDelEnvio, Etiqueta, Ayuda } from "./piezas";
import { FormularioCotizacion } from "./FormularioCotizacion";
import { DialogoGenerarOrden } from "./DialogoGenerarOrden";
import { DialogoPedirCotizacion } from "./DialogoPedirCotizacion";
import { VistaSolicitud, DialogoEnviar } from "./DialogoEnviar";

/* ── El cuadro comparativo ────────────────────────────────────────────────── */

export function Comparativo({
  solped,
  datos,
  alAgregar,
  alElegir,
  alCorregir,
  generarId,
  alGenerarAbierto,
  alCambiar,
}: {
  solped: Solped;
  datos: Datos;
  /** Cotización recién elegida para la que se abre sola la orden de compra. */
  generarId: string | null;
  alGenerarAbierto: () => void;
  /** Cargar precios; con el proveedor, cuando se entra desde su solicitud. */
  alAgregar: (proveedorId?: string) => void;
  alElegir: (c: Cotizacion) => void;
  /** Editar los precios de una cotización ya cargada. */
  alCorregir: (c: Cotizacion) => void;
  alCambiar: () => void;
}) {
  const usuario = useUsuario();
  const [generando, setGenerando] = useState(false);
  // Cotizar y emitir son permisos distintos: quien cotiza no necesariamente emite.
  const puedeCotizar = puede(usuario, "cotizacion.gestionar");
  const puedeEmitir = puede(usuario, "ordenes.emitir");
  const [ordenCreada, setOrdenCreada] = useState<string | null>(null);
  const [completando, setCompletando] = useState<AvanceItem | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [imprimiendo, setImprimiendo] = useState<Cotizacion | null>(null);
  const [enviando, setEnviando] = useState<Cotizacion | null>(null);
  const proveedorElegido = datos.proveedores.find(
    (p) => p.id === datos.cotizaciones.find((c) => c.seleccionada)?.proveedorId,
  );

  const recibidas = datos.cotizaciones.filter((c) => c.recibidaEn !== null);
  const mejor = recibidas.length > 0 ? Math.min(...recibidas.map((c) => c.costoPuesto)) : 0;
  const elegida = datos.cotizaciones.find((c) => c.seleccionada);

  /* Espera a que la recarga traiga al proveedor ya elegido y abre la orden. El
     diálogo se abre al dibujar (una vez por pedido: `abiertoPara` lo recuerda) y
     al padre se le avisa después, en el efecto, para que limpie su pedido. */
  const listoParaGenerar = !!generarId && elegida?.id === generarId && puedeEmitir;
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);
  if (listoParaGenerar && abiertoPara !== generarId) {
    setAbiertoPara(generarId);
    setGenerando(true);
  } else if (!generarId && abiertoPara !== null) {
    // Atendido el pedido, se olvida: un pedido nuevo del mismo proveedor vuelve a abrir.
    setAbiertoPara(null);
  }
  useEffect(() => {
    if (listoParaGenerar) alGenerarAbierto();
  }, [listoParaGenerar, alGenerarAbierto]);

  return (
    <div className="px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {datos.cotizaciones.length === 0
            ? "Todavía no hay cotizaciones."
            : `${recibidas.length} de ${datos.cotizaciones.length} respondidas.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {puedeCotizar && (
            <>
          <button
            type="button"
            onClick={() => setPidiendo(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M4 5h16v14H4Z" strokeLinejoin="round" />
              <path d="m4 6 8 6 8-6" strokeLinejoin="round" />
            </svg>
            Pedir cotización
          </button>
          <button
            type="button"
            onClick={() => alAgregar()}
            className="inline-flex items-center gap-1.5 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Cargar precios
          </button>
            </>
          )}
        </div>
      </div>

      {/* Qué falta para que la solicitud esté completa: se compra en varias
          órdenes, y mientras quede algo sin cubrir hay que cotizar y emitir. */}
      {(() => {
        const faltan = datos.items.filter((i) => i.cantidadPendiente > 0);
        const hayCompra = datos.items.some((i) => i.cantidadComprada > 0);
        if (!hayCompra && faltan.length === 0) return null;
        return faltan.length === 0 ? (
          <p className="mt-5 rounded-xl bg-exito-suave px-4 py-3 text-sm font-medium text-exito">
            Todos los ítems de la solicitud ya están comprados.
          </p>
        ) : (
          <div className="mt-5 rounded-xl border border-alerta-borde bg-alerta-suave px-4 py-3">
            <p className="text-sm font-semibold text-alerta">
              Faltan {faltan.length} de {datos.items.length} ítems por comprar
            </p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-ink sm:grid-cols-2">
              {faltan.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{i.descripcion}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums text-ink-soft">
                    {formatearNumero(i.cantidadPendiente)} {i.unidad}
                    {/* Se compró menos de lo pedido porque se vende por paquete: se da por completo. */}
                    {puedeCotizar && i.cantidadComprada > 0 && (
                      <button
                        type="button"
                        onClick={() => setCompletando(i)}
                        className="rounded-full border border-alerta-borde bg-white px-2.5 py-0.5 text-xs font-semibold text-alerta transition-colors hover:border-alerta"
                      >
                        Dar por completo
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">
              Pide cotización a otro proveedor por estos ítems, elígelo y genera su orden. La solicitud queda completa cuando no falte ninguno.
            </p>
          </div>
        );
      })()}

      {datos.cotizaciones.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="py-2 pr-3">Proveedor</th>
                <th className="w-28 py-2 pr-3 text-right">Ítems</th>
                <th className="w-24 py-2 pr-3 text-right">Flete</th>
                <th className="w-32 py-2 pr-3 text-right">Puesto en obra</th>
                <th className="w-20 py-2 pr-3 text-right">Plazo</th>
                <th className="w-32 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {datos.cotizaciones.map((c) => {
                const esMejor = c.recibidaEn !== null && c.costoPuesto === mejor;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-mist last:border-0 ${c.seleccionada ? "bg-cyan/5" : ""}`}
                  >
                    <td className="py-3 pr-3">
                      <span className="block font-semibold text-ink">{c.proveedor}</span>
                      {/* «Creada» y «enviada» no son lo mismo, y la diferencia
                          es justo la que se pregunta en la reunión: una
                          solicitud hecha y sin mandar no está esperando a
                          nadie. */}
                      <span className="mt-0.5 block text-xs text-ink-soft">
                        {c.recibidaEn !== null
                          ? `Respondió en ${c.diasRespuesta ?? 0} d`
                          : c.enviadaEn
                            ? `Enviada el ${formatearFecha(c.enviadaEn.slice(0, 10))} · sin respuesta`
                            : `Creada el ${formatearFecha(c.solicitadaEn)}`}
                        {c.itemsSinStock > 0 ? ` · ${c.itemsSinStock} sin stock` : ""}
                      </span>
                      {c.recibidaEn === null && (
                        <EstadoDelEnvio envio={datos.envios.find((e) => e.cotizacionId === c.id)} />
                      )}
                      {c.recibidaEn === null && !c.enviadaEn && (
                        <span className="mt-1 block text-xs font-semibold text-alerta">
                          Todavía no se le manda
                        </span>
                      )}
                      {c.seleccionada && c.motivoSeleccion && (
                        <span className="mt-1 block text-xs text-cyan-deep">
                          Elegido · {c.motivoSeleccion}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                      {formatearPesos(c.itemsNeto)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                      {c.flete > 0 ? formatearPesos(c.flete) : "—"}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <span className="font-semibold tabular-nums text-ink">
                        {formatearPesos(c.costoPuesto)}
                      </span>
                      {esMejor && !c.seleccionada && (
                        <span className="mt-0.5 block text-xs text-exito">el más bajo</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                      {c.plazoEntregaDias === null ? "—" : `${c.plazoEntregaDias} d`}
                    </td>
                    <td className="py-3 text-right">
                      {c.recibidaEn !== null ? (
                        <div className="flex items-center justify-end gap-2">
                          {/* Si se equivocó un precio, se corrige acá: se actualiza esta misma cotización. */}
                          {puedeCotizar && (
                            <button
                              type="button"
                              onClick={() => alCorregir(c)}
                              className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                            >
                              Editar precios
                            </button>
                          )}
                          {c.seleccionada ? (
                            <Chip tono="bueno">Elegido</Chip>
                          ) : (
                            puedeCotizar && (
                              <button
                                type="button"
                                onClick={() => alElegir(c)}
                                className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                              >
                                Elegir
                              </button>
                            )
                          )}
                        </div>
                      ) : (
                        /* Todavía no responde: se le manda, o se vuelve a mandar. */
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setImprimiendo(c)}
                            className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                          >
                            Ver
                          </button>
                          {puedeCotizar && (
                          <button
                            type="button"
                            onClick={() => setEnviando(c)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                              c.enviadaEn
                                ? "border border-mist-deep text-ink-soft hover:border-ink hover:text-ink"
                                : "bg-cyan-deep text-white hover:bg-cyan-hondo"
                            }`}
                          >
                            {c.enviadaEn ? "Reenviar" : "Enviar"}
                          </button>
                          )}
                          {/* Los precios de ESTE proveedor, ya con su solicitud: no hay
                              que volver a buscarlo ni a marcar qué ítems se le pidieron. */}
                          {puedeCotizar && (
                            <button
                              type="button"
                              onClick={() => alAgregar(c.proveedorId)}
                              className="rounded-full bg-cyan-deep px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-hondo"
                            >
                              Cargar precios
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {elegida && (
        <div className="mt-6 rounded-xl border border-mist-deep bg-mist/30 p-5">
          <h3 className="font-display text-base font-semibold text-ink">
            Proveedor elegido: {elegida.proveedor}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            {formatearPesos(elegida.costoPuesto)} puestos en obra ·{" "}
            {elegida.motivoSeleccion}
          </p>

          {ordenCreada ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-exito-suave px-4 py-3 text-sm font-medium text-exito">
              <p className="min-w-0 flex-1">
                Orden {ordenCreada} creada en borrador. Ábrela en Órdenes de Compra para
                revisarla y emitirla.
              </p>
              <Link
                href="/abastecimiento/ordenes/"
                className="rounded-full bg-cyan-deep px-5 py-2 font-semibold text-white transition-colors hover:bg-cyan-hondo"
              >
                Ir a Órdenes de Compra
              </Link>
            </div>
          ) : !puedeEmitir ? null : (
            <button
              type="button"
              onClick={() => setGenerando(true)}
              className="mt-4 rounded-full bg-cyan-deep px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo"
            >
              Generar orden de compra
            </button>
          )}

          <p className="mt-3 text-xs text-ink-soft">
            Eliges qué ítems entran: no toda la solicitud se le compra al mismo
            proveedor. Los que dejes fuera quedan pendientes y pueden ir en otra orden.
          </p>
        </div>
      )}

      {completando && (
        <DialogoDarPorCompleto
          solped={solped}
          item={completando}
          alCerrar={() => setCompletando(null)}
          alListo={() => {
            setCompletando(null);
            alCambiar();
          }}
        />
      )}

      {pidiendo && (
        <DialogoPedirCotizacion
          solped={solped}
          items={datos.pedidos}
          avance={datos.items}
          proveedores={datos.proveedores}
          cotizaciones={datos.cotizaciones}
          alCerrar={() => setPidiendo(false)}
          alPedida={() => {
            setPidiendo(false);
            alCambiar();
          }}
        />
      )}

      {enviando && (
        <DialogoEnviar
          solped={solped}
          cotizacion={enviando}
          proveedor={datos.proveedores.find((p) => p.id === enviando.proveedorId)}
          alCerrar={() => setEnviando(null)}
          alEnviada={() => {
            setEnviando(null);
            alCambiar();
          }}
        />
      )}

      {imprimiendo && (
        <VistaSolicitud
          solped={solped}
          cotizacion={imprimiendo}
          proveedor={datos.proveedores.find((p) => p.id === imprimiendo.proveedorId)}
          alCerrar={() => setImprimiendo(null)}
        />
      )}

      {generando && elegida && proveedorElegido && (
        <DialogoGenerarOrden
          solped={solped}
          cotizacion={elegida}
          proveedor={proveedorElegido}
          avance={datos.items}
          emisor={{ nombre: usuario.nombre, correo: usuario.correo }}
          alCerrar={() => setGenerando(false)}
          alCreada={(numero) => {
            setOrdenCreada(numero);
            setGenerando(false);
            alCambiar();
          }}
        />
      )}
    </div>
  );
}

/**
 * Corregir los precios de una cotización que ya se cargó: trae sus ítems y abre
 * el mismo formulario con los valores puestos. Se actualiza esa misma fila (no
 * se crea otra) y se conserva su estado, así que un proveedor elegido sigue elegido.
 */
export function CorregirPrecios({
  solped,
  cotizacion,
  datos,
  soloFaltantes,
  alCerrar,
  alGuardado,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  datos: Datos;
  soloFaltantes: boolean;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const { estado } = useConsulta(() => cargarItemsDeCotizacion(cotizacion.id));

  if (estado.estado !== "listo") {
    return (
      <Dialogo titulo={`Editar precios · ${cotizacion.proveedor}`} abierto alCerrar={alCerrar} ancho="max-w-2xl">
        <p className="px-6 py-12 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Cargando la cotización…"}
        </p>
      </Dialogo>
    );
  }

  return (
    <FormularioCotizacion
      solped={solped}
      items={datos.items}
      pedidos={datos.pedidos}
      solicitados={datos.solicitados}
      proveedores={datos.proveedores}
      cotizaciones={datos.cotizaciones}
      proveedorInicial={cotizacion.proveedorId}
      corrigiendo={{ cotizacion, items: estado.datos }}
      soloFaltantes={soloFaltantes}
      alCerrar={alCerrar}
      alGuardado={alGuardado}
    />
  );
}

/**
 * Un ítem que se compró en menos cantidad que la pedida, porque el proveedor lo
 * vende por paquete. Se da por completo: lo pedido pasa a ser lo comprado y el
 * motivo queda anotado en el ítem, así no figura como pendiente para siempre.
 */
export function DialogoDarPorCompleto({
  solped,
  item,
  alCerrar,
  alListo,
}: {
  solped: Solped;
  item: AvanceItem;
  alCerrar: () => void;
  alListo: () => void;
}) {
  const [motivo, setMotivo] = useState("Se vende por paquete.");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setError(null);
    setGuardando(true);
    try {
      await darPorCompletoItem({ solpedId: solped.id, solpedItemId: item.id, motivo });
      alListo();
    } catch (e) {
      setError(mensajeParaPersona(e, "CotizacionesDeSolped"));
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      titulo="Dar el ítem por completo"
      descripcion={`${solped.numero} · ${item.descripcion}`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-lg"
    >
      <div className="px-6 py-6">
        <p className="rounded-xl bg-mist/40 px-4 py-3 text-sm text-ink">
          Se pidieron <strong>{formatearNumero(item.cantidadPedida)} {item.unidad}</strong> y se compraron{" "}
          <strong>{formatearNumero(item.cantidadComprada)}</strong>. Al darlo por completo, lo pedido pasa a ser{" "}
          {formatearNumero(item.cantidadComprada)} y deja de figurar como pendiente.
        </p>

        <label className="mt-4 block">
          <Etiqueta>Motivo</Etiqueta>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-cyan"
          />
          <Ayuda>
            Queda escrito en el ítem junto con la cantidad que se había pedido, para que el cambio se pueda explicar después.
          </Ayuda>
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
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
          {guardando ? "Guardando…" : "Dar por completo"}
        </button>
      </div>
    </Dialogo>
  );
}
