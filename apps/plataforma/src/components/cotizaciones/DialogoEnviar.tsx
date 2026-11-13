"use client";

import { mensajeParaPersona } from "@/lib/errores";
import { useEffect, useMemo, useState } from "react";
import { Dialogo } from "../ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import { cargarCotizacion, cargarItemsDeCotizacion, cargarItemsDeSolped, enviarSolicitudAlProveedor, enlaceMailto, registrarEnvio, TOPE_MAILTO, type Cotizacion, type Proveedor, type Solped } from "@/lib/abastecimiento";
import { Impresion } from "../ui/Impresion";
import { SolicitudCotizacionImprimible } from "../SolicitudCotizacionImprimible";
import { formatearFecha, formatearNumero, saludoA } from "@/lib/formato";
import { cargarDestinatarios, type Destinatario } from "@/lib/ordenes";
import { useEmpresa } from "@/lib/empresa-cliente";
import { useUsuario } from "@/lib/sesion";
import { claseCelda, Etiqueta, Ayuda } from "./piezas";

/* ── La solicitud, lista para mandar ──────────────────────────────────────── */

export function VistaSolicitud({
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
              descripcion: c.nombrePedido ?? pedido?.nombreParaPedir ?? "Ítem",

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
 * Manda la solicitud desde la plataforma, con el correo de Valar (cabecera,
 * tabla de ítems, botón para responder), igual que la OC.
 *
 * Todo se puede editar antes de enviar: los destinatarios (varios), el asunto y
 * el mensaje. Quien envía va siempre con copia —así le llega a su casilla— y se
 * puede copiar a más personas de Valar o escribir cualquier otro correo. El
 * proveedor contesta a quien envía, no a la casilla desde la que sale.
 *
 * Los ítems no van dentro del mensaje: los pone el servidor como tabla (y como
 * texto en la versión simple), para que el proveedor cotice respondiendo.
 *
 * «Abrir en mi correo» y «Ya la mandé» quedan como salida para cuando el envío
 * del servidor no esté disponible: nadie se queda sin poder mandar la solicitud
 * por una configuración que no estaba lista.
 */
export function DialogoEnviar({
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
  const usuario = useUsuario();
  const datos = useEmpresa();
  const numero = cotizacion.numero ?? cotizacion.id;

  const [para, setPara] = useState(cotizacion.correoProveedor ?? proveedor?.correo ?? "");
  const [asunto, setAsunto] = useState(
    `Solicitud de cotización ${numero} · ${solped.numero} · ${datos.nombreEnOrdenes}`,
  );
  const [mensaje, setMensaje] = useState(() =>
    mensajeInicialSolicitud({
      contacto: cotizacion.contactoProveedor,
      fechaRequerida: solped.fechaRequerida,
      nombre: usuario.nombre,
      empresa: datos.nombreEnOrdenes,
    }),
  );
  const [cc, setCc] = useState<string[]>([]);
  const [otros, setOtros] = useState("");
  const [buscar, setBuscar] = useState("");
  const [personas, setPersonas] = useState<Destinatario[] | null>(null);
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState<{ para: string[]; cc: string[] } | null>(null);

  const yo = usuario.correo.toLowerCase();

  const { estado } = useConsulta(async () => {
    const [cotizados, pedidos] = await Promise.all([
      cargarItemsDeCotizacion(cotizacion.id),
      cargarItemsDeSolped(solped.id),
    ]);
    return { cotizados, pedidos };
  });

  useEffect(() => {
    let vigente = true;
    cargarDestinatarios("cotizacion").then((r) => {
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
      .filter((p) => p.correo !== yo)
      .filter((p) => !q || `${p.nombre} ${p.correo} ${p.cargo}`.toLowerCase().includes(q));
  }, [personas, yo, buscar]);

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
      descripcion: c.nombrePedido ?? pedido?.nombreParaPedir ?? "Ítem",
      unidad: pedido?.unidad ?? "un",
      cantidad: c.cantidad,
    };
  });

  const copias = [...new Set([...cc, ...otros.split(/[,;\s]+/).map((c) => c.trim().toLowerCase()).filter(Boolean)])];

  /* Para el cliente de correo del computador: el mensaje y el detalle juntos,
     porque un `mailto:` no puede armar la tabla. */
  const cuerpoMailto = [
    mensaje.trim(),
    usuario.nombre,
    datos.nombreEnOrdenes,
    "",
    "Ítems a cotizar:",
    items.map((i) => `${String(i.linea).padStart(2, "0")}. ${i.descripcion} — ${i.cantidad} ${i.unidad}`).join("\n"),
    cotizacion.observaciones ? `\nObservaciones: ${cotizacion.observaciones}` : "",
  ].join("\n");
  const enlace = enlaceMailto(para, asunto, cuerpoMailto);
  const muyLargo = enlace.length > TOPE_MAILTO;

  async function enviarDeVerdad(e: React.FormEvent) {
    e.preventDefault();
    if (!para.trim()) {
      setError("Falta el correo del proveedor.");
      return;
    }
    setError(null);
    setEnviando(true);
    const r = await enviarSolicitudAlProveedor(cotizacion.id, {
      para,
      cc: copias,
      asunto,
      mensaje,
      numero,
      proveedor: cotizacion.proveedor,
      contrato: solped.contrato,
      solicitante: solped.solicitanteNombre,
      fechaRequerida: solped.fechaRequerida,
      observaciones: cotizacion.observaciones,
      items,
    });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setEnviada({ para: r.para, cc: r.cc });
    alEnviada();
  }

  async function marcarEnviada(abrirCliente: boolean) {
    if (!para.trim()) {
      setError("Falta el correo del proveedor.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await registrarEnvio(cotizacion.id, para.trim());
      if (abrirCliente) window.location.href = enlace;
      alEnviada();
    } catch (e) {
      setError(mensajeParaPersona(e, "CotizacionesDeSolped"));
      setEnviando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${asunto}\n\n${cuerpoMailto}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("El navegador no dejó copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  if (enviada) {
    return (
      <Dialogo titulo={`Solicitud ${numero} enviada`} abierto alCerrar={alCerrar} ancho="max-w-lg">
        <div className="px-6 py-6 text-sm text-ink">
          <p className="rounded-xl bg-exito-suave px-4 py-3 font-medium text-exito">
            Se le envió a {enviada.para.join(", ")}
            {enviada.cc.length ? `, con copia a ${enviada.cc.join(", ")}` : ""}.
          </p>
          <p className="mt-4 text-ink-soft">
            El proveedor le contesta a {yo || "quien envió la solicitud"}. Cuando responda, carga sus precios
            con «Cargar precios».
          </p>
        </div>
        <div className="flex justify-end border-t border-mist px-6 py-5">
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-full bg-cyan-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-hondo"
          >
            Listo
          </button>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      titulo={`Enviar ${numero} a ${cotizacion.proveedor}`}
      descripcion={`${items.length} ${items.length === 1 ? "ítem" : "ítems"} a cotizar. Va con el PDF adjunto y un enlace para que el proveedor confirme que la recibió. Todo se puede editar antes de enviar.`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      <form onSubmit={enviarDeVerdad}>
        <div className="grid gap-5 px-6 py-6">
          <label className="block">
            <Etiqueta>Para</Etiqueta>
            <input
              value={para}
              onChange={(e) => setPara(e.target.value)}
              placeholder="ventas@proveedor.cl"
              className={claseCelda}
            />
            <Ayuda>
              {cotizacion.correoProveedor
                ? "Sale de la ficha del proveedor; puedes cambiarlo o agregar más, separados por coma. Si cambió, corrígelo también en Proveedores."
                : "Este proveedor no tiene correo en su ficha: escríbelo acá y agrégalo en Proveedores. Varios, separados por coma."}
            </Ayuda>
          </label>

          <div>
            <Etiqueta>Con copia</Etiqueta>
            <div className="flex flex-wrap gap-1.5">
              <span
                className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                title="Quien envía va siempre con copia"
              >
                {usuario.nombre || yo} · {yo} · siempre
              </span>
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
              <ul className="max-h-36 overflow-y-auto py-1 text-sm">
                {personas === null && !errorPersonas && (
                  <li className="px-3 py-2 text-ink-soft">Cargando personas de Valar…</li>
                )}
                {errorPersonas && <li className="px-3 py-2 text-peligro">{errorPersonas}</li>}
                {personas && elegibles.length === 0 && <li className="px-3 py-2 text-ink-soft">Nadie más de Valar para copiar.</li>}
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
                        <span className="ml-2 text-xs text-ink-soft">
                          {p.cargo ? `${p.cargo} · ` : ""}
                          {p.correo}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <input
              value={otros}
              onChange={(e) => setOtros(e.target.value)}
              placeholder="Otro correo con copia (opcional, varios separados por coma)"
              aria-label="Otros correos con copia"
              className={`${claseCelda} mt-3`}
            />
          </div>

          <label className="block">
            <Etiqueta>Asunto</Etiqueta>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} required className={claseCelda} />
          </label>

          <label className="block">
            <Etiqueta>Mensaje</Etiqueta>
            <textarea
              required
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={9}
              className="w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-cyan"
            />
            <Ayuda>
              Debajo del mensaje el correo trae la tabla con los {items.length}{" "}
              {items.length === 1 ? "ítem" : "ítems"} y el botón «Ver la solicitud y confirmar recepción».
            </Ayuda>
          </label>

          <details className="rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">Ítems que van en el correo</summary>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-ink-soft">
              {items.map((i) => (
                <li key={i.linea}>
                  <span className="text-ink">{i.descripcion}</span> — {formatearNumero(i.cantidad)} {i.unidad}
                </li>
              ))}
            </ol>
          </details>

          {muyLargo && (
            <p className="rounded-xl bg-alerta-suave px-4 py-3 text-sm leading-relaxed text-alerta">
              Si usas <strong>Abrir en mi correo</strong>: el mensaje es largo y algunos clientes de correo lo cortan.
              Mejor usa <strong>Enviar</strong>, que no tiene ese límite.
            </p>
          )}
        </div>

        <div className="border-t border-mist px-6 py-5">
          {error && (
            <p role="alert" className="mb-4 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
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

            {/* Marcar sin enviar: para cuando ya se mandó por fuera y lo que falta
                es que quede la constancia. */}
            <button
              type="button"
              onClick={() => void marcarEnviada(false)}
              disabled={enviando}
              className="rounded-full border border-mist-deep px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              Ya la mandé
            </button>

            <button
              type="button"
              onClick={() => void marcarEnviada(true)}
              disabled={enviando || !para.trim()}
              className="rounded-full border border-mist-deep px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              Abrir en mi correo
            </button>

            <button
              type="submit"
              disabled={enviando || !para.trim()}
              className="rounded-full bg-cyan-deep px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? "Enviando…" : cotizacion.enviadaEn ? "Reenviar" : "Enviar"}
            </button>
          </div>
        </div>
      </form>
    </Dialogo>
  );
}

/** El mensaje con que arranca el correo: lo que sigue —ítems y botón— lo pone el servidor. */
export function mensajeInicialSolicitud(d: {
  contacto: string | null;
  fechaRequerida: string | null;
  nombre: string;
  empresa: string;
}) {
  return [
    saludoA(d.contacto),
    "",
    "Agradeceremos cotizar los ítems que se detallan más abajo.",
    d.fechaRequerida ? `Se necesitan en faena el ${formatearFecha(d.fechaRequerida)}.` : null,
    "",
    // Nombre, área, teléfono y empresa los pone la firma del perfil, debajo del mensaje.
    "Saludos cordiales,",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
