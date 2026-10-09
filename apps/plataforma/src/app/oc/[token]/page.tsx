import type { Metadata } from "next";
import { FirmaTeoLabs } from "@/components/FirmaTeoLabs";
import { LogoMark } from "@/components/Logo";
import { emisorOC } from "@/lib/empresa";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { abrirEnlace } from "@/lib/oc-envio/publico";
import { ConfirmarOrden } from "./ConfirmarOrden";

/**
 * La orden de compra vista por el PROVEEDOR, desde el enlace del correo.
 *
 * No pide cuenta: el enlace es la llave, privado y con vencimiento. Muestra lo
 * que el proveedor necesita para despachar —qué, cuánto, dónde y para
 * cuándo—, el PDF y el botón para confirmar con su fecha de entrega. No
 * muestra nada interno de Valar (contratos, márgenes, otras órdenes).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orden de compra",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PaginaOrdenProveedor({ params }: Props) {
  const { token } = await params;
  const r = await abrirEnlace(token, { contarVista: true });

  if (r.estado !== "ok") {
    const mensaje = {
      invalido: "Este enlace no es válido. Revisa que lo hayas copiado completo.",
      vencido: "Este enlace ya venció. Pídele a quien te envió la orden que te la reenvíe.",
      anulada: "Esta orden de compra fue anulada. No hay que despacharla.",
    }[r.estado];
    return (
      <Marco>
        <div className="rounded-2xl border border-mist-deep bg-white p-10 text-center">
          <p className="font-display text-lg font-semibold text-ink">Orden de compra</p>
          <p className="mt-2 text-sm text-ink-soft">{mensaje}</p>
        </div>
      </Marco>
    );
  }

  const { orden: o, envio } = r;
  const neto = o.items.reduce((t, i) => t + i.neto, 0);
  const iva = o.items.reduce((t, i) => t + i.iva, 0);

  return (
    <Marco>
      <article className="rounded-2xl border border-mist-deep bg-white">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-mist px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Orden de compra</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{o.numero}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Para <strong className="text-ink">{o.proveedor}</strong> · emitida el {formatearFecha(o.fechaEmision)}
            </p>
          </div>
          <a
            href={`/oc/${token}/pdf/`}
            className="inline-flex items-center gap-2 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Descargar PDF
          </a>
        </header>

        <dl className="grid gap-4 border-b border-mist px-6 py-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Requerida para">{formatearFecha(o.fechaRequerida)}</Dato>
          <Dato etiqueta="Lugar de entrega">{o.lugarEntrega || "—"}</Dato>
          <Dato etiqueta="Forma de pago">{o.condicionesPago || "—"}</Dato>
          <Dato etiqueta="Contacto Valar">
            {o.emisorNombre || "—"}
            {o.emisorCorreo && <span className="block text-xs text-ink-soft">{o.emisorCorreo}</span>}
            {o.emisorTelefono && <span className="block text-xs text-ink-soft">{o.emisorTelefono}</span>}
          </Dato>
        </dl>

        <div className="overflow-x-auto px-6 py-4">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">UM</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3 text-right">P. unitario</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((i, n) => (
                <tr key={n} className="border-b border-mist last:border-0">
                  <td className="py-2 pr-3 text-ink">{i.descripcion}</td>
                  <td className="py-2 pr-3 text-ink-soft">{i.unidad}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{i.cantidad.toLocaleString("es-CL")}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatearPesos(i.precioUnitario)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatearPesos(i.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <p className="text-ink-soft">Neto <span className="ml-2 tabular-nums text-ink">{formatearPesos(neto)}</span></p>
            <p className="text-ink-soft">IVA 19% <span className="ml-2 tabular-nums">{formatearPesos(iva)}</span></p>
            <p className="font-display text-lg font-semibold text-ink">Total {formatearPesos(neto + iva)}</p>
          </div>
          {o.observaciones && (
            <p className="mt-4 whitespace-pre-line rounded-xl bg-mist/40 px-4 py-3 text-sm text-ink">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Observaciones</span>
              {o.observaciones}
            </p>
          )}
        </div>

        <section className="border-t border-mist px-6 py-6">
          <ConfirmarOrden
            token={token}
            fechaEmision={o.fechaEmision}
            fechaRequerida={o.fechaRequerida}
            confirmada={
              envio.confirmadaEn
                ? { en: envio.confirmadaEn, por: envio.confirmadaPor ?? "", fechaEntrega: envio.fechaEntrega ?? "", comentario: envio.comentario }
                : null
            }
          />
        </section>
      </article>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-mist/40 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-8 w-auto text-ink" />
          <div>
            <p className="font-display text-base font-semibold tracking-[0.14em] text-ink">{emisorOC.razonSocial}</p>
            <p className="text-xs text-ink-soft">RUT {emisorOC.rut} · {emisorOC.direccion}, {emisorOC.ciudad}</p>
          </div>
        </div>
        {children}
        <footer className="mt-8 flex justify-center">
          <FirmaTeoLabs />
        </footer>
      </div>
    </main>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">{etiqueta}</dt>
      <dd className="mt-1 font-semibold text-ink">{children}</dd>
    </div>
  );
}
