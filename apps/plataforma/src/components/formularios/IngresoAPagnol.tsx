"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip } from "../ui/Chip";
import { CampoConPagnol } from "../ui/CampoConPagnol";
import { claseCelda } from "./LineasDeGasto";
import {
  deshacerCompraConPagnol,
  enviosDeCompraEnPagnol,
  informarCompraAPagnol,
  listarPanolesDePagnol,
  type OrigenDeCompra,
} from "@/lib/pagnol/navegador";
import type { EnvioDeCompra, MaterialPagnol, PanolPagnol } from "@/lib/pagnol/tipos";
import { formatearPesos } from "@/lib/formato";

/**
 * Lo que una compra directa le deja a Pagnol (0090).
 *
 * Una compra sin OC es mercadería que ya llegó: EPP, herramientas, materiales.
 * Acá se elige qué material de Pagnol es cada línea y a qué pañol entra. Las
 * herramientas y equipos (rastreables) entran como un activo POR UNIDAD; los
 * consumibles, como stock.
 *
 * Es un paso explícito, aparte de guardar el documento: así corregir una factura
 * no vuelve a mandar nada. Lo informado no se edita; si estuvo mal, se deshace
 * en Pagnol y se informa de nuevo.
 */

export type LineaDelDocumento = { descripcion: string; cantidad: number; precio_unitario: number };

type Fila = {
  clave: string;
  texto: string;
  material: MaterialPagnol | null;
  cantidad: number;
  valor_unitario: number;
};

let correlativo = 0;
const filaVacia = (parcial: Partial<Fila> = {}): Fila => ({
  clave: `p-${++correlativo}`,
  texto: "",
  material: null,
  cantidad: 1,
  valor_unitario: 0,
  ...parcial,
});

