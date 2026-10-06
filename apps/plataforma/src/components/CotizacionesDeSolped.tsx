"use client";

import { useState } from "react";
import { Chip } from "./ui/Chip";
import { Combo } from "./ui/Combo";
import { Dialogo } from "./ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import {
  cargarAvanceDeSolped,
  cargarComparativo,
  cargarCotizacion,
  cargarItemsDeCotizacion,
  cargarItemsDeSolped,
  cargarProveedores,
  armarCorreoSolicitud,
  cargarRespuesta,
  enlaceMailto,
  registrarEnvio,
  TOPE_MAILTO,
  pedirCotizacion,
  siguienteNumeroSolicitud,
  condicionDeProveedor,
  formatearRut,
  generarOrdenDesdeCotizacion,
  opcionesCondicionPago,
  seleccionarCotizacion,
  siguienteIdCotizacion,
  type ItemCotizado,
  type ItemSolped,
  type AvanceItem,
  type Cotizacion,
  type Proveedor,
  type Solped,
} from "@/lib/abastecimiento";
import { Impresion } from "./ui/Impresion";
import { SolicitudCotizacionImprimible } from "./SolicitudCotizacionImprimible";
import { cargarAnexos, etiquetaAnexo, proyectoDeAnexo, type Anexo } from "@/lib/anexos";
import { enviarSolicitudPorCorreo } from "@/lib/usuarios";
import {
  emparejar,
  leerCotizacionPdf,
  leerCotizacionPegada,
  type LecturaCotizacion,
} from "@/lib/lector-cotizacion";
import { crear } from "@/lib/crud";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";
import { siguienteNumero } from "@/lib/ordenes";
import { puede, useUsuario } from "@/lib/sesion";

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

const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyan";

type Datos = {
  cotizaciones: Cotizacion[];
  items: AvanceItem[];
  /* Los ítems tal como se pidieron, con el artículo del maestro enlazado: de
     ahí sale el nombre técnico con el que se le pide al proveedor. */
  pedidos: ItemSolped[];
  proveedores: Proveedor[];
};

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
    return { cotizaciones, items, pedidos, proveedores };
  });

  const [cotizando, setCotizando] = useState(false);
  const [eligiendo, setEligiendo] = useState<Cotizacion | null>(null);

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
          <p role="alert" className="px-6 py-12 text-center text-sm text-[#a52f24]">
            {estado.mensaje}
          </p>
        )}

        {estado.estado === "listo" && (
          <Comparativo
            solped={solped}
            datos={estado.datos}
            alAgregar={() => setCotizando(true)}
            alElegir={setEligiendo}
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
          proveedores={estado.datos.proveedores}
          cuantas={estado.datos.cotizaciones.length}
          cotizaciones={estado.datos.cotizaciones}
          alCerrar={() => setCotizando(false)}
          alGuardado={() => {
            recargar();
            alCambiar();
          }}
        />
      )}

      {eligiendo && (
        <DialogoSeleccion
          solped={solped}
          cotizacion={eligiendo}
          mejor={
            estado.estado === "listo"
              ? Math.min(...estado.datos.cotizaciones.map((c) => c.costoPuesto))
              : eligiendo.costoPuesto
          }
          alCerrar={() => setEligiendo(null)}
          alElegido={() => {
            recargar();
            alCambiar();
          }}
        />
      )}
    </>
  );
}

/* ── El cuadro comparativo ────────────────────────────────────────────────── */

