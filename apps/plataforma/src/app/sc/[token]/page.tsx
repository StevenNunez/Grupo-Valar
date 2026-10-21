import type { Metadata } from "next";
import { FirmaTeoLabs } from "@/components/FirmaTeoLabs";
import { LogoMark } from "@/components/Logo";
import { DATOS_POR_DEFECTO, type DatosEmpresa } from "@/lib/empresa";
import { formatearFecha } from "@/lib/formato";
import { abrirEnlaceSolicitud } from "@/lib/oc-envio/publico-solicitud";
import { RecibirSolicitud } from "./RecibirSolicitud";

/**
 * La solicitud de cotización vista por el PROVEEDOR, desde el enlace del
 * correo. Sin cuenta: el enlace es la llave, privado y con vencimiento. Muestra
 * lo que necesita para cotizar, el PDF y el botón «Recibí la solicitud». Nada
 * interno de Valar. Lo que ve sale de la foto guardada al enviar.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solicitud de cotización",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PaginaSolicitudProveedor({ params }: Props) {
  const { token } = await params;
  const r = await abrirEnlaceSolicitud(token, { contarVista: true });

  if (r.estado !== "ok") {
    const mensaje = {
      invalido: "Este enlace no es válido. Revisa que lo hayas copiado completo.",
      vencido: "Este enlace ya venció. Pídele a quien te envió la solicitud que te la reenvíe.",
    }[r.estado];
    return (
      <Marco>
        <div className="rounded-2xl border border-mist-deep bg-white p-10 text-center">
          <p className="font-display text-lg font-semibold text-ink">Solicitud de cotización</p>
          <p className="mt-2 text-sm text-ink-soft">{mensaje}</p>
        </div>
      </Marco>
    );
  }

  const { contenido: c, envio } = r;

  return (
    <Marco empresa={c.empresa ?? DATOS_POR_DEFECTO}>
      <article className="rounded-2xl border border-mist-deep bg-white">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-mist px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Solicitud de cotización</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{c.numero}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Para <strong className="text-ink">{c.proveedor}</strong> · {formatearFecha(c.fecha)}
            </p>
          </div>
          <a
            href={`/sc/${token}/pdf/`}
            className="inline-flex items-center gap-2 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Descargar PDF
          </a>
        </header>

        <dl className="grid gap-4 border-b border-mist px-6 py-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {c.solped && <Dato etiqueta="Requerimiento">{c.solped}</Dato>}
          <Dato etiqueta="Se necesita para">{c.fechaRequerida ? formatearFecha(c.fechaRequerida) : "—"}</Dato>
          <Dato etiqueta="Solicita">{c.solicitante || "—"}</Dato>
          <Dato etiqueta="Contacto Valar">
            {c.emisorNombre || "—"}
            {c.emisorCorreo && <span className="block text-xs text-ink-soft">{c.emisorCorreo}</span>}
          </Dato>
        </dl>

        <div className="overflow-x-auto px-6 py-4">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {c.items.map((i) => (
                <tr key={i.linea} className="border-b border-mist last:border-0">
                  <td className="py-2 pr-3 text-ink-soft">{i.linea}</td>
                  <td className="py-2 pr-3 text-ink">{i.descripcion}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {i.cantidad.toLocaleString("es-CL", { maximumFractionDigits: 3 })} {i.unidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.observaciones && (
            <p className="mt-4 whitespace-pre-line rounded-xl bg-mist/40 px-4 py-3 text-sm text-ink">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Observaciones</span>
              {c.observaciones}
            </p>
          )}
        </div>

        <section className="border-t border-mist px-6 py-6">
          <RecibirSolicitud
            token={token}
            recibida={
              envio.recibidaEn
                ? { en: envio.recibidaEn, por: envio.recibidaPor ?? "", comentario: envio.comentario }
                : null
            }
          />
        </section>
      </article>
    </Marco>
  );
}

function Marco({ children, empresa = DATOS_POR_DEFECTO }: { children: React.ReactNode; empresa?: DatosEmpresa }) {
  return (
    <main className="min-h-svh bg-mist/40 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-8 w-auto text-ink" />
          <div>
            <p className="font-display text-base font-semibold tracking-[0.14em] text-ink">{empresa.nombreEnOrdenes}</p>
            <p className="text-xs text-ink-soft">
              RUT {empresa.rut} · {empresa.direccion}, {empresa.ciudad}
            </p>
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
