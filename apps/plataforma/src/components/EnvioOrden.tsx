"use client";

import { useEffect, useMemo, useState } from "react";
import { CampoTexto, Dialogo, Pie } from "./ui/Formulario";
import { Chip } from "./ui/Chip";
import { emisorOC } from "@/lib/empresa";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import {
  abrirPdfDeOrden,
  cargarDestinatarios,
  enviarOrdenAlProveedor,
  type Destinatario,
  type EnvioOrden,
  type Orden,
} from "@/lib/ordenes";

/**
 * Mandarle la OC al proveedor: el PDF adjunto y un enlace para que la confirme.
 *
 * Quien la emitió va siempre con copia, y se puede sumar a cualquier persona
 * de Valar; a nadie de afuera (lo vuelve a revisar el servidor). Un borrador
 * no se envía: el botón explica por qué en vez de esconderse.
 */
export function EnvioOrden({
  orden,
  correoProveedor,
  envios,
  alCerrar,
  alEnviada,
}: {
  orden: Orden;
  /** El de la ficha del proveedor, si lo tiene. */
  correoProveedor: string | null;
  /** Los envíos anteriores de esta orden, del más nuevo al más viejo. */
  envios: EnvioOrden[];
  alCerrar: () => void;
  alEnviada: () => void;
}) {
  const borrador = orden.estado === "borrador";
  const anulada = orden.estado === "anulada";

  const [para, setPara] = useState(correoProveedor || orden.correoContacto || "");
  const [asunto, setAsunto] = useState(`Orden de compra ${orden.numero} · ${emisorOC.razonSocial}`);
  const [mensaje, setMensaje] = useState(() => mensajeInicial(orden));
  const [cc, setCc] = useState<string[]>([]);
  const [buscar, setBuscar] = useState("");
  const [personas, setPersonas] = useState<Destinatario[] | null>(null);
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);

  const emisor = (orden.emisorCorreo ?? "").toLowerCase();

  useEffect(() => {
    let vigente = true;
    cargarDestinatarios().then((r) => {
      if (!vigente) return;
      if (r.ok) setPersonas(r.datos);
      else setErrorPersonas(r.error);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const elegibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (personas ?? [])
      .filter((p) => p.correo !== emisor)
      .filter((p) => !q || `${p.nombre} ${p.correo} ${p.cargo}`.toLowerCase().includes(q));
  }, [personas, emisor, buscar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const r = await enviarOrdenAlProveedor(orden.id, { para, cc, asunto, mensaje });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setEnviada(true);
    alEnviada();
  }

  async function verPdf() {
    const fallo = await abrirPdfDeOrden(orden.id);
    if (fallo) setError(fallo);
  }

  if (enviada) {
    return (
      <Dialogo titulo={`Orden ${orden.numero} enviada`} abierto alCerrar={alCerrar} ancho="max-w-lg">
        <div className="px-6 py-6 text-sm text-ink">
          <p className="rounded-xl bg-[#e6f4ee] px-4 py-3 font-medium text-[#0e7a4f]">
            Se le envió a {para}, con copia a {[emisor, ...cc].filter(Boolean).join(", ")}.
          </p>
          <p className="mt-4 text-ink-soft">
            Cuando el proveedor la abra y confirme su fecha de entrega, lo vas a ver en la columna Estado de
            esta lista.
          </p>
        </div>
        <div className="flex justify-end border-t border-mist px-6 py-5">
          <button type="button" onClick={alCerrar} className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-deep">
            Listo
          </button>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      titulo={`Enviar ${orden.numero} al proveedor`}
      descripcion={`${orden.proveedor} · ${formatearPesos(orden.total)} con IVA. Va con el PDF adjunto y un enlace para que la confirme con su fecha de entrega.`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      {borrador || anulada ? (
        <div className="px-6 py-6">
          <p className="rounded-xl bg-[#fdf4e6] px-4 py-3 text-sm text-[#8a5a09]">
            {borrador
              ? "Esta orden está en Borrador, y un borrador nunca se le envía al proveedor. Ábrela con Editar, cámbiala a «Emitida» y vuelve acá."
              : "Esta orden está anulada: no se envía."}
          </p>
          <Historial envios={envios} />
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={alCerrar} className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar}>
          <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <CampoTexto
                etiqueta="Para"
                requerido
                valor={para}
                alCambiar={setPara}
                marcador="ventas@proveedor.cl"
                ayuda="El correo del proveedor. Varios, separados por coma."
                sugerencias={[correoProveedor, orden.correoContacto].filter((c): c is string => !!c)}
              />
            </div>

            <div className="sm:col-span-2">
              <p className="text-sm font-semibold text-ink">Con copia</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {emisor ? (
                  <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white" title="Quien emitió la orden va siempre con copia">
                    {orden.emisorNombre || emisor} · siempre
                  </span>
                ) : null}
                {cc.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCc((x) => x.filter((y) => y !== c))}
                    className="rounded-full border border-cyan px-3 py-1 text-xs font-semibold text-cyan-deep hover:bg-cyan/5"
                    aria-label={`Quitar ${c}`}
                  >
                    {personas?.find((p) => p.correo === c)?.nombre ?? c} ✕
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-mist-deep">
                {(personas?.length ?? 0) > 8 && (
                  <input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar en Valar…"
                    aria-label="Buscar personas de Valar"
                    className="w-full rounded-t-xl border-b border-mist px-3 py-2 text-sm outline-none"
                  />
                )}
                <ul className="max-h-40 overflow-y-auto py-1 text-sm">
                  {personas === null && !errorPersonas && <li className="px-3 py-2 text-ink-soft">Cargando personas de Valar…</li>}
                  {errorPersonas && <li className="px-3 py-2 text-[#a52f24]">{errorPersonas}</li>}
                  {personas && elegibles.length === 0 && <li className="px-3 py-2 text-ink-soft">Nadie más para copiar.</li>}
                  {elegibles.map((p) => (
                    <li key={p.correo}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-mist/40">
                        <input
                          type="checkbox"
                          checked={cc.includes(p.correo)}
                          onChange={(e) =>
                            setCc((x) => (e.target.checked ? [...x, p.correo] : x.filter((y) => y !== p.correo)))
                          }
                          className="h-4 w-4 accent-cyan"
                        />
                        <span className="min-w-0">
                          <span className="font-semibold text-ink">{p.nombre}</span>
                          <span className="ml-2 text-xs text-ink-soft">{p.cargo ? `${p.cargo} · ` : ""}{p.correo}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="sm:col-span-2">
              <CampoTexto etiqueta="Asunto" requerido valor={asunto} alCambiar={setAsunto} />
            </div>

            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-ink">Mensaje</span>
              <textarea
                required
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={9}
                className="mt-1.5 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-sm leading-relaxed text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
              />
              <span className="mt-1.5 block text-xs text-ink-soft">
                Debajo del mensaje va solo el botón «Ver y confirmar la orden». El proveedor responde a{" "}
                {emisor || "quien emitió la orden"}.
              </span>
            </label>

            <div className="sm:col-span-2">
              <button type="button" onClick={verPdf} className="text-sm font-semibold text-cyan-deep hover:underline">
                Ver el PDF que va adjunto →
              </button>
              <Historial envios={envios} />
            </div>
          </div>

          <Pie
            error={error}
            guardando={enviando}
            alCancelar={alCerrar}
            textoGuardar={envios.length ? "Reenviar al proveedor" : "Enviar al proveedor"}
          />
        </form>
      )}
    </Dialogo>
  );
}

function mensajeInicial(o: Orden) {
  return [
    o.contacto ? `Estimado/a ${o.contacto}:` : "Estimados:",
    "",
    `Adjuntamos la orden de compra ${o.numero} de ${emisorOC.razonSocial}, por un total de ${formatearPesos(o.total)} (IVA incluido).`,
    "",
    [
      o.fechaRequerida ? `Requerida para el ${formatearFecha(o.fechaRequerida)}` : null,
      o.lugarEntrega ? `entrega en ${o.lugarEntrega}` : null,
    ]
      .filter(Boolean)
      .join(", ") || null,
    "Les pedimos confirmarla con su fecha de entrega en el enlace de más abajo.",
    "",
    "Saludos,",
    o.emisorNombre ?? "",
    o.emisorTelefono ?? "",
    emisorOC.razonSocial,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Los envíos anteriores y lo que hizo el proveedor con cada uno. */
function Historial({ envios }: { envios: EnvioOrden[] }) {
  if (envios.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Envíos anteriores</p>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {envios.map((e) => (
          <li key={e.id} className="rounded-xl border border-mist-deep px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink">
                {new Date(e.enviadaEn).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })} · a {e.para}
                {e.enviadaPor ? <span className="text-ink-soft"> · por {e.enviadaPor}</span> : null}
              </span>
              <EstadoEnvio envio={e} />
            </div>
            {e.comentario && <p className="mt-1 text-xs text-ink-soft">Proveedor: “{e.comentario}”</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Enviada → Vista → Confirmada, en un chip. Lo usa también la lista. */
export function EstadoEnvio({ envio }: { envio: EnvioOrden }) {
  if (envio.confirmadaEn) {
    return <Chip tono="bueno">Confirmada · entrega {envio.fechaEntrega ? formatearFecha(envio.fechaEntrega) : "—"}</Chip>;
  }
  if (envio.vistaEn) return <Chip tono="info">Vista por el proveedor</Chip>;
  return <Chip tono="aviso">Enviada, sin abrir</Chip>;
}