export function IngresoAPagnol({
  compraId,
  origen = "compra",
  panolPorNombre,
  lineas,
  alCambiar,
}: {
  /** El id de la compra o, con `origen: "oficina"`, del egreso de Oficina Central. */
  compraId: string;
  origen?: OrigenDeCompra;
  /** Pañol que parte elegido, por nombre ("Oficina Central"). */
  panolPorNombre?: string;
  /** Las líneas del documento: parten como filas para no tener que reescribirlas. */
  lineas: LineaDelDocumento[];
  /** Avisa que algo cambió en Pagnol (para que quien borra la compra lo sepa). */
  alCambiar?: (hayEnviados: boolean) => void;
}) {
  const [panoles, setPanoles] = useState<PanolPagnol[] | null>(null);
  const [errorPanoles, setErrorPanoles] = useState<string | null>(null);
  const [panolId, setPanolId] = useState("");
  const [envios, setEnvios] = useState<EnvioDeCompra[] | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "bueno" | "aviso"; texto: string } | null>(null);

  const refrescar = useCallback(
    (lista: EnvioDeCompra[]) => {
      setEnvios(lista);
      alCambiar?.(lista.some((e) => e.estado === "enviado" && !e.deshecho));
    },
    [alCambiar],
  );

  useEffect(() => {
    let vigente = true;
    listarPanolesDePagnol().then((r) => {
      if (!vigente) return;
      if (r.ok) {
        setPanoles(r.datos);
        const buscado = panolPorNombre?.trim().toLowerCase();
        const elegido = buscado ? r.datos.find((p) => p.nombre.trim().toLowerCase() === buscado) : undefined;
        if (elegido) setPanolId((actual) => actual || elegido.id);
      } else { setPanoles([]); setErrorPanoles(r.error); }
    });
    enviosDeCompraEnPagnol(compraId, origen).then((r) => {
      if (!vigente) return;
      if (r.ok) {
        refrescar(r.envios);
        // Si ya hay algo informado, las filas parten vacías: no se vuelve a ofrecer lo mismo.
        if (r.envios.length === 0) {
          setFilas(
            lineas.filter((l) => l.descripcion.trim()).map((l) => filaVacia({ texto: l.descripcion, cantidad: l.cantidad, valor_unitario: l.precio_unitario })),
          );
        }
      } else {
        setEnvios([]);
        setMensaje({ tono: "aviso", texto: r.error });
      }
    });
    return () => {
      vigente = false;
    };
    // Solo al abrir: el documento no cambia mientras se mira.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compraId]);

  const cambiarFila = (clave: string, parcial: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)));

  const listas = filas.filter((f) => f.material && f.cantidad > 0);
  const hayError = (envios ?? []).some((e) => e.estado !== "enviado" && !e.deshecho);
  const hayEnviados = (envios ?? []).some((e) => e.estado === "enviado" && !e.deshecho);

  async function informar(conLineas: boolean) {
    setTrabajando(true);
    setMensaje(null);
    const r = await informarCompraAPagnol(
      compraId,
      panolId || null,
      conLineas
        ? listas.map((f) => ({ material_id: f.material!.id, cantidad: f.cantidad, valor_unitario: f.valor_unitario, descripcion: f.texto.trim() || f.material!.nombre }))
        : [],
      origen,
    );
    setTrabajando(false);
    if (!r.ok) return setMensaje({ tono: "aviso", texto: r.error });
    refrescar(r.envios);
    if (conLineas) setFilas((fs) => fs.filter((f) => !listas.includes(f)));
    const { total, enviados, errores } = r.resumen;
    setMensaje(
      errores.length === 0 && enviados === total
        ? { tono: "bueno", texto: total === 0 ? "No había nada para informar." : `Informado a Pagnol: ${total} ${total === 1 ? "registro" : "registros"}.` }
        : { tono: "aviso", texto: `Pagnol: ${enviados} de ${total} informados. ${errores.slice(0, 2).join(" · ")} Puedes reintentar.` },
    );
  }

  async function deshacer() {
    setTrabajando(true);
    setMensaje(null);
    const r = await deshacerCompraConPagnol(compraId, origen);
    if (!r.ok) {
      setTrabajando(false);
      return setMensaje({ tono: "aviso", texto: r.error });
    }
    const lista = await enviosDeCompraEnPagnol(compraId, origen);
    setTrabajando(false);
    if (lista.ok) refrescar(lista.envios);
    setMensaje({ tono: "bueno", texto: "Deshecho en Pagnol: el stock se revirtió y los activos quedaron de baja." });
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-mist-deep p-5"
      aria-labelledby="ingreso-pagnol"
      /* Va dentro del formulario de la compra: Enter en el buscador no debe guardarla. */
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <h3 id="ingreso-pagnol" className="font-display text-base font-semibold text-ink">Ingreso a Pagnol</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Si esta compra trae EPP, herramientas o materiales, elige cuál es cada uno en Pagnol y a qué pañol entra.
        Las herramientas y equipos quedan como un activo por unidad; los consumibles suman stock.
      </p>

      {mensaje && (
        <p role="status" className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-medium ${mensaje.tono === "bueno" ? "bg-[#e6f4ee] text-[#0e7a4f]" : "bg-[#fdf4e6] text-[#8a5a09]"}`}>
          {mensaje.texto}
        </p>
      )}

      {envios === null ? (
        <p className="mt-4 text-sm text-ink-soft">Consultando Pagnol…</p>
      ) : (
        <>
          {envios.length > 0 && (
            <ul className="mt-4 divide-y divide-mist rounded-xl border border-mist">
              {envios.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{e.descripcion ?? "Línea"}</span>
                    <span className="block text-xs text-ink-soft">
                      {e.tipo === "activo" ? `Activo · unidad ${e.unidad ?? 1}` : `Stock · ${e.cantidad?.toLocaleString("es-CL") ?? ""}`}
                      {e.error ? ` · ${e.error}` : ""}
                    </span>
                  </span>
                  <Chip tono={e.deshecho ? "neutro" : e.estado === "enviado" ? "bueno" : e.estado === "error" ? "critico" : "aviso"}>
                    {e.deshecho ? "Deshecho" : e.estado === "enviado" ? "En Pagnol" : e.estado === "error" ? "Con error" : "Pendiente"}
                  </Chip>
                </li>
              ))}
            </ul>
          )}

          {(hayError || hayEnviados) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hayError && (
                <button type="button" disabled={trabajando} onClick={() => void informar(false)}
                  className="rounded-full border border-cyan px-4 py-2 text-sm font-semibold text-cyan-deep hover:bg-cyan/5 disabled:opacity-50">
                  Reintentar lo pendiente
                </button>
              )}
              {hayEnviados && (
                <button type="button" disabled={trabajando} onClick={() => void deshacer()}
                  className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink disabled:opacity-50">
                  Deshacer en Pagnol
                </button>
              )}
            </div>
          )}

          <div className="mt-5">
            <label htmlFor="panol-compra" className="block text-sm font-semibold text-ink">Pañol de destino en Pagnol</label>
            <select id="panol-compra" value={panolId} onChange={(e) => setPanolId(e.target.value)} className={`${claseCelda} mt-2`}>
              <option value="">{panoles === null ? "Cargando pañoles…" : "Sin pañol asignado"}</option>
              {(panoles ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.ubicacion ? ` · ${p.ubicacion}` : ""}</option>)}
            </select>
            {errorPanoles && <p className="mt-1 text-xs text-[#8a5a09]">{errorPanoles}</p>}
          </div>

          <div className="mt-4 overflow-x-auto">
            {filas.length > 0 && (
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    <th className="py-2 pr-3">Material en Pagnol</th>
                    <th className="w-24 py-2 pr-3">Cantidad</th>
                    <th className="w-32 py-2 pr-3">Neto c/u</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave} className="border-b border-mist/60 align-top">
                      <td className="py-2 pr-3">
                        <CampoConPagnol
                          ariaLabel="Material en Pagnol"
                          placeholder="Escribe 3 letras para buscar en Pagnol"
                          valor={f.texto}
                          enlazado={f.material ? `${f.material.codigo} · ${f.material.rastreable ? "un activo por unidad" : "suma stock"}` : null}
                          alCambiar={(texto) => cambiarFila(f.clave, { texto, material: null })}
                          alElegir={(m) => cambiarFila(f.clave, { material: m, texto: m.nombre })}
                          className={claseCelda}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input type="number" min={0} step="any" aria-label="Cantidad" value={f.cantidad}
                          onChange={(e) => cambiarFila(f.clave, { cantidad: Number(e.target.value) })} className={claseCelda} />
                      </td>
                      <td className="py-2 pr-3">
                        <input type="number" min={0} aria-label="Neto por unidad" value={f.valor_unitario}
                          onChange={(e) => cambiarFila(f.clave, { valor_unitario: Number(e.target.value) })} className={claseCelda} />
                        {f.valor_unitario > 0 && <span className="mt-0.5 block text-[11px] text-ink-soft">{formatearPesos(f.valor_unitario)}</span>}
                      </td>
                      <td className="py-2">
                        <button type="button" aria-label="Quitar fila" onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                          className="rounded-full px-2 py-1 text-ink-soft hover:text-[#a52f24]">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setFilas((fs) => [...fs, filaVacia()])}
              className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
              Agregar material
            </button>
            <button type="button" disabled={trabajando || listas.length === 0} onClick={() => void informar(true)}
              className="rounded-full bg-cyan px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-deep disabled:opacity-50">
              {trabajando ? "Informando…" : listas.length === 0 ? "Elige un material de Pagnol" : `Informar ${listas.length} ${listas.length === 1 ? "línea" : "líneas"} a Pagnol`}
            </button>
          </div>
          {filas.some((f) => !f.material && f.texto.trim()) && (
            <p className="mt-2 text-xs text-ink-soft">Las filas sin material elegido de la lista de Pagnol no se informan.</p>
          )}
        </>
      )}
    </section>
  );
}
