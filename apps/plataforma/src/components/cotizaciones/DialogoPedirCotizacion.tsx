"use client";

import { mensajeParaPersona } from "@/lib/errores";
import { useState } from "react";
import { Combo } from "../ui/Combo";
import { Dialogo } from "../ui/Formulario";
import { pedirCotizacion, siguienteNumeroSolicitud, type ItemSolped, type AvanceItem, type Cotizacion, type Proveedor, type Solped } from "@/lib/abastecimiento";
import { claseCelda, opcionesDe, Etiqueta, Ayuda } from "./piezas";

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
export function DialogoPedirCotizacion({
  solped,
  items: todos,
  avance,
  proveedores,
  cotizaciones,
  alCerrar,
  alPedida,
}: {
  solped: Solped;
  items: ItemSolped[];
  /** Lo comprado hasta ahora: de ahí sale lo que falta pedir. */
  avance: AvanceItem[];
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  alCerrar: () => void;
  alPedida: (cotizacionId: string) => void;
}) {
  /* Si ya se compró parte de la solicitud, solo se ofrece lo que falta y por la
     cantidad que falta. Si no falta nada (o nada se ha comprado), todo. */
  const pendientes = new Map(avance.filter((a) => a.cantidadPendiente > 0).map((a) => [a.id, a.cantidadPendiente]));
  const hayCompra = avance.some((a) => a.cantidadComprada > 0);
  const items = hayCompra && pendientes.size > 0 ? todos.filter((i) => pendientes.has(i.id)) : todos;
  const cantidadBase = (i: ItemSolped) => (hayCompra ? pendientes.get(i.id) : undefined) ?? i.cantidad;
  const yaPedidos = cotizaciones.map((c) => c.proveedorId);
  const disponibles = proveedores.filter(
    (p) => !yaPedidos.includes(p.id) && p.estado !== "inactivo",
  );

  const [proveedorId, setProveedorId] = useState(disponibles[0]?.id ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)),
  );
  /* Cantidad a pedirle a este proveedor cuando difiere de la de faena. */
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  /* Nombre con el que se le pide a ESTE proveedor, cuando se corrige. La solicitud de faena no cambia. */
  const [nombres, setNombres] = useState<Record<string, string>>({});
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
          .map((i) => {
            const escrito = (nombres[i.id] ?? i.nombreParaPedir).trim();
            return {
              solpedItemId: i.id,
              cantidad: cantidades[i.id] || cantidadBase(i),
              // Solo se guarda si cambió: lo demás sale con el nombre de siempre.
              nombrePedido: escrito && escrito !== i.nombreParaPedir ? escrito : null,
            };
          }),
        observaciones: observaciones.trim() || null,
      });
      alPedida(id);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(/nombre_pedido/.test(m) ? "Falta aplicar la migración 0108 en la base." : mensajeParaPersona(e, "pedir cotización"));
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
                {/* El nombre con el que se le va a pedir a este proveedor: se puede
                    corregir acá sin tocar lo que pidió faena. */}
                <input
                  value={nombres[i.id] ?? i.nombreParaPedir}
                  onChange={(e) => setNombres((n) => ({ ...n, [i.id]: e.target.value }))}
                  aria-label={`Nombre con que se pide: ${i.descripcion}`}
                  className="w-full rounded-md border border-mist-deep bg-white px-2 py-1 text-sm text-ink outline-none hover:border-ink/40 focus:border-cyan"
                />
                {(nombres[i.id] ?? i.nombreParaPedir).trim() !== i.descripcion.trim() && (
                  <span className="block px-1.5 text-xs text-ink-soft">
                    faena lo pidió como «{i.descripcion}»
                  </span>
                )}
              </span>
              {/* Se le puede pedir otra cantidad que la de faena: si lo vende por
                  paquetes de 10 y faena pidió 3, se le piden 10. */}
              <span className="flex shrink-0 items-center gap-1.5 text-ink-soft">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={cantidades[i.id] ?? cantidadBase(i)}
                  onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: Number(e.target.value) || 0 }))}
                  aria-label={`Cantidad a pedir de ${nombres[i.id] ?? i.nombreParaPedir}`}
                  className="w-20 rounded-md border border-mist-deep bg-white px-2 py-1 text-right text-sm tabular-nums text-ink outline-none focus:border-cyan"
                />
                {i.unidad}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">
          Puedes corregir el nombre (toca el texto) y la cantidad si el proveedor lo vende en otra presentación
          (paquetes, cajas). Solo cambia lo que se le pide a este proveedor: faena sigue viendo lo que pidió.
        </p>

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
            onClick={() => void pedir()}
            disabled={guardando || !proveedorId || elegidos.size === 0}
            className="rounded-full bg-cyan-deep px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:cursor-not-allowed disabled:opacity-60"
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