function Comparativo({
  solped,
  datos,
  alAgregar,
  alElegir,
  alCambiar,
}: {
  solped: Solped;
  datos: Datos;
  alAgregar: () => void;
  alElegir: (c: Cotizacion) => void;
  alCambiar: () => void;
}) {
  const usuario = useUsuario();
  const [generando, setGenerando] = useState(false);
  // Cotizar y emitir son permisos distintos: quien cotiza no necesariamente emite.
  const puedeCotizar = puede(usuario, "cotizacion.gestionar");
  const puedeEmitir = puede(usuario, "ordenes.emitir");
  const [ordenCreada, setOrdenCreada] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [imprimiendo, setImprimiendo] = useState<Cotizacion | null>(null);
  const [enviando, setEnviando] = useState<Cotizacion | null>(null);
  const proveedorElegido = datos.proveedores.find(
    (p) => p.id === datos.cotizaciones.find((c) => c.seleccionada)?.proveedorId,
  );

  const recibidas = datos.cotizaciones.filter((c) => c.recibidaEn !== null);
  const mejor = recibidas.length > 0 ? Math.min(...recibidas.map((c) => c.costoPuesto)) : 0;
  const elegida = datos.cotizaciones.find((c) => c.seleccionada);

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
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M4 5h16v14H4Z" strokeLinejoin="round" />
              <path d="m4 6 8 6 8-6" strokeLinejoin="round" />
            </svg>
            Pedir cotización
          </button>
          <button
            type="button"
            onClick={alAgregar}
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

      {datos.cotizaciones.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
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
                      {c.recibidaEn === null && !c.enviadaEn && (
                        <span className="mt-1 block text-xs font-semibold text-[#8a5a09]">
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
                        <span className="mt-0.5 block text-xs text-[#0e7a4f]">el más bajo</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                      {c.plazoEntregaDias === null ? "—" : `${c.plazoEntregaDias} d`}
                    </td>
                    <td className="py-3 text-right">
                      {c.seleccionada ? (
                        <Chip tono="bueno">Elegido</Chip>
                      ) : c.recibidaEn !== null ? (
                        !puedeCotizar ? null : <button
                          type="button"
                          onClick={() => alElegir(c)}
                          className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                        >
                          Elegir
                        </button>
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
                                : "bg-cyan text-white hover:bg-cyan-deep"
                            }`}
                          >
                            {c.enviadaEn ? "Reenviar" : "Enviar"}
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
            <p className="mt-4 rounded-xl bg-[#eaf6ef] px-4 py-3 text-sm font-medium text-[#0e7a4f]">
              Orden {ordenCreada} creada en borrador. Ábrela en Órdenes de Compra para
              revisarla y emitirla.
            </p>
          ) : !puedeEmitir ? null : (
            <button
              type="button"
              onClick={() => setGenerando(true)}
              className="mt-4 rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
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

      {pidiendo && (
        <DialogoPedirCotizacion
          solped={solped}
          items={datos.pedidos}
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

/* ── Cargar una cotización ────────────────────────────────────────────────── */

type Linea = {
  solpedItemId: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio: number;
  disponible: boolean;
};

function FormularioCotizacion({
  solped,
  items,
  proveedores,
  cuantas,
  cotizaciones,
  alCerrar,
  alGuardado,
}: {
  solped: Solped;
  items: AvanceItem[];
  proveedores: Proveedor[];
  cuantas: number;
  /** Las que ya existen: de ahí sale si esto responde a una solicitud enviada. */
  cotizaciones: Cotizacion[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);

  /* Salen del selector los que ya respondieron. Los que tienen una solicitud
     enviada y sin respuesta SE QUEDAN: cargarles los precios es responderla, y
     esconderlos obligaba a crear una cotización nueva que además chocaba con la
     restricción de un proveedor por solicitud. */
  const yaRespondieron = cotizaciones
    .filter((c) => c.recibidaEn !== null)
    .map((c) => c.proveedorId);

  const disponibles = proveedores.filter(
    (p) => !yaRespondieron.includes(p.id) && p.estado !== "inactivo",
  );

  const [proveedorId, setProveedorId] = useState(disponibles[0]?.id ?? "");
  const [solicitadaEn, setSolicitadaEn] = useState(hoy);
  const [recibidaEn, setRecibidaEn] = useState(hoy);
  const [plazo, setPlazo] = useState<number | "">("");
  const [flete, setFlete] = useState(0);
  const [descuento, setDescuento] = useState(0);
  const [conFlete, setConFlete] = useState(false);
  const [conDescuento, setConDescuento] = useState(false);
  /* La condición de pago se propone con la del proveedor y solo se guarda
     aparte si alguien la cambia. Guardarla siempre obligaría a sincronizarla
     cada vez que cambia el proveedor, que es de donde salen los formularios que
     muestran la condición de otro. */
  const [condicionEditada, setCondicionEditada] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>(
    items.map((i) => ({
      solpedItemId: i.id,
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad: i.cantidadPedida,
      precio: 0,
      disponible: true,
    })),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const pendiente = cotizaciones.find(
    (c) => c.proveedorId === proveedorId && c.recibidaEn === null,
  );
  const condicion =
    condicionEditada ?? (proveedor ? condicionDeProveedor(proveedor) : "Contado");

  const itemsNeto = lineas
    .filter((l) => l.disponible)
    .reduce((t, l) => t + Math.round(l.cantidad * l.precio), 0);
  const puesto = itemsNeto - descuento + flete;

  function cambiar(id: string, campo: keyof Linea, valor: unknown) {
    setLineas((ls) => ls.map((l) => (l.solpedItemId === id ? { ...l, [campo]: valor } : l)));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!proveedorId) {
      setError("Elige un proveedor.");
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      if (pendiente) {
        /* Responde a una solicitud ya enviada: se actualiza esa fila en vez de
           crear otra, para que `solicitada_en` siga siendo cuándo se pidió. De
           esas dos fechas sale el tiempo de respuesta del proveedor, que es lo
           que después dice cuál contesta y cuál hace perder una semana. */
        await cargarRespuesta({
          cotizacionId: pendiente.id,
          recibidaEn: recibidaEn || new Date().toISOString().slice(0, 10),
          plazoEntregaDias: plazo === "" ? null : plazo,
          condicionPago: condicion.trim() || null,
          flete,
          descuento,
          precios: lineas.map((l) => ({
            solpedItemId: l.solpedItemId,
            precioUnitario: l.precio,
            disponible: l.disponible,
          })),
        });
      } else {
        const id = siguienteIdCotizacion(solped.id, cuantas);

        await crear("cotizaciones", {
          id,
          solped_id: solped.id,
          proveedor_id: proveedorId,
          solicitada_en: solicitadaEn,
          recibida_en: recibidaEn || null,
          plazo_entrega_dias: plazo === "" ? null : plazo,
          condicion_pago: condicion.trim() || null,
          flete,
          descuento,
          estado: recibidaEn ? "recibida" : "solicitada",
        });

        let n = 0;
        for (const l of lineas) {
          n += 1;
          await crear("cotizacion_items", {
            id: `${id}-${String(n).padStart(3, "0")}`,
            cotizacion_id: id,
            solped_item_id: l.solpedItemId,
            cantidad: l.cantidad,
            precio_unitario: l.disponible ? l.precio : 0,
            disponible: l.disponible,
          });
        }
      }

      alGuardado();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      titulo="Nueva cotización"
      descripcion={`${solped.numero} · los precios que te pasó un proveedor`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-4xl"
    >
      <form onSubmit={guardar}>
        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Combo
              etiqueta="Proveedor"
              requerido
              opciones={opcionesDe(disponibles)}
              valor={proveedorId}
              alCambiar={setProveedorId}
              marcador={
                disponibles.length === 0
                  ? "No quedan proveedores por cotizar"
                  : "Escribe para buscar entre los proveedores…"
              }
              ayuda={
                pendiente
                  ? `Responde a la solicitud ${pendiente.numero ?? pendiente.id}: se cargan los precios sobre ella y no se crea otra.`
                  : "Cada proveedor cotiza una vez por solicitud. Los que ya respondieron no aparecen."
              }
            />
          </div>

          <label>
            <Etiqueta>Se le pidió el</Etiqueta>
            <input
              type="date"
              value={solicitadaEn}
              onChange={(e) => setSolicitadaEn(e.target.value)}
              className={claseCelda}
            />
          </label>

          <label>
            <Etiqueta>Respondió el</Etiqueta>
            <input
              type="date"
              value={recibidaEn}
              onChange={(e) => setRecibidaEn(e.target.value)}
              className={claseCelda}
            />
            <Ayuda>Déjalo vacío si todavía no responde: queda esperando.</Ayuda>
          </label>

          <label>
            <Etiqueta>Plazo de entrega</Etiqueta>
            <input
              type="number"
              min="0"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="días"
              className={claseCelda}
            />
          </label>

          <label>
            <Etiqueta>Condición de pago</Etiqueta>
            <select
              value={condicion}
              onChange={(e) => setCondicionEditada(e.target.value)}
              className={claseCelda}
            >
              {opcionesCondicionPago.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
            </select>
            <Ayuda>
              Viene de la ficha del proveedor. Cámbiala solo si en esta cotización
              ofreció otra cosa.
            </Ayuda>
          </label>

          {/* Flete y descuento son opcionales: la mayoría de las cotizaciones no
              traen ninguno de los dos, y dos campos en cero arriba del formulario
              se leen como algo que falta llenar. Se abren cuando existen. */}
          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-5 border-t border-mist pt-5">
              <p className="text-sm font-semibold text-ink">Ajustes al total</p>
              <Casilla
                marcada={conFlete}
                alCambiar={(v) => {
                  setConFlete(v);
                  if (!v) setFlete(0);
                }}
              >
                Trae flete
              </Casilla>
              <Casilla
                marcada={conDescuento}
                alCambiar={(v) => {
                  setConDescuento(v);
                  if (!v) setDescuento(0);
                }}
              >
                Trae descuento
              </Casilla>
              <span className="text-xs text-ink-soft">Opcionales. Si no los marcas, no se cobran.</span>
            </div>

            {(conFlete || conDescuento) && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {conFlete && (
                  <label>
                    <Etiqueta>Flete</Etiqueta>
                    <input
                      inputMode="numeric"
                      value={flete === 0 ? "" : flete.toLocaleString("es-CL")}
                      onChange={(e) => setFlete(Number(e.target.value.replace(/\D/g, "")) || 0)}
                      placeholder="0"
                      className={`${claseCelda} text-right tabular-nums`}
                    />
                    <Ayuda>
                      Se suma al comparar: el más barato en la lista no siempre lo es en
                      obra.
                    </Ayuda>
                  </label>
                )}

                {conDescuento && (
                  <label>
                    <Etiqueta>Descuento</Etiqueta>
                    <input
                      inputMode="numeric"
                      value={descuento === 0 ? "" : descuento.toLocaleString("es-CL")}
                      onChange={(e) => setDescuento(Number(e.target.value.replace(/\D/g, "")) || 0)}
                      placeholder="0"
                      className={`${claseCelda} text-right tabular-nums`}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        <section className="border-t border-mist px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">
                Precios por ítem
              </h3>
              <p className="mt-1 max-w-lg text-sm text-ink-soft">
                Ítem por ítem, no un total: es lo que permite ver que el acero conviene
                en uno y la pintura en otro.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <LectorDeCotizacion
              lineas={lineas}
              alAplicar={({ precios, condicion, flete: fleteLeido, descuento: dctoLeido }) => {
                setLineas((ls) =>
                  ls.map((l) =>
                    precios.has(l.solpedItemId)
                      ? { ...l, precio: precios.get(l.solpedItemId)!, disponible: true }
                      : l,
                  ),
                );
                if (condicion) setCondicionEditada(condicion);
                if (fleteLeido !== null && fleteLeido > 0) {
                  setConFlete(true);
                  setFlete(fleteLeido);
                }
                if (dctoLeido !== null && dctoLeido > 0) {
                  setConDescuento(true);
                  setDescuento(dctoLeido);
                }
              }}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="py-2 pr-3">Ítem</th>
                  <th className="w-24 py-2 pr-3 text-right">Cantidad</th>
                  <th className="w-32 py-2 pr-3 text-right">P. unitario</th>
                  <th className="w-28 py-2 pr-3 text-right">Neto</th>
                  <th className="w-24 py-2">¿Tiene?</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.solpedItemId} className="border-b border-mist last:border-0">
                    <td className="py-2 pr-3 text-ink">{l.descripcion}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {formatearNumero(l.cantidad)} {l.unidad}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        inputMode="numeric"
                        disabled={!l.disponible}
                        value={l.precio === 0 ? "" : l.precio.toLocaleString("es-CL")}
                        onChange={(e) =>
                          cambiar(
                            l.solpedItemId,
                            "precio",
                            Number(e.target.value.replace(/\D/g, "")) || 0,
                          )
                        }
                        placeholder="0"
                        className={`${claseCelda} text-right tabular-nums disabled:opacity-40`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {l.disponible ? formatearPesos(Math.round(l.cantidad * l.precio)) : "—"}
                    </td>
                    <td className="py-2">
                      <label className="flex items-center gap-2 text-xs text-ink-soft">
                        <input
                          type="checkbox"
                          checked={l.disponible}
                          onChange={(e) =>
                            cambiar(l.solpedItemId, "disponible", e.target.checked)
                          }
                          className="h-4 w-4 rounded border-mist-deep accent-cyan"
                        />
                        Sí
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-5 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
            <Linea etiqueta="Ítems" valor={formatearPesos(itemsNeto)} />
            {descuento > 0 && <Linea etiqueta="Descuento" valor={`− ${formatearPesos(descuento)}`} />}
            {flete > 0 && <Linea etiqueta="Flete" valor={formatearPesos(flete)} />}
            <div className="mt-1 flex justify-between border-t border-mist pt-2">
              <dt className="font-display font-semibold text-ink">Puesto en obra</dt>
              <dd className="font-display font-semibold tabular-nums text-ink">
                {formatearPesos(puesto)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="border-t border-mist px-6 py-5">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
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
              type="submit"
              disabled={guardando || !proveedorId}
              className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70"
            >
              {guardando ? "Guardando…" : "Guardar cotización"}
            </button>
          </div>
        </div>
      </form>
    </Dialogo>
  );
}

/* ── Elegir proveedor ─────────────────────────────────────────────────────── */

function DialogoSeleccion({
  solped,
  cotizacion,
  mejor,
  alCerrar,
  alElegido,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  mejor: number;
  alCerrar: () => void;
  alElegido: () => void;
}) {
  const esElMasBarato = cotizacion.costoPuesto <= mejor;
  const [motivo, setMotivo] = useState(esElMasBarato ? "Menor costo puesto en obra" : "");
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
      setError(e instanceof Error ? e.message : String(e));
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
          <p className="mb-4 rounded-xl bg-[#fdf4e6] px-4 py-3 text-sm text-[#8a5a09]">
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
            className="mt-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
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
          className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Elegir este proveedor"}
        </button>
      </div>
    </Dialogo>
  );
}

/** Un proveedor como opción del buscador: nombre arriba, RUT y rubro abajo. */
function opcionesDe(proveedores: Proveedor[]) {
  return proveedores.map((p) => ({
    id: p.id,
    titulo: p.razonSocial,
    nota: [formatearRut(p.rut), ...p.rubros.slice(0, 2)].filter(Boolean).join(" · "),
  }));
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </span>
  );
}

function Ayuda({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-xs text-ink-soft">{children}</span>;
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{etiqueta}</dt>
      <dd className="tabular-nums text-ink-soft">{valor}</dd>
    </div>
  );
}

/** Casilla de sí o no, para lo que es opcional y casi siempre no viene. */
function Casilla({
  marcada,
  alCambiar,
  children,
}: {
  marcada: boolean;
  alCambiar: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => alCambiar(e.target.checked)}
        className="size-4 rounded border-mist-deep text-cyan accent-cyan"
      />
      {children}
    </label>
  );
}

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
function DialogoGenerarOrden({
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
  const comprables = estado.datos.cotizados.filter(
    (i) => i.disponible && i.precioUnitario > 0,
  );

  /* Por omisión entra lo que todavía no se ha comprado. Lo que ya se compró en
     una orden anterior arranca desmarcado: marcarlo de nuevo sería pedir dos
     veces lo mismo. */
  const marcados =
    elegidos ??
    new Set(
      comprables
        .filter((i) => (porSolpedItem.get(i.solpedItemId)?.cantidadPendiente ?? 1) > 0)
        .map((i) => i.solpedItemId),
    );

  const alternar = (id: string) => {
    const copia = new Set(marcados);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    setElegidos(copia);
  };

  const netoElegido = comprables
    .filter((i) => marcados.has(i.solpedItemId))
    .reduce((t, i) => t + Math.round(i.cantidad * i.precioUnitario), 0);
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
        incluirFlete: conFlete && cotizacion.flete > 0,
        anexoId: anexoId || null,
        proyecto: (() => {
          const anexo = vigentes.find((a) => a.id === anexoId);
          return anexo ? proyectoDeAnexo(anexo) : null;
        })(),
      });
      alCreada(numero || id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
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
                      <span className="block text-ink">{pedido?.descripcion ?? "Ítem"}</span>
                      {yaComprado && (
                        <span className="mt-0.5 block text-xs text-[#8a5a09]">
                          Ya se compraron {formatearNumero(pedido?.cantidadComprada ?? 0)}{" "}
                          {pedido?.unidad} en otra orden
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {formatearNumero(i.cantidad)} {pedido?.unidad ?? ""}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {formatearPesos(i.precioUnitario)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">
                      {formatearPesos(Math.round(i.cantidad * i.precioUnitario))}
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
            className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
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
            className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? "Generando…" : `Generar orden por ${formatearPesos(total)}`}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

/* ── Leer la cotización del proveedor ─────────────────────────────────────── */

/**
 * Sube el PDF que mandó el proveedor y llena los precios solo.
 *
 * Lo hace el navegador con pdf.js: el archivo no sale del computador, no hay
 * clave de ningún servicio que se pueda filtrar y no hay cuota mensual que se
 * acabe. Ver `lib/lector-cotizacion.ts` para por qué se descartó un servicio
 * de IA.
 *
 * Nunca escribe un precio sin mostrar antes qué entendió: emparejar por nombre
 * acierta casi siempre, y "casi" es exactamente la razón por la que el
 * resultado se revisa en pantalla antes de quedar.
 */
function LectorDeCotizacion({
  lineas,
  alAplicar,
}: {
  lineas: Linea[];
  alAplicar: (r: {
    precios: Map<string, number>;
    condicion: string | null;
    flete: number | null;
    descuento: number | null;
  }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pegado, setPegado] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaCotizacion | null>(null);

  const items = lineas.map((l) => ({ id: l.solpedItemId, descripcion: l.descripcion }));
  const resultado = lectura ? emparejar(lectura.filas, items) : null;

  async function leerArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setLeyendo(true);
    try {
      setLectura(await leerCotizacionPdf(archivo));
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudo leer el PDF: ${e.message}. Si es un escaneo o una foto, pega la tabla.`
          : String(e),
      );
    } finally {
      setLeyendo(false);
    }
  }

  function aplicar() {
    if (!resultado) return;
    const precios = new Map<string, number>();
    for (const [itemId, { fila }] of resultado.asignadas) {
      if (fila.precioUnitario !== null) precios.set(itemId, fila.precioUnitario);
    }
    alAplicar({
      precios,
      condicion: lectura?.condicion ?? null,
      flete: lectura?.flete ?? null,
      descuento: lectura?.descuento ?? null,
    });
    setAbierto(false);
    setLectura(null);
    setPegado("");
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path d="M12 16V4m0 0 4 4m-4-4L8 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
        </svg>
        Leer del PDF del proveedor
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-mist-deep bg-mist/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-ink">
            Leer la cotización del proveedor
          </p>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-ink-soft">
            El PDF se lee acá mismo, en tu navegador: no se sube a ninguna parte. Si es
            un escaneo o una foto, pega la tabla en el cuadro de abajo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setLectura(null);
          }}
          className="text-xs font-semibold text-ink-soft hover:text-ink"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
          {leyendo ? "Leyendo…" : "Elegir PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => void leerArchivo(e.target.files?.[0])}
          />
        </label>
        <span className="text-xs text-ink-soft">o pega la tabla desde Excel o el correo</span>
      </div>

      <textarea
        value={pegado}
        onChange={(e) => setPegado(e.target.value)}
        onBlur={() => {
          if (pegado.trim()) setLectura(leerCotizacionPegada(pegado));
        }}
        rows={3}
        placeholder={"Descripción\tCantidad\tPrecio\tTotal\nDisco de corte 4½″\t10\t2.400\t24.000"}
        className="mt-3 w-full rounded-lg border border-mist-deep bg-white px-3 py-2 font-mono text-xs text-ink outline-none focus:border-cyan"
      />

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#fdeeec] px-3 py-2 text-xs font-medium text-[#a52f24]">
          {error}
        </p>
      )}

      {lectura && (
        <div className="mt-4 border-t border-mist pt-4">
          {lectura.aviso ? (
            <p className="rounded-lg bg-[#fdf4e6] px-3 py-2 text-xs text-[#8a5a09]">
              {lectura.aviso}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                Leí <strong>{lectura.filas.length}</strong>{" "}
                {lectura.filas.length === 1 ? "línea" : "líneas"} y{" "}
                <strong>{resultado?.asignadas.size ?? 0}</strong> calzan con lo que se
                pidió.
                {lectura.condicion && ` Condición: ${lectura.condicion}.`}
                {lectura.flete !== null && ` Flete: ${formatearPesos(lectura.flete)}.`}
              </p>

              <ul className="mt-3 flex max-h-52 flex-col gap-1 overflow-y-auto text-xs">
                {lineas.map((l) => {
                  const calce = resultado?.asignadas.get(l.solpedItemId);
                  return (
                    <li
                      key={l.solpedItemId}
                      className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink">{l.descripcion}</span>
                      {calce ? (
                        <>
                          <span className="truncate text-ink-soft" title={calce.fila.descripcion}>
                            ← {calce.fila.descripcion.slice(0, 32)}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-ink">
                            {formatearPesos(calce.fila.precioUnitario ?? 0)}
                          </span>
                        </>
                      ) : (
                        <span className="shrink-0 text-[#8a5a09]">sin calce · queda a mano</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {resultado && resultado.sobrantes.length > 0 && (
                <p className="mt-2 text-xs text-ink-soft">
                  {resultado.sobrantes.length}{" "}
                  {resultado.sobrantes.length === 1 ? "línea del PDF no corresponde" : "líneas del PDF no corresponden"}{" "}
                  a nada de esta solicitud y se ignoran.
                </p>
              )}

              <button
                type="button"
                onClick={aplicar}
                disabled={(resultado?.asignadas.size ?? 0) === 0}
                className="mt-4 rounded-full bg-cyan px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-50"
              >
                Usar estos precios
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Pedir cotización a un proveedor ──────────────────────────────────────── */

/**
 * Manda la solicitud de cotización con solo los ítems que le tocan a este
 * proveedor.
 *
 * Es lo que faltaba para cotizar de verdad: el ferretero no vende EPP y el de
 * EPP no vende fierro, así que pedirle a cada uno la lista completa lo obliga a
 * contestar "no tengo" en la mitad. Acá se le pide lo suyo, y lo que quede se le
 * pide a otro entrando de nuevo.
 *
 * Al mandarla la solicitud pasa a «en cotización» —lo hace un trigger de la
 * base—: desde ese momento se está esperando a un tercero, que es información
 * distinta de "todavía no la mando".
 */
function DialogoPedirCotizacion({
  solped,
  items,
  proveedores,
  cotizaciones,
  alCerrar,
  alPedida,
}: {
  solped: Solped;
  items: ItemSolped[];
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  alCerrar: () => void;
  alPedida: (cotizacionId: string) => void;
}) {
  const yaPedidos = cotizaciones.map((c) => c.proveedorId);
  const disponibles = proveedores.filter(
    (p) => !yaPedidos.includes(p.id) && p.estado !== "inactivo",
  );

  const [proveedorId, setProveedorId] = useState(disponibles[0]?.id ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: string) => {
    const copia = new Set(elegidos);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    setElegidos(copia);
  };

  async function pedir() {
    if (!proveedorId) {
      setError("Elige un proveedor.");
      return;
    }
    if (elegidos.size === 0) {
      setError("Marca al menos un ítem para pedirle a este proveedor.");
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      const id = await pedirCotizacion({
        solped,
        proveedorId,
        numero: siguienteNumeroSolicitud(cotizaciones),
        items: items
          .filter((i) => elegidos.has(i.id))
          .map((i) => ({ solpedItemId: i.id, cantidad: i.cantidad })),
        observaciones: observaciones.trim() || null,
      });
      alPedida(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      titulo="Pedir cotización"
      descripcion={`${solped.numero} · elige a quién y qué le pides`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      <div className="px-6 py-6">
        <Combo
          etiqueta="Proveedor"
          requerido
          opciones={opcionesDe(disponibles)}
          valor={proveedorId}
          alCambiar={setProveedorId}
          marcador={
            disponibles.length === 0
              ? "Ya se le pidió a todos los proveedores activos"
              : "Escribe para buscar entre los proveedores…"
          }
          ayuda="A cada proveedor se le pide una vez por solicitud. Para pedirle lo que quede a otro, se vuelve a entrar acá."
        />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Qué se le pide</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Lo que dejes fuera queda disponible para pedírselo a otro proveedor.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setElegidos(
                elegidos.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
              )
            }
            className="text-xs font-semibold text-cyan-deep hover:underline"
          >
            {elegidos.size === items.length ? "Desmarcar todos" : "Marcar todos"}
          </button>
        </div>

        <ul className="mt-4 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-start gap-3 rounded-lg border border-mist-deep bg-white px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={elegidos.has(i.id)}
                onChange={() => alternar(i.id)}
                aria-label={i.descripcion}
                className="mt-0.5 h-4 w-4 rounded border-mist-deep accent-cyan"
              />
              <span className="min-w-0 flex-1">
                {/* Se muestra el nombre con el que se va a imprimir. */}
                <span className="block text-ink">{i.nombreParaPedir}</span>
                {i.nombreParaPedir !== i.descripcion && (
                  <span className="block text-xs text-ink-soft">
                    faena lo pidió como «{i.descripcion}»
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {formatearNumero(i.cantidad)} {i.unidad}
              </span>
            </li>
          ))}
        </ul>

        <label className="mt-5 block">
          <Etiqueta>Observaciones para el proveedor</Etiqueta>
          <input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Entrega en faena Coya Sur, indicar plazo por ítem"
            className={claseCelda}
          />
          <Ayuda>Sale impresa en la solicitud. Opcional.</Ayuda>
        </label>
      </div>

      <div className="border-t border-mist px-6 py-5">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
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
            onClick={() => void pedir()}
            disabled={guardando || !proveedorId || elegidos.size === 0}
            className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando
              ? "Creando…"
              : `Pedir ${elegidos.size} ${elegidos.size === 1 ? "ítem" : "ítems"}`}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}

/* ── La solicitud, lista para mandar ──────────────────────────────────────── */

function VistaSolicitud({
  solped,
  cotizacion,
  proveedor,
  alCerrar,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  proveedor: Proveedor | undefined;
  alCerrar: () => void;
}) {
  const { estado } = useConsulta(async () => {
    const [cotizados, pedidos, ficha] = await Promise.all([
      cargarItemsDeCotizacion(cotizacion.id),
      cargarItemsDeSolped(solped.id),
      cargarCotizacion(cotizacion.id),
    ]);
    return { cotizados, pedidos, ficha };
  });

  return (
    <Impresion
      titulo={`Solicitud de cotización · ${cotizacion.numero ?? cotizacion.id}`}
      alCerrar={alCerrar}
    >
      {estado.estado !== "listo" ? (
        <p className="mx-auto max-w-[210mm] rounded-2xl bg-white p-10 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Preparando la solicitud…"}
        </p>
      ) : (
        <SolicitudCotizacionImprimible
          numero={cotizacion.numero ?? cotizacion.id}
          proveedor={cotizacion.proveedor}
          rutProveedor={proveedor?.rut ?? null}
          contacto={proveedor?.contacto ?? null}
          contrato={solped.contrato}
          solicitante={solped.solicitanteNombre}
          fechaSolicitud={cotizacion.solicitadaEn}
          fechaRequerida={solped.fechaRequerida}
          observaciones={estado.datos.ficha.observaciones}
          items={estado.datos.cotizados.map((c, n) => {
            const pedido = estado.datos.pedidos.find((p) => p.id === c.solpedItemId);
            return {
              linea: n + 1,
              // El nombre técnico si se conoce: es el único con el que el
              // proveedor sabe qué mandar sin preguntar.
              descripcion: pedido?.nombreParaPedir ?? "Ítem",

              especificacion: pedido?.especificacion ?? null,
              unidad: pedido?.unidad ?? "un",
              cantidad: c.cantidad,
              observacion: pedido?.observacion ?? null,
            };
          })}
        />
      )}
    </Impresion>
  );
}

/* ── Mandarle la solicitud al proveedor ───────────────────────────────────── */

/**
 * Arma el correo con todo escrito y lo abre en el cliente de quien está
 * trabajando.
 *
 * POR QUÉ NO SE MANDA SOLO. La plataforma es un export estático: no hay
 * servidor que pueda enviar un correo por su cuenta, y meter la clave de un
 * servicio de correo en el navegador la deja a la vista de cualquiera. Hacerlo
 * desde una casilla de la empresa necesita una Edge Function y un dominio
 * verificado; hasta entonces esto es lo que ya hacen a mano, pero sin teclear.
 *
 * El detalle de los ítems va EN EL CUERPO. Un `mailto:` no adjunta archivos, y
 * un correo que dice "adjunto solicitud" sin adjunto no sirve. Así el proveedor
 * puede cotizar respondiendo, y el PDF queda para quien quiera mandarlo además.
 */
function DialogoEnviar({
  solped,
  cotizacion,
  proveedor,
  alCerrar,
  alEnviada,
}: {
  solped: Solped;
  cotizacion: Cotizacion;
  proveedor: Proveedor | undefined;
  alCerrar: () => void;
  alEnviada: () => void;
}) {
  const [destinatario, setDestinatario] = useState(
    cotizacion.correoProveedor ?? proveedor?.correo ?? "",
  );
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { estado } = useConsulta(async () => {
    const [cotizados, pedidos] = await Promise.all([
      cargarItemsDeCotizacion(cotizacion.id),
      cargarItemsDeSolped(solped.id),
    ]);
    return { cotizados, pedidos };
  });

  if (estado.estado !== "listo") {
    return (
      <Dialogo titulo="Enviar al proveedor" abierto alCerrar={alCerrar} ancho="max-w-2xl">
        <p className="px-6 py-12 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Armando el correo…"}
        </p>
      </Dialogo>
    );
  }

  const items = estado.datos.cotizados.map((c, n) => {
    const pedido = estado.datos.pedidos.find((p) => p.id === c.solpedItemId);
    return {
      linea: n + 1,
      descripcion: pedido?.nombreParaPedir ?? "Ítem",
      unidad: pedido?.unidad ?? "un",
      cantidad: c.cantidad,
    };
  });

  const { asunto, cuerpo } = armarCorreoSolicitud({
    numero: cotizacion.numero ?? cotizacion.id,
    contrato: solped.contrato,
    solicitante: solped.solicitanteNombre,
    fechaRequerida: solped.fechaRequerida,
    contacto: cotizacion.contactoProveedor,
    items,
    observaciones: cotizacion.observaciones,
  });

  const enlace = enlaceMailto(destinatario, asunto, cuerpo);
  const muyLargo = enlace.length > TOPE_MAILTO;

  /**
   * Mandar de verdad, sin salir de la plataforma.
   *
   * Si la función de correo está desplegada, sale de ahí; el remitente es la
   * casilla que esté configurada en los secretos —hoy todavía no es una de
   * Valar— y el proveedor contesta al correo de quien pidió la cotización.
   * Si no está —o falla—, se cae al camino de siempre: abrir el cliente de
   * correo con todo escrito. Lo que no puede pasar es que alguien se quede sin
   * poder mandar la solicitud porque una configuración de servidor no estaba
   * lista.
   */
  async function enviarDeVerdad() {
    if (!destinatario.trim()) {
      setError("Falta el correo del proveedor.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const salio = await enviarSolicitudPorCorreo({
        cotizacionId: cotizacion.id,
        para: destinatario.trim(),
        asunto,
        texto: cuerpo,
      });

      if (salio) {
        alEnviada();
        return;
      }

      // La función no está disponible: se abre el cliente de correo.
      await registrarEnvio(cotizacion.id, destinatario.trim());
      window.location.href = enlace;
      alEnviada();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  }

  async function marcarEnviada(abrirCliente: boolean) {
    if (!destinatario.trim()) {
      setError("Falta el correo del proveedor.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await registrarEnvio(cotizacion.id, destinatario.trim());
      if (abrirCliente) window.location.href = enlace;
      alEnviada();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("El navegador no dejó copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <Dialogo
      titulo={`Enviar ${cotizacion.numero ?? cotizacion.id} a ${cotizacion.proveedor}`}
      descripcion="Se abre tu correo con todo escrito. Revísalo antes de mandarlo."
      abierto
      alCerrar={alCerrar}
      ancho="max-w-2xl"
    >
      <div className="px-6 py-6">
        <label className="block">
          <Etiqueta>Para</Etiqueta>
          <input
            type="email"
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
            placeholder="ventas@proveedor.cl"
            className={claseCelda}
          />
          <Ayuda>
            {cotizacion.correoProveedor
              ? "Sale de la ficha del proveedor. Si cambió, corrígelo también en Proveedores."
              : "Este proveedor no tiene correo en su ficha: escríbelo acá y agrégalo en Proveedores."}
          </Ayuda>
        </label>

        <div className="mt-5">
          <Etiqueta>Asunto</Etiqueta>
          <p className="rounded-xl border border-mist-deep bg-mist/30 px-4 py-2.5 text-sm text-ink">
            {asunto}
          </p>
        </div>

        <div className="mt-5">
          <Etiqueta>Mensaje</Etiqueta>
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 font-sans text-sm leading-relaxed text-ink">
            {cuerpo}
          </pre>
          <Ayuda>
            El detalle va en el texto a propósito: así el proveedor puede cotizar
            respondiendo, sin abrir un adjunto.
          </Ayuda>
        </div>

        {muyLargo && (
          <p className="mt-4 rounded-xl bg-[#fdf4e6] px-4 py-3 text-sm leading-relaxed text-[#8a5a09]">
            El mensaje es largo y algunos clientes de correo lo cortan al abrirlo. Usa
            <strong> Copiar el mensaje</strong>, pégalo en un correo nuevo y adjunta el
            PDF de la solicitud.
          </p>
        )}
      </div>

      <div className="border-t border-mist px-6 py-5">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void copiar()}
            className="mr-auto rounded-full border border-mist-deep px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            {copiado ? "Copiado" : "Copiar el mensaje"}
          </button>

          {/* Marcar sin abrir el cliente: para cuando ya se mandó por fuera y lo
              que falta es que quede la constancia. */}
          <button
            type="button"
            onClick={() => void marcarEnviada(false)}
            disabled={enviando}
            className="rounded-full border border-mist-deep px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
          >
            Ya la mandé
          </button>

          {/* Abrir el cliente queda como alternativa, no como la única vía:
              sirve para revisar el correo antes de mandarlo, o cuando la
              función de correo todavía no está desplegada. */}
          <button
            type="button"
            onClick={() => void marcarEnviada(true)}
            disabled={enviando || !destinatario.trim()}
            className="rounded-full border border-mist-deep px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
          >
            Abrir en mi correo
          </button>

          <button
            type="button"
            onClick={() => void enviarDeVerdad()}
            disabled={enviando || !destinatario.trim()}
            className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
