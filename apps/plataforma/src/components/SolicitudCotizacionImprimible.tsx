"use client";

import { LogoMark } from "./Logo";
import { FirmaTeoLabs } from "./FirmaTeoLabs";
import { emisorOC } from "@/lib/empresa";
import { formatearFecha, formatearNumero } from "@/lib/formato";
import { formatearRut } from "@/lib/abastecimiento";

/**
 * La solicitud de cotización que se le manda al proveedor.
 *
 * NO ES UN FORMULARIO PARA RELLENAR. Sale como PDF y se manda por correo; el
 * proveedor responde desde su propio sistema, con su propio formato. Por eso no
 * lleva columnas de precio en blanco ni líneas punteadas: dos columnas vacías
 * en un PDF solo hacen parecer que hay que imprimirlo y llenarlo a mano.
 *
 * Y por eso mismo dice poco: qué se necesita, cuánto y para cuándo. No lleva
 * «responder a» ni una lista de lo que la cotización debe traer. Lo primero
 * sobra porque la solicitud sale por correo desde la plataforma y se responde a
 * ese correo; lo segundo, porque la hoja es para que el proveedor sepa QUÉ
 * cotizar, no para enseñarle a cotizar.
 *
 * Toma el encabezado del Excel que Valar ya usa (SOLCOT 000001), pero ese es un
 * documento INTERNO donde abastecimiento anota los precios que averigua. Este se
 * envía: mandarlo con precios escritos sería decirle cuánto se espera pagar
 * antes de que cotice.
 *
 * **Cada proveedor recibe solo sus ítems**: el ferretero no vende EPP, y
 * pedirle a cada uno la lista completa lo obliga a contestar "no tengo" en la
 * mitad.
 *
 * El nombre que se imprime es el TÉCNICO cuando se conoce —"LENTE MAX FENIX IN
 * OUT"—, porque es el único con el que el proveedor sabe qué mandar sin
 * preguntar.
 */

export type ItemSolicitado = {
  linea: number;
  /** El nombre técnico si se conoce; si no, el de faena. */
  descripcion: string;
  especificacion: string | null;
  unidad: string;
  cantidad: number;
  observacion: string | null;
};

export function SolicitudCotizacionImprimible({
  numero,
  proveedor,
  rutProveedor,
  contacto,
  contrato,
  solicitante,
  fechaSolicitud,
  fechaRequerida,
  items,
  observaciones,
}: {
  numero: string;
  proveedor: string;
  rutProveedor: string | null;
  contacto: string | null;
  contrato: string;
  solicitante: string;
  fechaSolicitud: string;
  fechaRequerida: string | null;
  items: ItemSolicitado[];
  observaciones: string | null;
}) {
  return (
    <article className="hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-ink lg:p-12">
      <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-auto text-ink" />
          <div>
            <p className="font-display text-xl font-semibold leading-tight tracking-[0.14em]">
              {emisorOC.razonSocial}
            </p>
            <p className="text-xs text-ink-soft">{emisorOC.rut}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="font-display text-2xl font-semibold">SOLICITUD DE COTIZACIÓN</h1>
          <p className="mt-1 font-mono text-lg font-semibold">{numero}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Bloque titulo="Para">
          <Dato etiqueta="Proveedor" valor={proveedor} />
          <Dato etiqueta="Rut" valor={rutProveedor ? formatearRut(rutProveedor) : null} />
          <Dato etiqueta="Contacto" valor={contacto} />
        </Bloque>

        <Bloque titulo="De">
          <Dato etiqueta="Contrato" valor={contrato} />
          <Dato etiqueta="Solicitante" valor={solicitante} />
        </Bloque>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-2 rounded-lg bg-mist/40 px-4 py-3 text-sm">
        <Dato etiqueta="Fecha de solicitud" valor={formatearFecha(fechaSolicitud)} />
        <Dato
          etiqueta="Se necesita en faena"
          valor={fechaRequerida ? formatearFecha(fechaRequerida) : "Por confirmar"}
        />
      </div>

      <p className="mt-5 text-sm leading-relaxed">
        Estimados: agradeceremos cotizar los ítems que se detallan.
      </p>

      {/* Sin columnas de precio: el PDF se manda por correo y el proveedor
          responde desde SU sistema, no imprimiendo y rellenando a mano. Dos
          columnas en blanco solo hacían parecer que había que llenarlas acá. */}
      <table className="mt-5 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-ink text-left uppercase tracking-[0.08em]">
            <th className="w-10 py-2 font-semibold">Ítem</th>
            <th className="py-2 font-semibold">Descripción</th>
            <th className="w-20 py-2 font-semibold">Unidad</th>
            <th className="w-20 py-2 text-right font-semibold">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.linea} className="border-b border-mist align-top">
              <td className="py-2 font-mono">{String(i.linea).padStart(2, "0")}</td>
              <td className="py-2">
                <span className="block font-semibold">{i.descripcion}</span>
                {i.especificacion && (
                  <span className="block text-ink-soft">{i.especificacion}</span>
                )}
                {/* El nombre de faena NO se imprime cuando ya hay técnico: al
                    proveedor le sirve el suyo, y "(lentes oscuros)" al lado de
                    "LENTE MAX FENIX IN OUT" es ruido que invita a preguntar. */}
                {i.observacion && (
                  <span className="block text-[10px] text-ink-soft">{i.observacion}</span>
                )}
              </td>
              <td className="py-2">{i.unidad}</td>
              <td className="py-2 text-right tabular-nums">{formatearNumero(i.cantidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Nada de «a completar» ni de «responder a».
          La solicitud sale por correo desde la plataforma, así que el proveedor
          responde a ese correo y no hace falta decírselo en la hoja. La lista de
          qué debe traer la cotización se sacó por lo mismo: la hoja es para que
          sepa QUÉ cotizar, no para enseñarle a cotizar. */}
      {observaciones && (
        <div className="mt-6 rounded-lg border border-mist-deep p-3 text-xs">
          <p className="font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Observaciones
          </p>
          <p className="mt-2 leading-relaxed">{observaciones}</p>
        </div>
      )}

      <footer className="mt-10 border-t border-mist pt-4 text-[10px] leading-relaxed text-ink-soft">
        Al responder, mencione el número <strong>{numero}</strong>. La cotización no
        constituye orden de compra: la compra se formaliza únicamente con una orden
        emitida por {emisorOC.razonSocial}.
      </footer>
      {/* La firma va al pie de cada documento que sale de la plataforma. */}
      <div className="mt-8 flex justify-center border-t border-mist pt-3">
        <FirmaTeoLabs />
      </div>
    </article>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 border-b border-mist pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {titulo}
      </p>
      <dl className="flex flex-col gap-1 text-sm">{children}</dl>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-soft">{etiqueta}:</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
