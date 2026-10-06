"use client";

import { useEffect, useState } from "react";
import { Chip } from "./ui/Chip";
import { DialogoAdjuntos } from "./ui/Adjuntos";
import { Ancho, CampoDinero, CampoFecha, CampoTexto, Campos, Confirmacion, Dialogo, Pie, useFormulario } from "./ui/Formulario";
import { anularRecepcionConPagnol, informarRecepcionAPagnol, listarPanolesDePagnol } from "@/lib/pagnol/navegador";
import type { PanolPagnol } from "@/lib/pagnol/tipos";
import {
  cargarCiclo,
  cerrable,
  cerrarSaldo,
  facturable,
  registrarFacturaOC,
  registrarNotaCredito,
  registrarRecepcion,
  type CicloOrden as Ciclo,
  type FacturaCiclo,
  type LineaCiclo,
} from "@/lib/ciclo-oc";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";
import type { Orden } from "@/lib/ordenes";
import { usePuede, useUsuario } from "@/lib/sesion";

/**
 * Todo lo que le pasa a una OC después de emitirse, en una sola ventana.
 *
 *   recibir  → cada entrega con su guía. Es lo que habilita la factura.
 *   facturar → qué parte de cada línea cubre la factura. Puede haber varias.
 *   NC       → si facturaron algo que no llegó. Libera el pago retenido.
 *   cerrar   → lo que no llegó ni se facturó y ya no va a llegar.
 *
 * Las reglas las impone la base; esta pantalla propone las cantidades que
 * corresponden en cada caso para que casi nunca haya que teclearlas.
 */

type Modo = "ver" | "recibir" | "facturar" | "nc" | "cerrar";

const hoy = () => new Date().toISOString().slice(0, 10);
const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};
/** "30 días" → 30. Sin número, 30. */
const diasDe = (condicion: string | null) => Number(/\d+/.exec(condicion ?? "")?.[0] ?? 30);

export function CicloOrden({
  orden,
  modoInicial = "ver",
  alCerrar,
  alCambiar,
}: {
  orden: Orden;
  modoInicial?: Modo;
  alCerrar: () => void;
  /** Para que la lista de afuera se relea: el estado y los montos cambiaron. */
  alCambiar: () => void;
}) {
  const { estado, recargar } = useConsulta(() => cargarCiclo(orden.id));
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [adjuntos, setAdjuntos] = useState<{ tabla: string; id: string; titulo: string } | null>(null);
  // Los cuatro siempre, en el mismo orden: son hooks y no se pueden cortar con ||.
  const registraRecepcion = usePuede("recepcion.registrar");
  const cargaGestion = usePuede("gestion.editar");
  const emiteOrdenes = usePuede("ordenes.emitir");
  const puedeRecibir = registraRecepcion || cargaGestion;
  const puedeFacturar = cargaGestion || emiteOrdenes;

  /* Lo que dijo Pagnol al informar una recepción, para mostrarlo arriba al
     volver al resumen. La recepción en Valar queda guardada igual. */
  const [avisoPagnol, setAvisoPagnol] = useState<AvisoPagnol>(null);

  function hecho(aviso?: AvisoPagnol) {
    setAvisoPagnol(aviso ?? null);
    recargar();
    alCambiar();
    setModo("ver");
  }

  if (adjuntos) {
    return (
      <DialogoAdjuntos tabla={adjuntos.tabla} registroId={adjuntos.id} titulo={adjuntos.titulo}
        abierto alCerrar={() => setAdjuntos(null)} />
    );
  }

  const titulos: Record<Modo, string> = {
    ver: `${orden.numero} · ${orden.proveedor}`,
    recibir: `Recepción · ${orden.numero}`,
    facturar: `Factura contra ${orden.numero}`,
    nc: `Nota de crédito · ${orden.numero}`,
    cerrar: `Cerrar saldo · ${orden.numero}`,
  };

  return (
    <Dialogo titulo={titulos[modo]} abierto alCerrar={alCerrar} ancho="max-w-5xl"
      descripcion={modo === "ver" ? "Lo pedido, lo que llegó, lo facturado y lo pagado de esta orden." : undefined}>
      {estado.estado !== "listo" ? (
        <p className="px-6 py-14 text-center text-sm text-ink-soft">
          {estado.estado === "error" ? estado.mensaje : "Cargando la orden…"}
        </p>
      ) : modo === "ver" ? (
        <Resumen orden={orden} ciclo={estado.datos} alModo={setModo} alAdjuntos={setAdjuntos}
          puedeRecibir={puedeRecibir} puedeFacturar={puedeFacturar} alCerrar={alCerrar}
          avisoPagnol={avisoPagnol} alCambio={hecho} />
      ) : modo === "recibir" ? (
        <FormRecepcion orden={orden} ciclo={estado.datos} alVolver={() => setModo("ver")} alHecho={hecho} />
      ) : modo === "facturar" ? (
        <FormFactura orden={orden} ciclo={estado.datos} alVolver={() => setModo("ver")} alHecho={hecho} />
      ) : modo === "nc" ? (
        <FormNotaCredito ciclo={estado.datos} alVolver={() => setModo("ver")} alHecho={hecho} />
      ) : (
        <FormCierre ciclo={estado.datos} alVolver={() => setModo("ver")} alHecho={hecho} />
      )}
    </Dialogo>
  );
}

