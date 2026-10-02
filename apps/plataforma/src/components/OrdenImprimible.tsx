"use client";

import { LogoMark } from "./Logo";
import { FirmaTeoLabs } from "./FirmaTeoLabs";
import { emisorOC } from "@/lib/empresa";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";
import type { Item, Orden } from "@/lib/ordenes";

/**
 * La orden de compra lista para imprimir, con el mismo formato que Valar ya
 * usa: emisor a la izquierda, proveedor a la derecha, la tabla de ítems, los
 * totales y las tres firmas.
 *
 * No genera un PDF por su cuenta: usa la impresión del navegador, que sabe
 * hacer PDF y no necesita servidor. Las reglas de `@media print` de
 * `globals.css` esconden el resto de la aplicación y dejan solo esta hoja.
 */
export function OrdenImprimible({ orden, items }: { orden: Orden; items: Item[] }) {
  const neto = items.reduce((t, i) => t + i.neto, 0);
  const iva = items.reduce((t, i) => t + i.iva, 0);

  return (
    <article className="hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-ink lg:p-12">
      {/* Encabezado */}
      <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-auto text-ink" />
          <div>
            <p className="font-display text-xl font-semibold leading-tight tracking-[0.14em]">
              {emisorOC.razonSocial}
            </p>
            <p className="text-xs text-ink-soft">{empresaRut()}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="font-display text-2xl font-semibold">ORDEN DE COMPRA</h1>
          <p className="mt-1 font-mono text-lg font-semibold">{orden.numero}</p>
        </div>
      </header>

      {/* Emisor y proveedor, uno al lado del otro */}
      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Bloque titulo="Emite">
          <Dato etiqueta="Rut" valor={emisorOC.rut} />
          <Dato etiqueta="Dirección" valor={emisorOC.direccion} />
          <Dato etiqueta="Ciudad" valor={`${emisorOC.ciudad}, ${emisorOC.region}`} />
          <Dato etiqueta="Contacto" valor={orden.emisorNombre} />
          <Dato etiqueta="Correo" valor={orden.emisorCorreo} />
          <Dato etiqueta="Teléfono" valor={orden.emisorTelefono} />
        </Bloque>

        <Bloque titulo="Proveedor">
          <Dato etiqueta="Razón social" valor={orden.proveedor} />
          <Dato etiqueta="Rut" valor={orden.rutProveedor} />
          <Dato etiqueta="Dirección" valor={orden.direccionProveedor} />
          <Dato
            etiqueta="Ciudad"
            valor={[orden.ciudadProveedor, orden.comunaProveedor].filter(Boolean).join(", ")}
          />
          <Dato etiqueta="Contacto" valor={orden.contacto} />
          <Dato etiqueta="Correo" valor={orden.correoContacto} />
          <Dato etiqueta="Teléfono" valor={orden.telefonoContacto} />
        </Bloque>
      </div>

      {/* Condiciones */}
      <div className="mt-6 grid grid-cols-2 gap-4 border-y border-mist-deep py-4 sm:grid-cols-4">
        <Dato etiqueta="Fecha" valor={formatearFecha(orden.fechaEmision)} destacado />
        <Dato etiqueta="Forma de pago" valor={orden.condicionesPago} destacado />
        <Dato etiqueta="Requerida para" valor={formatearFecha(orden.fechaRequerida)} destacado />
        <Dato etiqueta="Lugar de entrega" valor={orden.lugarEntrega} destacado />
      </div>

      {/* Ítems */}
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-[11px] font-semibold uppercase tracking-[0.1em]">
            <th className="w-10 py-2">Ítem</th>
            <th className="py-2">Descripción</th>
            <th className="w-14 py-2">UM</th>
            <th className="w-20 py-2 text-right">Cantidad</th>
            <th className="w-28 py-2 text-right">P. unitario</th>
            <th className="w-32 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.id} className="border-b border-mist align-top">
              <td className="py-2.5 tabular-nums">{n + 1}</td>
              <td className="py-2.5 pr-4">
                {i.descripcion}
                {/* La marca de reembolsable va impresa: el proveedor no la
                    necesita, pero quien recibe la mercadería sí. */}
                {i.tipo === "reembolsable" && (
                  <span className="ml-2 rounded border border-mist-deep px-1.5 py-0.5 text-[10px] uppercase text-ink-soft">
                    Reembolsable
                  </span>
                )}
              </td>
              <td className="py-2.5">{i.unidad}</td>
              <td className="py-2.5 text-right tabular-nums">{formatearNumero(i.cantidad)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatearPesos(i.precioUnitario)}</td>
              <td className="py-2.5 text-right font-semibold tabular-nums">
                {formatearPesos(i.neto)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-ink-soft">
                Esta orden todavía no tiene ítems.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totales y proyecto */}
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div className="text-sm">
          <Dato etiqueta="Proyecto / Contrato" valor={orden.proyecto ?? orden.contratoId} />
          <Dato etiqueta="Estado" valor={orden.estado.toUpperCase()} />
        </div>

        <dl className="w-full max-w-xs text-sm">
          <Linea etiqueta="Subtotal neto" valor={formatearPesos(neto)} />
          <Linea etiqueta="IVA 19%" valor={formatearPesos(iva)} />
          <div className="mt-2 flex justify-between border-t-2 border-ink pt-2">
            <dt className="font-display font-semibold">TOTAL</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">
              {formatearPesos(neto + iva)}
            </dd>
          </div>
        </dl>
      </div>

      {orden.observaciones && (
        <div className="mt-6 border-t border-mist-deep pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Observaciones
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">
            {orden.observaciones}
          </p>
        </div>
      )}

      {/* Firmas */}
      <div className="mt-12 grid grid-cols-3 gap-6 text-center text-xs">
        {[
          ["Solicitado por", orden.solicitadoPor],
          ["Retira", orden.retira],
          // Fijo: es el representante legal, no cambia por orden.
          ["Autorizado por", emisorOC.autorizadoPor],
        ].map(([etiqueta, nombre]) => (
          <div key={etiqueta as string}>
            <div className="mx-auto h-12" />
            <p className="border-t border-ink pt-2 font-semibold">{nombre || "—"}</p>
            <p className="mt-0.5 text-ink-soft">{etiqueta}</p>
          </div>
        ))}
      </div>
      {/* La firma va al pie de cada documento que sale de la plataforma. */}
      <div className="mt-8 flex justify-center border-t border-mist pt-3">
        <FirmaTeoLabs />
      </div>
    </article>
  );
}

function empresaRut() {
  return `RUT ${emisorOC.rut}`;
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 border-b border-mist-deep pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {titulo}
      </h2>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor?: string | null;
  destacado?: boolean;
}) {
  return (
    <div className={destacado ? "" : "flex gap-2 text-sm"}>
      <dt
        className={
          destacado
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft"
            : "w-24 shrink-0 text-ink-soft"
        }
      >
        {etiqueta}
      </dt>
      <dd className={destacado ? "mt-0.5 text-sm font-semibold" : "min-w-0 flex-1"}>
        {valor || "—"}
      </dd>
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between py-1">
      <dt className="text-ink-soft">{etiqueta}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
