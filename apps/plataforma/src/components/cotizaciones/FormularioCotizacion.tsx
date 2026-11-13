"use client";

import { useState } from "react";
import { Combo } from "../ui/Combo";
import { Dialogo } from "../ui/Formulario";
import { mensajeDeNombreCotizado, cargarRespuesta, condicionDeProveedor, opcionesCondicionPago, registrarCotizacion, type ItemCotizado, type ItemSolped, type AvanceItem, type Cotizacion, type Proveedor, type Solped } from "@/lib/abastecimiento";
import { aprenderNombreDelProveedor, fijarNombreTecnico } from "@/lib/articulos";
import { emparejar, leerCotizacionPdf, leerCotizacionPegada, type LecturaCotizacion } from "@/lib/lector-cotizacion";
import { formatearPesos, formatearPesosUnitario } from "@/lib/formato";
import { CampoPrecio } from "../ui/CampoPrecio";
import { claseCelda, type Datos, opcionesDe, Etiqueta, Ayuda, Linea, Casilla } from "./piezas";

export function FormularioCotizacion({
  solped,
  items,
  pedidos,
  solicitados,
  proveedores,
  cotizaciones,
  proveedorInicial,
  corrigiendo = null,
  soloFaltantes = false,
  alAmpliar,
  alCerrar,
  alGuardado,
}: {
  solped: Solped;
  items: AvanceItem[];
  pedidos: ItemSolped[];
  solicitados: Datos["solicitados"];
  proveedores: Proveedor[];
  /** Las que ya existen: de ahí sale si esto responde a una solicitud enviada. */
  cotizaciones: Cotizacion[];
  /** El proveedor de la solicitud desde la que se abrió, si se abrió desde una. */
  proveedorInicial: string | null;
  /** Corregir una cotización ya cargada: sus valores vienen puestos y se actualiza esa misma. */
  corrigiendo?: { cotizacion: Cotizacion; items: ItemCotizado[] } | null;
  /** Al corregir, mostrar solo lo que falta por comprar (la cantidad que falta), no lo ya comprado. */
  soloFaltantes?: boolean;
  /** Elegir un proveedor que ya respondió: sus ítems nuevos se agregan a SU cotización, no a una nueva. */
  alAmpliar?: (cotizacion: Cotizacion) => void;
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

  /* Una solicitud se compra en varias órdenes: si todavía faltan ítems (uno que
     nadie cotizó, o cantidad por completar), el proveedor que ya respondió puede
     cotizarlos también. Se le suman a su misma cotización —hay una por proveedor—,
     que es lo que después permite elegirlo de nuevo y emitirle otra orden. */
  const hayPendientes = items.some((i) => i.cantidadPendiente > 0);
  const ampliables = alAmpliar && hayPendientes
    ? proveedores.filter((p) => yaRespondieron.includes(p.id) && p.estado !== "inactivo")
    : [];

  /* Los proveedores a los que SE LES PIDIÓ van primero: los precios que se
     cargan son, casi siempre, de ellos. Si hay uno solo, ya viene elegido. */
  const aQuienSePidio = cotizaciones.filter((c) => c.recibidaEn === null).map((c) => c.proveedorId);
  const ordenados = [
    ...disponibles.filter((p) => aQuienSePidio.includes(p.id)),
    ...disponibles.filter((p) => !aQuienSePidio.includes(p.id)),
  ];

  const previa = corrigiendo?.cotizacion ?? null;
  const [proveedorId, setProveedorId] = useState(
    previa
      ? previa.proveedorId
      : proveedorInicial && ordenados.some((p) => p.id === proveedorInicial)
        ? proveedorInicial
        : aQuienSePidio.length === 1
          ? aQuienSePidio[0]
          : "",
  );
  const [solicitadaEn, setSolicitadaEn] = useState(hoy);
  const [recibidaEn, setRecibidaEn] = useState(previa?.recibidaEn ?? hoy);
  const [plazo, setPlazo] = useState<number | "">(previa?.plazoEntregaDias ?? "");
  const [flete, setFlete] = useState(previa?.flete ?? 0);
  const [descuento, setDescuento] = useState(previa?.descuento ?? 0);
  const [conFlete, setConFlete] = useState((previa?.flete ?? 0) > 0);
  const [conDescuento, setConDescuento] = useState((previa?.descuento ?? 0) > 0);
  /* La condición de pago se propone con la del proveedor y solo se guarda
     aparte si alguien la cambia. Guardarla siempre obligaría a sincronizarla
     cada vez que cambia el proveedor, que es de donde salen los formularios que
     muestran la condición de otro. */
  const [condicionEditada, setCondicionEditada] = useState<string | null>(previa?.condicionPago ?? null);
  /* Lo que la persona escribió, por proveedor e ítem. Las líneas se DERIVAN de
     lo que se le pidió a ese proveedor más estos cambios: así, al cambiar de
     proveedor la plantilla cambia sola y no se pierde lo ya tecleado. */
  const [cambios, setCambios] = useState<
    Record<string, Partial<Pick<Linea, "precio" | "disponible" | "nombre" | "cantidad">>>
  >({});
  const [guardarNombres, setGuardarNombres] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proveedor = proveedores.find((p) => p.id === proveedorId);
  // Al corregir, "la cotización" es la que se está corrigiendo; si no, la solicitud pendiente de ese proveedor.
  const pendiente =
    previa ?? cotizaciones.find((c) => c.proveedorId === proveedorId && c.recibidaEn === null);
  const condicion =
    condicionEditada ?? (proveedor ? condicionDeProveedor(proveedor) : "Contado");

  /* La plantilla: si a este proveedor se le mandó una solicitud, SOLO sus
     ítems y con las cantidades que se le pidieron; si no, toda la solicitud.
     El nombre propuesto es, en orden, el que ya cotizó este proveedor antes, el
     técnico del catálogo y el de faena. */
  const solicitado = corrigiendo
    ? { items: corrigiendo.items, nombres: new Map<string, string>() }
    : pendiente
      ? solicitados[proveedorId]
      : undefined;
  /* Al corregir, además de lo que ya cotizó entran los ítems que todavía faltan
     por comprar y que esta cotización no tiene: son los que se le agregan. Parten
     sin precio, y si se dejan así no se guardan. */
  /* Lo mismo vale al responder una solicitud ya enviada: si después de pedirla se
     agregaron ítems a la SOLPED, esos no estaban en lo que se le pidió y sin esto
     nunca aparecían para ponerles precio. */
  const nuevosEnCorreccion: Linea[] = solicitado
    ? items
        .filter((i) => i.cantidadPendiente > 0 && !solicitado.items.some((ci) => ci.solpedItemId === i.id))
        .map((i) => {
          const p = pedidos.find((x) => x.id === i.id);
          return {
            solpedItemId: i.id,
            descripcion: p?.nombreParaPedir ?? i.descripcion,
            nombre: p?.nombreParaPedir ?? i.descripcion,
            articuloId: p?.articuloId ?? null,
            tieneNombreTecnico: p?.nombreTecnico != null,
            unidad: i.unidad,
            cantidad: i.cantidadPendiente,
            precio: 0,
            disponible: true,
          };
        })
    : [];

  const pendientePorItem = new Map(items.map((i) => [i.id, i.cantidadPendiente]));

  const base: Linea[] = solicitado
    ? [...solicitado.items.flatMap((ci) => {
        const p = pedidos.find((x) => x.id === ci.solpedItemId);
        if (!p) return [];
        // Ya comprado por completo: no se vuelve a mostrar ni a tocar.
        if (soloFaltantes && !((pendientePorItem.get(ci.solpedItemId) ?? 0) > 0)) return [];
        return [
          {
            solpedItemId: p.id,
            descripcion: ci.nombrePedido ?? p.nombreParaPedir,
            nombre:
              ci.nombreCotizado ??
              ci.nombrePedido ??
              (p.articuloId ? solicitado.nombres.get(p.articuloId) : undefined) ??
              p.nombreParaPedir,
            articuloId: p.articuloId,
            tieneNombreTecnico: p.nombreTecnico !== null,
            unidad: p.unidad,
            // Sumando lo que falta, la cantidad es la que falta, no la de la compra anterior.
            cantidad: soloFaltantes ? (pendientePorItem.get(ci.solpedItemId) ?? ci.cantidad) : ci.cantidad,
            // Una cotización nueva parte en cero; al corregir, de lo ya cargado.
            precio: ci.precioUnitario,
            disponible: ci.disponible,
          },
        ];
      }), ...nuevosEnCorreccion]
    : (items.some((i) => i.cantidadComprada > 0) && items.some((i) => i.cantidadPendiente > 0)
        ? items.filter((i) => i.cantidadPendiente > 0)
        : items
      ).map((i) => {
        const p = pedidos.find((x) => x.id === i.id);
        return {
          solpedItemId: i.id,
          descripcion: p?.nombreParaPedir ?? i.descripcion,
          nombre: p?.nombreParaPedir ?? i.descripcion,
          articuloId: p?.articuloId ?? null,
          tieneNombreTecnico: p?.nombreTecnico != null,
          unidad: i.unidad,
          cantidad: i.cantidadComprada > 0 && i.cantidadPendiente > 0 ? i.cantidadPendiente : i.cantidadPedida,
          precio: 0,
          disponible: true,
        };
      });

  const clave = (itemId: string) => `${proveedorId}:${itemId}`;
  const lineas: Linea[] = base.map((l) => ({ ...l, ...cambios[clave(l.solpedItemId)] }));

  const itemsNeto = lineas
    .filter((l) => l.disponible)
    .reduce((t, l) => t + Math.round(l.cantidad * l.precio), 0);
  const puesto = itemsNeto - descuento + flete;

  function cambiar(id: string, campo: "precio" | "disponible" | "nombre" | "cantidad", valor: unknown) {
    setCambios((c) => ({ ...c, [clave(id)]: { ...c[clave(id)], [campo]: valor } }));
  }

  /** Lo que lee el PDF: precios y, de paso, los nombres reales de los materiales. */
  function aplicarLectura(precios: Map<string, number>, nombres: Map<string, string>) {
    setCambios((c) => {
      const siguiente = { ...c };
      for (const [id, precio] of precios) {
        siguiente[clave(id)] = {
          ...siguiente[clave(id)],
          precio,
          disponible: true,
          ...(nombres.get(id) ? { nombre: nombres.get(id) } : {}),
        };
      }
      return siguiente;
    });
  }

  /** Cuando el proveedor cotizó todo y no quedó nada fuera. */
  const sinPrecio = lineas.filter((l) => l.disponible && l.precio <= 0).length;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!proveedorId) {
      setError("Elige un proveedor.");
      return;
    }
    if (lineas.some((l) => l.disponible && !(l.cantidad > 0))) {
      setError("Hay un ítem con cantidad cero. Ponle la cantidad, o desmarca «¿Tiene?» si el proveedor no lo tiene.");
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
          corregir: !!corrigiendo,
          validezHasta: previa?.validezHasta ?? null,
          precios: lineas.map((l) => ({
            solpedItemId: l.solpedItemId,
            precioUnitario: l.precio,
            disponible: l.disponible,
            nombre: l.nombre,
            cantidad: l.cantidad,
          })),
        });
      } else {
        await registrarCotizacion({
          cabecera: {
            solped_id: solped.id,
            proveedor_id: proveedorId,
            solicitada_en: solicitadaEn,
            recibida_en: recibidaEn || null,
            plazo_entrega_dias: plazo === "" ? null : plazo,
            condicion_pago: condicion.trim() || null,
            flete,
            descuento,
            estado: recibidaEn ? "recibida" : "solicitada",
          },
          items: lineas.map((l) => ({
            solped_item_id: l.solpedItemId,
            cantidad: l.cantidad,
            precio_unitario: l.disponible ? l.precio : 0,
            disponible: l.disponible,
            nombre_cotizado: l.nombre.trim() || null,
          })),
        });
      }

      /* Los nombres reales de los materiales se quedan en el catálogo: cómo le
         llama ESTE proveedor a cada artículo (con su último precio) y, si el
         artículo aún no tenía nombre técnico, ese pasa a ser con el que se pide
         la próxima vez. Un fallo acá no debe deshacer una cotización ya guardada. */
      if (guardarNombres) {
        for (const l of lineas) {
          const nombre = l.nombre.trim();
          if (!l.articuloId || !l.disponible || l.precio <= 0 || !nombre) continue;
          try {
            await aprenderNombreDelProveedor({
              articuloId: l.articuloId,
              proveedorId,
              nombreProveedor: nombre,
              precio: l.precio,
              fecha: recibidaEn || hoy,
            });
            if (!l.tieneNombreTecnico) await fijarNombreTecnico(l.articuloId, nombre);
          } catch {
            // El catálogo se puede completar después; la cotización ya quedó.
          }
        }
      }

      alGuardado();
      alCerrar();
    } catch (e) {
      setError(mensajeDeNombreCotizado(e instanceof Error ? e.message : String(e)));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
    <Dialogo
      titulo={corrigiendo ? `Editar precios · ${corrigiendo.cotizacion.proveedor}` : "Nueva cotización"}
      descripcion={
        corrigiendo
          ? `${solped.numero} · corrige lo que cargaste; se actualiza esta misma cotización`
          : `${solped.numero} · los precios que te pasó un proveedor`
      }
      abierto
      alCerrar={alCerrar}
      ancho="max-w-4xl"
    >
      <form onSubmit={guardar}>
        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {corrigiendo ? (
              <>
                <Etiqueta>Proveedor</Etiqueta>
                <p className="rounded-xl border border-mist-deep bg-mist/30 px-4 py-2.5 text-sm font-semibold text-ink">
                  {corrigiendo.cotizacion.proveedor}
                </p>
                <Ayuda>
                  Estás corrigiendo la cotización {corrigiendo.cotizacion.numero ?? corrigiendo.cotizacion.id}.
                  {soloFaltantes
                    ? ` Solo se muestran los ítems que faltan por comprar, con la cantidad que falta: lo que ya se compró no se toca. Ponles precio y los que dejes en cero no se guardan.`
                    : nuevosEnCorreccion.length > 0 &&
                      ` Al final van los ${nuevosEnCorreccion.length} ítems que faltan por comprar y no tenía: ponles precio para sumarlos; los que dejes en cero no se guardan.`}
                  {corrigiendo.cotizacion.seleccionada &&
                    " Este proveedor está elegido: si ya generaste la orden de compra, cambiar los precios acá no la modifica; hay que corregirla aparte."}
                </Ayuda>
              </>
            ) : (
            <Combo
              etiqueta="Proveedor"
              requerido
              opciones={opcionesDe(
                [...ordenados, ...ampliables],
                new Map([
                  ...cotizaciones
                    .filter((c) => c.recibidaEn === null)
                    .map((c): [string, string] => [c.proveedorId, `Esperando respuesta · ${c.numero ?? c.id}`]),
                  ...ampliables.map((p): [string, string] => [p.id, "Ya respondió · se agregan los ítems que faltan a su cotización"]),
                ]),
              )}
              valor={proveedorId}
              alCambiar={(id) => {
                const respondida = ampliables.some((p) => p.id === id)
                  ? cotizaciones.find((c) => c.proveedorId === id && c.recibidaEn !== null)
                  : undefined;
                if (respondida && alAmpliar) alAmpliar(respondida);
                else setProveedorId(id);
              }}
              marcador={
                disponibles.length === 0
                  ? "No quedan proveedores por cotizar"
                  : aQuienSePidio.length > 0
                    ? "Los que tienen solicitud enviada salen primero…"
                    : "Escribe para buscar entre los proveedores…"
              }
              ayuda={
                pendiente
                  ? `Responde a la solicitud ${pendiente.numero ?? pendiente.id}: los ${lineas.length - nuevosEnCorreccion.length} ítems que se le pidieron${nuevosEnCorreccion.length > 0 ? `, más ${nuevosEnCorreccion.length} que se agregaron después a la solicitud (al final; los que dejes en cero no se suman)` : ""}. Los precios se cargan sobre ella.`
                  : "Cada proveedor cotiza una vez por solicitud. Si uno que ya respondió puede cotizar lo que falta, elígelo: se abre su cotización con esos ítems."
              }
            />
            )}
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
              alAplicar={({ precios, nombres, condicion, flete: fleteLeido, descuento: dctoLeido }) => {
                aplicarLectura(precios, nombres);
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
                <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="py-2 pr-3">Ítem · nombre como lo cotizó el proveedor</th>
                  <th className="w-32 py-2 pr-3 text-right">Cantidad</th>
                  <th className="w-32 py-2 pr-3 text-right">P. unitario</th>
                  <th className="w-28 py-2 pr-3 text-right">Neto</th>
                  <th className="w-24 py-2">¿Tiene?</th>
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-ink-soft">
                      Elige el proveedor para ver los ítems que se le pidieron.
                    </td>
                  </tr>
                )}
                {lineas.map((l) => (
                  <tr key={l.solpedItemId} className="border-b border-mist last:border-0">
                    <td className="py-2 pr-3 align-top">
                      {/* El nombre que escribe el proveedor es el técnico: es el que
                          va a la orden de compra y al catálogo. Se corrige acá. */}
                      <input
                        value={l.nombre}
                        onChange={(e) => cambiar(l.solpedItemId, "nombre", e.target.value)}
                        aria-label={`Nombre cotizado de ${l.descripcion}`}
                        className={claseCelda}
                      />
                      {l.nombre.trim() !== l.descripcion.trim() && (
                        <span className="mt-1 block text-xs text-ink-soft">Se pidió: {l.descripcion}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      {/* Editable: se pidieron 3 bolsas y se vende por paquetes de 10. */}
                      <div className="flex items-center justify-end gap-1.5 text-ink-soft">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.cantidad}
                          onChange={(e) => cambiar(l.solpedItemId, "cantidad", Number(e.target.value) || 0)}
                          aria-label={`Cantidad de ${l.nombre}`}
                          className={`${claseCelda} w-20 text-right tabular-nums`}
                        />
                        <span className="text-xs">{l.unidad}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <CampoPrecio
                        disabled={!l.disponible}
                        valor={l.precio}
                        alCambiar={(n) => cambiar(l.solpedItemId, "precio", n)}
                        ariaLabel={`Precio unitario de ${l.nombre}`}
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

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={guardarNombres}
              onChange={(e) => setGuardarNombres(e.target.checked)}
              className="mt-0.5 size-4 rounded border-mist-deep accent-cyan"
            />
            <span>
              Guardar estos nombres en el catálogo
              <span className="block text-xs text-ink-soft">
                Queda cómo le llama este proveedor a cada artículo y, si el artículo aún no tenía nombre técnico,
                con ese se pedirá la próxima vez. La orden de compra sale con estos nombres igual.
              </span>
            </span>
          </label>
          {sinPrecio > 0 && lineas.length > 0 && (
            <p className="mt-3 text-xs text-alerta">
              {sinPrecio} {sinPrecio === 1 ? "ítem sigue" : "ítems siguen"} sin precio. Si el proveedor no lo tiene,
              desmarca «¿Tiene?».
            </p>
          )}

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
              type="submit"
              disabled={guardando || !proveedorId}
              className="rounded-full bg-cyan-deep px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:cursor-wait disabled:opacity-70"
            >
              {guardando ? "Guardando…" : corrigiendo ? "Guardar cambios" : "Guardar cotización"}
            </button>
          </div>
        </div>
      </form>
    </Dialogo>
    </>
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
export function LectorDeCotizacion({
  lineas,
  alAplicar,
}: {
  lineas: Linea[];
  alAplicar: (r: {
    precios: Map<string, number>;
    /** Cómo escribió el proveedor cada ítem: son los nombres reales de los materiales. */
    nombres: Map<string, string>;
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

  /* Lo que la persona corrigió a mano: ítem → índice de la línea leída, o -1 si
     ese ítem no lleva ninguna. Manda sobre lo que adivinó el lector. */
  const [manual, setManual] = useState<Record<string, number>>({});

  /* Se compara contra el nombre con que se pidió y también contra el que este
     proveedor ya usó antes: la segunda vez lo reconoce exacto. */
  const items = lineas.flatMap((l) => [
    { id: l.solpedItemId, descripcion: l.descripcion },
    ...(l.nombre.trim() && l.nombre !== l.descripcion ? [{ id: l.solpedItemId, descripcion: l.nombre }] : []),
  ]);
  const resultado = lectura ? emparejar(lectura.filas, items) : null;

  const automatica = new Map<string, number>();
  if (lectura && resultado) {
    for (const [itemId, { fila }] of resultado.asignadas) automatica.set(itemId, lectura.filas.indexOf(fila));
  }
  /** La línea leída que le toca a un ítem: la que eligió la persona o la que calzó sola. */
  const lineaDe = (itemId: string) => manual[itemId] ?? automatica.get(itemId) ?? -1;
  const aplicables = lineas.filter((l) => {
    const i = lineaDe(l.solpedItemId);
    return i >= 0 && lectura?.filas[i]?.precioUnitario != null;
  });

  function nuevaLectura(l: LecturaCotizacion) {
    setManual({});
    setLectura(l);
  }

  /** Cuando el proveedor cotizó en el mismo orden en que se pidió, esto es lo más rápido. */
  function asignarEnOrden() {
    if (!lectura) return;
    const siguiente: Record<string, number> = {};
    lineas.forEach((l, n) => {
      siguiente[l.solpedItemId] = n < lectura.filas.length ? n : -1;
    });
    setManual(siguiente);
  }

  async function leerArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setLeyendo(true);
    try {
      nuevaLectura(await leerCotizacionPdf(archivo));
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
    if (!lectura) return;
    const precios = new Map<string, number>();
    const nombres = new Map<string, string>();
    for (const l of aplicables) {
      const fila = lectura.filas[lineaDe(l.solpedItemId)];
      precios.set(l.solpedItemId, fila.precioUnitario as number);
      if (fila.descripcion.trim()) nombres.set(l.solpedItemId, fila.descripcion.trim());
    }
    alAplicar({
      precios,
      nombres,
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
        onChange={(e) => {
          setPegado(e.target.value);
          // Se lee al pegar, sin tener que salir del cuadro: ver qué entendió es inmediato.
          if (e.target.value.trim()) nuevaLectura(leerCotizacionPegada(e.target.value));
          else setLectura(null);
        }}
        rows={3}
        placeholder={"Descripción\tCantidad\tPrecio\tTotal\nDisco de corte 4½″\t10\t2.400\t24.000"}
        className="mt-3 w-full rounded-lg border border-mist-deep bg-white px-3 py-2 font-mono text-xs text-ink outline-none focus:border-cyan"
      />

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-peligro-suave px-3 py-2 text-xs font-medium text-peligro">
          {error}
        </p>
      )}

      {lectura && (
        <div className="mt-4 border-t border-mist pt-4">
          {lectura.aviso ? (
            <p className="rounded-lg bg-alerta-suave px-3 py-2 text-xs text-alerta">
              {lectura.aviso}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                Leí <strong>{lectura.filas.length}</strong>{" "}
                {lectura.filas.length === 1 ? "línea" : "líneas"} y{" "}
                <strong>{aplicables.length}</strong> de {lineas.length} ítems quedan con precio.
                {lectura.condicion && ` Condición: ${lectura.condicion}.`}
                {lectura.flete !== null && ` Flete: ${formatearPesos(lectura.flete)}.`}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Cada ítem trae elegida la línea que más se le parece. Si alguna está mal, cámbiala en su lista.
              </p>

              <ul className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto text-xs">
                {lineas.map((l) => {
                  const i = lineaDe(l.solpedItemId);
                  const fila = i >= 0 ? lectura.filas[i] : undefined;
                  return (
                    <li
                      key={l.solpedItemId}
                      className="grid items-center gap-2 rounded-lg bg-white px-3 py-2 sm:grid-cols-[1fr_1.4fr_auto]"
                    >
                      <span className="min-w-0 truncate text-ink" title={l.descripcion}>
                        {l.descripcion}
                      </span>
                      <select
                        value={i}
                        onChange={(e) => setManual((m) => ({ ...m, [l.solpedItemId]: Number(e.target.value) }))}
                        aria-label={`Línea de la cotización para ${l.descripcion}`}
                        className="min-w-0 rounded-md border border-mist-deep bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-cyan"
                      >
                        <option value={-1}>— sin precio · lo escribo yo —</option>
                        {lectura.filas.map((f, n) => (
                          <option key={n} value={n}>
                            {f.descripcion.slice(0, 60)} · {f.precioUnitario === null ? "sin precio" : formatearPesosUnitario(f.precioUnitario)}
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-right font-semibold tabular-nums text-ink">
                        {fila?.precioUnitario != null ? formatearPesosUnitario(fila.precioUnitario) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={aplicables.length === 0}
                  className="rounded-full bg-cyan-deep px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-50"
                >
                  Usar estos precios
                </button>
                <button
                  type="button"
                  onClick={asignarEnOrden}
                  className="rounded-full border border-mist-deep px-4 py-2 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                  title="La primera línea leída para el primer ítem, la segunda para el segundo…"
                >
                  Asignar en el mismo orden
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