/* ── El estado de la orden ────────────────────────────────────────────────── */

type AvisoPagnol = { tono: "info" | "aviso"; texto: string } | null;

function Resumen({ orden, ciclo, alModo, alAdjuntos, puedeRecibir, puedeFacturar, alCerrar, avisoPagnol, alCambio }: {
  orden: Orden;
  ciclo: Ciclo;
  alModo: (m: Modo) => void;
  alAdjuntos: (a: { tabla: string; id: string; titulo: string }) => void;
  puedeRecibir: boolean;
  puedeFacturar: boolean;
  alCerrar: () => void;
  avisoPagnol: AvisoPagnol;
  /** Releer todo tras reintentar o anular, con lo que haya que avisar. */
  alCambio: (aviso?: AvisoPagnol) => void;
}) {
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const deLaOrdenEnPagnol = new Set(ciclo.lineas.filter((l) => l.pagnolMaterialId).map((l) => l.id));

  async function reintentar(id: string) {
    setTrabajando(id);
    const r = await informarRecepcionAPagnol(id);
    setTrabajando(null);
    alCambio(avisoDeResumen(r));
  }

  async function anular() {
    if (!anulando) return;
    setTrabajando(anulando);
    setErrorAnular(null);
    const r = await anularRecepcionConPagnol(anulando);
    setTrabajando(null);
    if (!r.ok) return setErrorAnular(r.error);
    setAnulando(null);
    alCambio({ tono: "info", texto: "Recepción anulada. Lo que se había informado a Pagnol quedó revertido." });
  }
  const nombre = new Map(ciclo.lineas.map((l) => [l.id, l.descripcion]));
  const sinRecibir = ciclo.lineas.reduce((t, l) => t + l.sinRecibir * l.precioUnitario, 0);
  const porFacturar = ciclo.lineas.reduce((t, l) => t + l.recibidaSinFacturar * l.precioUnitario, 0);
  const hayPorRecibir = ciclo.lineas.some((l) => l.porRecibir > 0);
  const hayFacturable = ciclo.lineas.some((l) => facturable(l) > 0);
  const hayCerrable = ciclo.lineas.some((l) => cerrable(l) > 0);
  const hayNc = ciclo.lineas.some((l) => l.sinRecibir > 0);

  return (
    <>
      <div className="px-6 pt-5">
        <dl className="grid gap-3 sm:grid-cols-4">
          <Cifra etiqueta="Neto de la orden" valor={orden.neto} nota={orden.acreditado + orden.cerrado > 0 ? "Ya descontado lo acreditado y cerrado" : undefined} />
          <Cifra etiqueta="Recibido" valor={orden.recibido} />
          <Cifra etiqueta="Facturado" valor={orden.facturado} nota={`${orden.facturas} ${orden.facturas === 1 ? "factura" : "facturas"}`} />
          <Cifra etiqueta="Pagado" valor={orden.pagado} />
        </dl>

        <div className="mt-4 flex flex-col gap-2">
          {avisoPagnol && <Aviso tono={avisoPagnol.tono}>{avisoPagnol.texto}</Aviso>}
          {sinRecibir > 0 && (
            <Aviso tono={orden.solicitarNc ? "critico" : "aviso"}>
              {formatearPesos(Math.round(sinRecibir))} facturados que no han llegado. La factura queda retenida hasta que llegue o
              venga la nota de crédito.{orden.solicitarNc && " Ya pasaron 5 días: corresponde solicitar la NC al proveedor."}
            </Aviso>
          )}
          {porFacturar > 0 && (
            <Aviso tono="info">{formatearPesos(Math.round(porFacturar))} recibidos que el proveedor todavía no factura.</Aviso>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto px-6">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
              <th className="py-2 pr-3">Línea</th>
              <th className="py-2 pr-3 text-right">Pedido</th>
              <th className="py-2 pr-3 text-right">Recibido</th>
              <th className="py-2 pr-3 text-right">Facturado</th>
              <th className="py-2 pr-3 text-right">NC</th>
              <th className="py-2 pr-3 text-right">Cerrado</th>
              <th className="py-2 text-right">Neto vigente</th>
            </tr>
          </thead>
          <tbody>
            {ciclo.lineas.map((l) => (
              <tr key={l.id} className="border-b border-mist last:border-0">
                <td className="py-2 pr-3">
                  <span className="block text-ink">{l.descripcion}</span>
                  <span className="text-xs text-ink-soft">{formatearPesos(l.precioUnitario)} / {l.unidad}</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatearNumero(l.pedida)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${l.recibida < l.vigente ? "text-[#8a5a09]" : "text-ink"}`}>{formatearNumero(l.recibida)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${l.sinRecibir > 0 ? "font-semibold text-[#a52f24]" : "text-ink"}`}>{formatearNumero(l.facturadaNeta)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{l.acreditada ? formatearNumero(l.acreditada) : "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{l.cerrada ? formatearNumero(l.cerrada) : "—"}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-ink">{formatearPesos(Math.round(l.vigente * l.precioUnitario))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 border-t border-mist px-6 py-5 md:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Recepciones</h3>
          {ciclo.recepciones.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Todavía no llega nada.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {ciclo.recepciones.map((r) => (
                <li key={r.id} className="rounded-xl border border-mist-deep p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">
                      {formatearFecha(r.fecha)} · {r.guia ? `Guía ${r.guia}` : "Sin guía"}
                    </span>
                    <button type="button" onClick={() => alAdjuntos({ tabla: "recepciones", id: r.id, titulo: `Recepción ${r.guia ?? formatearFecha(r.fecha)}` })}
                      className="shrink-0 text-xs font-semibold text-cyan-deep hover:underline">Respaldo</button>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {r.lineas.map((x) => `${formatearNumero(x.cantidad)} ${nombre.get(x.itemId) ?? x.itemId}`).join(" · ")}
                    {r.recibidoPor && ` — recibió ${r.recibidoPor}`}
                  </p>
                  <EstadoEnPagnol recepcion={r} conPagnol={r.lineas.some((x) => deLaOrdenEnPagnol.has(x.itemId))}
                    trabajando={trabajando === r.id} alReintentar={() => reintentar(r.id)} />
                  {puedeRecibir && (
                    <button type="button" onClick={() => { setErrorAnular(null); setAnulando(r.id); }}
                      className="mt-2 text-xs font-semibold text-[#a52f24] hover:underline">
                      Anular recepción
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Facturas y notas de crédito</h3>
          {ciclo.facturas.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">El proveedor todavía no factura.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {ciclo.facturas.map((f) => (
                <li key={f.id} className="rounded-xl border border-mist-deep p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">
                      Factura {f.documento} · {formatearPesos(f.neto)} neto
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip tono={f.estadoPago === "pagada" ? "bueno" : "neutro"}>{f.estadoPago === "pagada" ? "Pagada" : "Por pagar"}</Chip>
                      <button type="button" onClick={() => alAdjuntos({ tabla: "compras", id: f.id, titulo: `Factura ${f.documento}` })}
                        className="text-xs font-semibold text-cyan-deep hover:underline">PDF</button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {f.fechaFactura && `${formatearFecha(f.fechaFactura)} · `}
                    {f.lineas.map((x) => `${formatearNumero(x.cantidad)} ${nombre.get(x.itemId) ?? x.itemId}`).join(" · ")}
                  </p>
                  {f.notas.map((nc) => (
                    <p key={nc.id} className="mt-1.5 flex items-center justify-between gap-3 rounded-lg bg-mist/40 px-2.5 py-1.5 text-xs text-ink-soft">
                      <span>NC {nc.numero} · −{formatearPesos(nc.neto)} · {nc.lineas.map((x) => `${formatearNumero(x.cantidad)} ${nombre.get(x.itemId) ?? ""}`).join(" · ")}</span>
                      <button type="button" onClick={() => alAdjuntos({ tabla: "notas_credito", id: nc.id, titulo: `NC ${nc.numero}` })}
                        className="shrink-0 font-semibold text-cyan-deep hover:underline">PDF</button>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist px-6 py-5">
        <div className="flex flex-wrap gap-2">
          {puedeRecibir && hayPorRecibir && <Accion destacada onClick={() => alModo("recibir")}>Registrar recepción</Accion>}
          {puedeFacturar && hayFacturable && <Accion onClick={() => alModo("facturar")}>Agregar factura</Accion>}
          {puedeFacturar && hayNc && <Accion onClick={() => alModo("nc")}>Registrar nota de crédito</Accion>}
          {puedeFacturar && hayCerrable && <Accion onClick={() => alModo("cerrar")}>Cerrar saldo</Accion>}
        </div>
        <button type="button" onClick={alCerrar}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
          Cerrar
        </button>
      </div>

      <Confirmacion abierto={anulando !== null} titulo="Anular recepción"
        detalle="Lo recibido deja de contar como llegado en esta orden. Si se informó a Pagnol, primero se revierte allá (el stock que entró y los activos que se crearon). Si Pagnol ya los entregó o movió, no se anula y hay que ajustarlo en Pagnol."
        error={errorAnular} procesando={trabajando !== null} alCancelar={() => setAnulando(null)} alConfirmar={anular} />
    </>
  );
}

/** Lo que se le informó a Pagnol de una recepción, en una línea. */
function EstadoEnPagnol({ recepcion, conPagnol, trabajando, alReintentar }: {
  recepcion: Ciclo["recepciones"][number];
  conPagnol: boolean;
  trabajando: boolean;
  alReintentar: () => void;
}) {
  if (!conPagnol) return null;
  const p = recepcion.pagnol;
  const listo = p !== null && p.total > 0 && p.enviados === p.total && p.errores.length === 0;
  if (listo) {
    return <p className="mt-1.5 text-xs font-semibold text-[#0e7a4f]">Informado a Pagnol ✓ ({p.total} {p.total === 1 ? "registro" : "registros"})</p>;
  }
  return (
    <div className="mt-1.5 rounded-lg bg-[#fdf3e3] px-2.5 py-1.5 text-xs text-[#8a5a09]">
      <span className="font-semibold">{p ? `Pagnol: ${p.enviados} de ${p.total} informados` : "Pagnol: sin informar"}</span>
      {p?.errores.slice(0, 2).map((e) => <span key={e} className="block">{e}</span>)}
      <button type="button" onClick={alReintentar} disabled={trabajando}
        className="mt-1 block font-semibold text-cyan-deep hover:underline disabled:opacity-50">
        {trabajando ? "Informando…" : "Reintentar"}
      </button>
    </div>
  );
}

/** El resultado de informar a Pagnol, como aviso para la pantalla. */
function avisoDeResumen(r: Awaited<ReturnType<typeof informarRecepcionAPagnol>>): AvisoPagnol {
  if (!r.ok) return { tono: "aviso", texto: `La recepción quedó guardada, pero no se pudo informar a Pagnol: ${r.error}` };
  const { total, enviados, errores } = r.resumen;
  if (total === 0 && errores.length === 0) return null;
  if (errores.length === 0 && enviados === total) return { tono: "info", texto: `Informado a Pagnol: ${total} ${total === 1 ? "registro" : "registros"}.` };
  return { tono: "aviso", texto: `Pagnol: ${enviados} de ${total} informados. ${errores.slice(0, 2).join(" · ")} Puedes reintentar desde la recepción.` };
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: number; nota?: string }) {
  return (
    <div className="rounded-xl border border-mist-deep p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{etiqueta}</dt>
      <dd className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">{formatearPesos(valor)}</dd>
      {nota && <dd className="mt-0.5 text-xs text-ink-soft">{nota}</dd>}
    </div>
  );
}

function Aviso({ tono, children }: { tono: "critico" | "aviso" | "info"; children: React.ReactNode }) {
  const clases = {
    critico: "bg-[#fdeeec] text-[#a52f24]",
    aviso: "bg-[#fdf3e3] text-[#8a5a09]",
    info: "bg-cyan/10 text-cyan-deep",
  }[tono];
  return <p className={`rounded-xl px-4 py-2.5 text-sm font-medium ${clases}`}>{children}</p>;
}

function Accion({ onClick, destacada = false, children }: { onClick: () => void; destacada?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={destacada
        ? "rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-deep"
        : "rounded-full border border-cyan px-5 py-2.5 text-sm font-semibold text-cyan-deep hover:bg-cyan/5"}>
      {children}
    </button>
  );
}

/* ── Cantidades por línea, para los cuatro formularios ────────────────────── */

/**
 * La tabla de "cuánto de cada línea". Arranca con lo que corresponde en cada
 * caso —lo que falta por llegar, lo recibido sin facturar…— y deja corregirlo
 * hasta un máximo, que es la misma regla que después revisa la base.
 */
function CantidadesPorLinea({ lineas, cantidades, alCambiar, maximo, columna }: {
  lineas: LineaCiclo[];
  cantidades: Record<string, number>;
  alCambiar: (c: Record<string, number>) => void;
  maximo: (l: LineaCiclo) => number;
  /** El nombre de la columna que se llena: "Llegó", "Factura", "Acredita", "Cierra". */
  columna: string;
}) {
  const visibles = lineas.filter((l) => maximo(l) > 0);
  const neto = visibles.reduce((t, l) => t + (cantidades[l.id] ?? 0) * l.precioUnitario, 0);
  return (
    <Ancho>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
              <th className="py-2 pr-3">Línea</th>
              <th className="py-2 pr-3 text-right">Hasta</th>
              <th className="w-28 py-2 pr-3 text-right">{columna}</th>
              <th className="w-28 py-2 text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <tr key={l.id} className="border-b border-mist last:border-0">
                <td className="py-2 pr-3 text-ink">{l.descripcion}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{formatearNumero(maximo(l))} {l.unidad}</td>
                <td className="py-2 pr-3">
                  <input type="number" min={0} max={maximo(l)} step="any"
                    aria-label={`${columna}: ${l.descripcion}`}
                    value={cantidades[l.id] ?? 0}
                    onChange={(e) => alCambiar({ ...cantidades, [l.id]: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full rounded-lg border border-mist-deep px-2.5 py-1.5 text-right text-sm tabular-nums text-ink focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/20" />
                </td>
                <td className="py-2 text-right tabular-nums text-ink">{formatearPesos(Math.round((cantidades[l.id] ?? 0) * l.precioUnitario))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right text-sm text-ink-soft">
        Neto según la orden: <strong className="tabular-nums text-ink">{formatearPesos(Math.round(neto))}</strong>
      </p>
    </Ancho>
  );
}

function inicialDe(lineas: LineaCiclo[], cuanto: (l: LineaCiclo) => number) {
  return Object.fromEntries(lineas.map((l) => [l.id, cuanto(l)]));
}

/** Lo que se manda a la base, o el error si algo se pasa del máximo. */
function lineasAEnviar(lineas: LineaCiclo[], cantidades: Record<string, number>, maximo: (l: LineaCiclo) => number) {
  const exceso = lineas.find((l) => (cantidades[l.id] ?? 0) > maximo(l) + 1e-9);
  if (exceso) return { error: `«${exceso.descripcion}» admite hasta ${formatearNumero(maximo(exceso))} ${exceso.unidad}.` };
  const filas = lineas
    .filter((l) => (cantidades[l.id] ?? 0) > 0)
    .map((l) => ({ item_id: l.id, cantidad: cantidades[l.id] }));
  if (filas.length === 0) return { error: "Anota la cantidad de al menos una línea." };
  return { filas };
}

const netoDe = (lineas: LineaCiclo[], cantidades: Record<string, number>) =>
  Math.round(lineas.reduce((t, l) => t + (cantidades[l.id] ?? 0) * l.precioUnitario, 0));

/* ── Recepción ────────────────────────────────────────────────────────────── */

function FormRecepcion({ orden, ciclo, alVolver, alHecho }: { orden: Orden; ciclo: Ciclo; alVolver: () => void; alHecho: (aviso?: AvisoPagnol) => void }) {
  const usuario = useUsuario();
  const f = useFormulario({ fecha: hoy(), guia: "", recibidoPor: usuario.nombre, observaciones: "" });
  const [cantidades, setCantidades] = useState(() => inicialDe(ciclo.lineas, (l) => l.porRecibir));
  const maximo = (l: LineaCiclo) => l.porRecibir;

  /* Si alguna línea por recibir es del catálogo de Pagnol, se elige a qué
     pañol entra. Es opcional: sin pañol, entra sin pañol asignado. */
  const conPagnol = ciclo.lineas.some((l) => l.pagnolMaterialId && l.porRecibir > 0);
  const [panoles, setPanoles] = useState<PanolPagnol[] | null>(null);
  const [errorPanoles, setErrorPanoles] = useState<string | null>(null);
  const [panolId, setPanolId] = useState("");
  useEffect(() => {
    if (!conPagnol) return;
    let vigente = true;
    listarPanolesDePagnol().then((r) => {
      if (!vigente) return;
      if (r.ok) setPanoles(r.datos);
      else setErrorPanoles(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [conPagnol]);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const r = lineasAEnviar(ciclo.lineas, cantidades, maximo);
      if (r.error) return f.setError(r.error);
      let aviso: AvisoPagnol = null;
      f.enviar(async () => {
        const id = await registrarRecepcion({ ordenId: orden.id, ...f.datos, lineas: r.filas!, panolId: panolId || null });
        // Pagnol va después: si falla, la recepción en Valar ya quedó y se reintenta.
        const llevaPagnol = r.filas!.some((x) => ciclo.lineas.find((l) => l.id === x.item_id)?.pagnolMaterialId);
        if (llevaPagnol) aviso = avisoDeResumen(await informarRecepcionAPagnol(id));
      }, () => alHecho(aviso));
    }}>
      <Campos>
        <CampoFecha etiqueta="Fecha de llegada" requerido {...f.campo("fecha")} />
        <CampoTexto etiqueta="N° de guía de despacho" ayuda="El respaldo de que llegó. La guía escaneada se adjunta después." {...f.campo("guia")} />
        <CampoTexto etiqueta="Recibió" {...f.campo("recibidoPor")} />
        <CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} />
        {conPagnol && (
          <Ancho>
            <label className="block text-sm font-semibold text-ink" htmlFor="panol-destino">Pañol de destino en Pagnol</label>
            <select id="panol-destino" value={panolId} onChange={(e) => setPanolId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-sm text-ink">
              <option value="">{panoles === null && !errorPanoles ? "Cargando pañoles…" : "Sin pañol asignado"}</option>
              {(panoles ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.ubicacion ? ` · ${p.ubicacion}` : ""}</option>)}
            </select>
            <span className="mt-1.5 block text-xs text-ink-soft">
              {errorPanoles ?? "Las herramientas y equipos se crean en Pagnol como activos, uno por unidad; los consumibles suman a su stock."}
            </span>
          </Ancho>
        )}
        <CantidadesPorLinea lineas={ciclo.lineas} cantidades={cantidades} alCambiar={setCantidades} maximo={maximo} columna="Llegó" />
      </Campos>
      <Pie error={f.error} guardando={f.guardando} alCancelar={alVolver} textoGuardar="Registrar recepción" />
    </form>
  );
}

/* ── Factura ──────────────────────────────────────────────────────────────── */

function FormFactura({ orden, ciclo, alVolver, alHecho }: { orden: Orden; ciclo: Ciclo; alVolver: () => void; alHecho: () => void }) {
  const plazo = diasDe(orden.condicionesPago);
  // Se propone lo que llegó y falta facturar: es lo que el proveedor debería cobrar.
  const [cantidades, setCantidades] = useState(() => inicialDe(ciclo.lineas, (l) => Math.min(l.recibidaSinFacturar, facturable(l))));
  const sugerido = netoDe(ciclo.lineas, cantidades);
  const f = useFormulario({ documento: "", fechaFactura: hoy(), vencimiento: sumarDias(hoy(), plazo), neto: sugerido, iva: Math.round(sugerido * 0.19) });
  const [netoTocado, setNetoTocado] = useState(false);
  const netoLineas = netoDe(ciclo.lineas, cantidades);
  const noLlegado = ciclo.lineas.reduce((t, l) => t + Math.max(0, (cantidades[l.id] ?? 0) - l.recibidaSinFacturar) * l.precioUnitario, 0);

  function cambiarCantidades(c: Record<string, number>) {
    setCantidades(c);
    // Mientras no se escriba el neto a mano, sigue a las líneas.
    if (!netoTocado) {
      const neto = netoDe(ciclo.lineas, c);
      f.setDatos((d) => ({ ...d, neto, iva: Math.round(neto * 0.19) }));
    }
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const r = lineasAEnviar(ciclo.lineas, cantidades, facturable);
      if (r.error) return f.setError(r.error);
      f.enviar(() => registrarFacturaOC({
        ordenId: orden.id, contratoId: orden.contratoId, documento: f.datos.documento,
        fechaFactura: f.datos.fechaFactura, vencimiento: f.datos.vencimiento || null,
        neto: f.datos.neto, iva: f.datos.iva, lineas: r.filas!,
      }).then(() => undefined), alHecho);
    }}>
      <Campos>
        <CampoTexto etiqueta="N° de factura" requerido {...f.campo("documento")} />
        <CampoFecha etiqueta="Fecha de la factura" requerido valor={f.datos.fechaFactura}
          alCambiar={(v) => f.setDatos((d) => ({ ...d, fechaFactura: v, vencimiento: v ? sumarDias(v, plazo) : d.vencimiento }))} />
        <CampoFecha etiqueta="Vence" ayuda={`${plazo} días desde la factura, según la forma de pago de la orden.`} {...f.campo("vencimiento")} />
        <div />
        <CantidadesPorLinea lineas={ciclo.lineas} cantidades={cantidades} alCambiar={cambiarCantidades} maximo={facturable} columna="Factura" />
        {noLlegado > 0 && (
          <Ancho>
            <Aviso tono="aviso">
              Esta factura cobra {formatearPesos(Math.round(noLlegado))} que todavía no llegan. Quedará retenida —no se paga— hasta
              que llegue o venga la nota de crédito.
            </Aviso>
          </Ancho>
        )}
        <CampoDinero etiqueta="Neto de la factura" requerido
          ayuda={f.datos.neto !== netoLineas ? `Según la orden serían ${formatearPesos(netoLineas)}. Se guarda lo que dice la factura.` : "Como dice la factura."}
          valor={f.datos.neto} alCambiar={(v) => { setNetoTocado(true); f.setDatos((d) => ({ ...d, neto: v, iva: Math.round(v * 0.19) })); }} />
        <CampoDinero etiqueta="IVA" {...f.campo("iva")} />
      </Campos>
      <Pie error={f.error} guardando={f.guardando} alCancelar={alVolver} textoGuardar="Registrar factura" />
    </form>
  );
}

/* ── Nota de crédito ──────────────────────────────────────────────────────── */

function FormNotaCredito({ ciclo, alVolver, alHecho }: { ciclo: Ciclo; alVolver: () => void; alHecho: () => void }) {
  const porId = new Map(ciclo.lineas.map((l) => [l.id, l]));
  // Las facturas que cobran algo que no llegó: son las que piden NC.
  const candidatas = ciclo.facturas.filter((fa) => fa.lineas.some((x) => (porId.get(x.itemId)?.sinRecibir ?? 0) > 0));
  const opciones = candidatas.length > 0 ? candidatas : ciclo.facturas;
  const [facturaId, setFacturaId] = useState(opciones[0]?.id ?? "");
  const factura = ciclo.facturas.find((x) => x.id === facturaId) ?? null;

  /* Lo que se puede acreditar de cada línea con ESTA factura: lo que cobró,
     menos lo que sus NC anteriores ya acreditaron. */
  const maximo = (l: LineaCiclo) => maximoNc(factura, l);
  const [cantidades, setCantidades] = useState(() => inicialDe(ciclo.lineas, (l) => Math.min(l.sinRecibir, maximoNc(factura, l))));
  const neto = netoDe(ciclo.lineas, cantidades);
  const f = useFormulario({ numero: "", fecha: hoy(), observaciones: "" });

  function elegir(id: string) {
    setFacturaId(id);
    const fa = ciclo.facturas.find((x) => x.id === id) ?? null;
    setCantidades(inicialDe(ciclo.lineas, (l) => Math.min(l.sinRecibir, maximoNc(fa, l))));
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!factura) return f.setError("Elige la factura que corrige.");
      const r = lineasAEnviar(ciclo.lineas, cantidades, maximo);
      if (r.error) return f.setError(r.error);
      f.enviar(() => registrarNotaCredito({
        compraId: factura.id, numero: f.datos.numero, fecha: f.datos.fecha,
        neto, iva: Math.round(neto * 0.19), observaciones: f.datos.observaciones, lineas: r.filas!,
      }).then(() => undefined), alHecho);
    }}>
      <Campos>
        <Ancho>
          <label className="block text-sm font-semibold text-ink" htmlFor="nc-factura">Factura que corrige</label>
          <select id="nc-factura" value={facturaId} onChange={(e) => elegir(e.target.value)}
            className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-sm text-ink">
            {opciones.map((fa) => <option key={fa.id} value={fa.id}>Factura {fa.documento} · {formatearPesos(fa.neto)} neto</option>)}
          </select>
        </Ancho>
        <CampoTexto etiqueta="N° de nota de crédito" requerido {...f.campo("numero")} />
        <CampoFecha etiqueta="Fecha" requerido {...f.campo("fecha")} />
        <CantidadesPorLinea lineas={ciclo.lineas} cantidades={cantidades} alCambiar={setCantidades} maximo={maximo} columna="Acredita" />
        <Ancho>
          <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
            La NC acredita <strong className="text-ink">{formatearPesos(neto)}</strong> netos más IVA. Se descuenta de lo que se le
            paga al proveedor y deja de ser costo del contrato.
          </p>
        </Ancho>
        <Ancho><CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} /></Ancho>
      </Campos>
      <Pie error={f.error} guardando={f.guardando} alCancelar={alVolver} textoGuardar="Registrar nota de crédito" />
    </form>
  );
}

function maximoNc(factura: FacturaCiclo | null, l: LineaCiclo) {
  if (!factura) return 0;
  const cobrado = factura.lineas.find((x) => x.itemId === l.id)?.cantidad ?? 0;
  const acreditado = factura.notas.reduce((t, nc) => t + (nc.lineas.find((x) => x.itemId === l.id)?.cantidad ?? 0), 0);
  return Math.max(0, cobrado - acreditado);
}

/* ── Cerrar saldo ─────────────────────────────────────────────────────────── */

function FormCierre({ ciclo, alVolver, alHecho }: { ciclo: Ciclo; alVolver: () => void; alHecho: () => void }) {
  const [cantidades, setCantidades] = useState(() => inicialDe(ciclo.lineas, cerrable));
  const f = useFormulario({});
  const neto = netoDe(ciclo.lineas, cantidades);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const r = lineasAEnviar(ciclo.lineas, cantidades, cerrable);
      if (r.error) return f.setError(r.error);
      f.enviar(() => cerrarSaldo(ciclo.lineas.map((linea) => ({ linea, cantidad: cantidades[linea.id] ?? 0 }))), alHecho);
    }}>
      <Campos>
        <Ancho>
          <p className="text-sm leading-relaxed text-ink-soft">
            Lo que no llegó ni se facturó y ya no va a llegar. Al cerrarlo, la orden deja de esperarlo y{" "}
            <strong className="text-ink">{formatearPesos(neto)}</strong> dejan de ser costo del contrato.
          </p>
        </Ancho>
        <CantidadesPorLinea lineas={ciclo.lineas} cantidades={cantidades} alCambiar={setCantidades} maximo={cerrable} columna="Cierra" />
      </Campos>
      <Pie error={f.error} guardando={f.guardando} alCancelar={alVolver} textoGuardar="Cerrar saldo" />
    </form>
  );
}
