"use client";

import { SelectorAnexo } from "../ui/SelectorAnexo";
import { useEffect, useState } from "react";
import {
  Ancho,
  CampoFecha,
  CampoMes,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Confirmacion,
  Dialogo,
  Pie,
  useFormulario,
} from "../ui/Formulario";
import { claseCelda } from "./LineasDeGasto";
import { categoriasDe, type Categoria } from "@/lib/categorias";
import { eliminar } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import {
  cargarLineasDeCompra,
  costoRendido,
  guardarCompraDirecta,
  siguienteIdReembolso,
  tiposCompra,
  tiposDocumentoRendicion,
  type Compra,
  type TipoCompra,
  type TipoDocumentoRendicion,
} from "@/lib/egresos";
import { formatearPesos } from "@/lib/formato";

/**
 * Un reembolso de gastos: alguien pagó algo del contrato con su plata —una
 * chapa, viajes en taxi— y lo rinde para que se le devuelva.
 *
 * Es costo del contrato igual que una compra, y se guarda como una (0068),
 * marcada como reembolso y con quién rindió. Cada línea es un comprobante de la
 * rendición: se escribe lo que se pagó, y el costo sale solo según el
 * documento —con factura el IVA se recupera y el costo es el neto; con boleta
 * no, y el costo es todo lo pagado—.
 *
 * La foto de la rendición y de las boletas se adjunta al guardar: el respaldo
 * queda colgando del mismo registro, y desde la lista se llega a él.
 */

type Cabecera = {
  contrato_id: string;
  anexo_id: string;
  rendido_por: string;
  documento: string;
  fecha: string;
  periodo_control: string;
  devuelto: boolean;
  fecha_devolucion: string;
};

type LineaRendicion = {
  clave: string;
  fecha: string;
  tipo_documento: TipoDocumentoRendicion;
  documento: string;
  comercio: string;
  descripcion: string;
  categoria_id: string;
  tipo: TipoCompra;
  /** Lo que se pagó, con IVA si lo tenía: lo que dice el comprobante. */
  pagado: number;
};

const hoy = () => new Date().toISOString().slice(0, 10);
const mesActual = () => `${hoy().slice(0, 7)}-01`;

let correlativo = 0;
function lineaVacia(parcial: Partial<LineaRendicion> = {}): LineaRendicion {
  correlativo += 1;
  return {
    clave: `r-${correlativo}`,
    fecha: "",
    tipo_documento: "boleta",
    documento: "",
    comercio: "",
    descripcion: "",
    categoria_id: "",
    tipo: "ordinario",
    pagado: 0,
    ...parcial,
  };
}

function cabeceraDe(compra: Compra | null, contratos: ContratoBreve[]): Cabecera {
  if (!compra) {
    return {
      contrato_id: contratos[0]?.id ?? "",
      anexo_id: "",
      rendido_por: "",
      documento: "",
      fecha: hoy(),
      periodo_control: mesActual(),
      devuelto: false,
      fecha_devolucion: hoy(),
    };
  }
  return {
    contrato_id: compra.contratoId,
    anexo_id: compra.anexoId ?? "",
    rendido_por: compra.rendidoPor ?? compra.proveedor,
    documento: compra.documento ?? "",
    fecha: compra.fecha,
    periodo_control: compra.periodoControl,
    devuelto: compra.estadoPago === "pagada",
    fecha_devolucion: compra.fechaPago ?? hoy(),
  };
}

export function FormularioReembolso({
  compra,
  compras,
  contratos,
  categorias,
  alCerrar,
  alGuardado,
}: {
  compra: Compra | null;
  /** Las que ya existen: el correlativo del código y los nombres de quienes ya rindieron. */
  compras: Compra[];
  contratos: ContratoBreve[];
  categorias: Categoria[];
  alCerrar: () => void;
  /** Con el código del reembolso guardado, para adjuntarle la rendición. */
  alGuardado: (id?: string) => void;
}) {
  const f = useFormulario<Cabecera>(cabeceraDe(compra, contratos));
  const editando = compra !== null;
  const [lineas, setLineas] = useState<LineaRendicion[]>(() => (compra ? [] : [lineaVacia()]));
  const [cargandoLineas, setCargandoLineas] = useState(editando);
  const [confirmando, setConfirmando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  // Al editar se traen sus líneas. Lo pagado es el neto más el IVA que tenía.
  useEffect(() => {
    if (!compra) return;
    let vigente = true;
    cargarLineasDeCompra(compra.id)
      .then((ls) => {
        if (!vigente) return;
        setLineas(ls.map((l) => lineaVacia({
          fecha: l.fecha_documento,
          tipo_documento: l.tipo_documento ?? (l.iva > 0 ? "factura" : "boleta"),
          documento: l.documento,
          comercio: l.comercio,
          descripcion: l.descripcion,
          categoria_id: l.categoria_id,
          tipo: l.tipo,
          pagado: Math.round(l.cantidad * l.precio_unitario) + l.iva,
        })));
      })
      .catch((e) => vigente && f.setError(e instanceof Error ? e.message : String(e)))
      .finally(() => vigente && setCargandoLineas(false));
    return () => {
      vigente = false;
    };
    // Solo al abrir: la compra no cambia mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codigo = editando ? compra.id : siguienteIdReembolso(compras, f.datos.contrato_id, f.datos.periodo_control);
  const propias = categoriasDe(categorias, f.datos.contrato_id, "compras");
  const quienesRindieron = [...new Set(compras.map((c) => c.rendidoPor).filter((x): x is string => Boolean(x)))].sort();

  const conAlgo = lineas.filter((l) => l.descripcion.trim() || l.pagado > 0);
  const pagado = conAlgo.reduce((t, l) => t + l.pagado, 0);
  const costos = conAlgo.map((l) => costoRendido(l.pagado, l.tipo_documento));
  const neto = costos.reduce((t, c) => t + c.neto, 0);
  const iva = costos.reduce((t, c) => t + c.iva, 0);

  const cambiar = (clave: string, cambio: Partial<LineaRendicion>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  /* Cambiar de contrato deja categorías que en el nuevo no existen. Se limpian. */
  function elegirContrato(id: string) {
    f.cambiar("contrato_id", id);
    const delNuevo = new Set(categoriasDe(categorias, id, "compras").map((c) => c.id));
    setLineas((ls) => ls.map((l) => (delNuevo.has(l.categoria_id) ? l : { ...l, categoria_id: "" })));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const persona = f.datos.rendido_por.trim();
    if (!persona) return f.setError("Indica quién rindió el gasto: es a quien se le devuelve.");
    if (conAlgo.length === 0) return f.setError("Agrega al menos un gasto de la rendición.");
    if (conAlgo.some((l) => !l.descripcion.trim())) return f.setError("Cada gasto necesita un detalle (qué se compró o pagó).");
    if (conAlgo.some((l) => l.pagado <= 0)) return f.setError("Cada gasto necesita el monto pagado.");

    f.enviar(
      () =>
        guardarCompraDirecta({
          id: codigo,
          contratoId: f.datos.contrato_id,
          anexoId: f.datos.anexo_id || null,
          proveedorId: "",
          // A quien se le paga es quien rindió: así aparece en Pagos.
          proveedor: persona,
          documento: f.datos.documento.trim() || "Rendición",
          fecha: f.datos.fecha,
          periodoControl: f.datos.periodo_control,
          iva,
          datos: compra?.datos ?? {},
          lineas: conAlgo.map((l, i) => ({
            descripcion: l.descripcion.trim(),
            unidad: "UN",
            cantidad: 1,
            precio_unitario: costos[i].neto,
            categoria_id: l.categoria_id,
            tipo: l.tipo,
            afecto: l.tipo_documento === "factura",
            tipo_documento: l.tipo_documento,
            documento: l.documento.trim(),
            comercio: l.comercio.trim(),
            fecha_documento: l.fecha || null,
          })),
          reembolso: { rendidoPor: persona, devuelto: f.datos.devuelto, fechaDevolucion: f.datos.fecha_devolucion },
        }),
      () => {
        alGuardado(codigo);
        alCerrar();
      },
    );
  }

  async function borrar() {
    setErrorBorrado(null);
    setBorrando(true);
    try {
      await eliminar("compras", compra!.id);
      alGuardado();
      alCerrar();
    } catch (e) {
      setErrorBorrado(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar reembolso" : "Registrar reembolso"}
        descripcion={
          editando
            ? `${compra.id} · cada cambio queda registrado con tu nombre y la hora.`
            : "Un gasto del contrato que alguien pagó de su bolsillo y se le devuelve. Se anota cada boleta o factura de la rendición; al guardar, adjuntas la foto."
        }
        abierto
        alCerrar={alCerrar}
        ancho="max-w-6xl"
      >
        <form onSubmit={onSubmit}>
          <Campos>
            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={opcionesDeContrato(contratos)}
              valor={f.datos.contrato_id}
              alCambiar={elegirContrato}
            />
            <SelectorAnexo contratoId={f.datos.contrato_id} valor={f.datos.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />

            {/* Los nombres que ya rindieron se sugieren, para no escribirlos distinto cada vez. */}
            <CampoTexto
              etiqueta="Rendido por"
              requerido
              marcador="Nombre de quien pagó"
              ayuda="Quien pagó de su bolsillo: a esa persona se le devuelve."
              sugerencias={quienesRindieron}
              {...f.campo("rendido_por")}
            />
            <CampoTexto
              etiqueta="N° de rendición"
              marcador="Opcional"
              ayuda="El número o folio de la rendición, si tiene."
              {...f.campo("documento")}
            />

            <CampoFecha etiqueta="Fecha de la rendición" requerido {...f.campo("fecha")} />
            <CampoMes
              etiqueta="Mes de control"
              requerido
              ayuda="Mes al que se imputa el costo en el Dashboard."
              {...f.campo("periodo_control")}
            />

            <Ancho>
              <div className="flex flex-col gap-3 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={f.datos.devuelto}
                    onChange={(e) => f.cambiar("devuelto", e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-mist-deep accent-cyan"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Ya se le devolvió</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                      Si llega la rendición ya pagada, se marca acá. Si no, queda en Pagos como pendiente de devolver.
                    </span>
                  </span>
                </label>
                {f.datos.devuelto && (
                  <div className="sm:w-56">
                    <CampoFecha etiqueta="Fecha de devolución" {...f.campo("fecha_devolucion")} />
                  </div>
                )}
              </div>
            </Ancho>

            <Ancho>
              <p className="text-xs text-ink-soft">
                Código: <span className="font-mono font-semibold text-ink">{codigo}</span>
                {editando ? " · no se puede cambiar." : " · se arma solo con el contrato y el mes."}
              </p>
            </Ancho>
          </Campos>

          <section className="border-t border-mist px-6 py-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">Gastos de la rendición</h3>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Uno por boleta o factura. Se escribe lo pagado; con factura el costo es el neto, con boleta es todo lo pagado.
                </p>
              </div>
              <button type="button" onClick={() => setLineas((ls) => [...ls, lineaVacia({ fecha: ls.at(-1)?.fecha ?? "", tipo_documento: ls.at(-1)?.tipo_documento ?? "boleta", categoria_id: ls.at(-1)?.categoria_id ?? "" })])}
                className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
                Agregar gasto
              </button>
            </div>

            {cargandoLineas ? (
              <p className="py-6 text-center text-sm text-ink-soft">Cargando los gastos…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                      <th className="w-36 py-2 pr-3">Fecha</th>
                      <th className="w-32 py-2 pr-3">Documento</th>
                      <th className="w-24 py-2 pr-3">N°</th>
                      <th className="w-36 py-2 pr-3">Comercio</th>
                      <th className="py-2 pr-3">Detalle</th>
                      <th className="w-36 py-2 pr-3">Categoría</th>
                      <th className="w-32 py-2 pr-3">Tipo</th>
                      <th className="w-32 py-2 pr-3 text-right">Pagado</th>
                      <th className="w-28 py-2 text-right">Costo</th>
                      <th className="w-10 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.clave} className="border-b border-mist last:border-0">
                        <td className="py-2 pr-3">
                          <input aria-label="Fecha" type="date" value={l.fecha} onChange={(e) => cambiar(l.clave, { fecha: e.target.value })} className={claseCelda} />
                        </td>
                        <td className="py-2 pr-3">
                          <select aria-label="Documento" value={l.tipo_documento}
                            onChange={(e) => cambiar(l.clave, { tipo_documento: e.target.value as TipoDocumentoRendicion })} className={claseCelda}>
                            {tiposDocumentoRendicion.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <input aria-label="N° de documento" value={l.documento} onChange={(e) => cambiar(l.clave, { documento: e.target.value })} className={claseCelda} />
                        </td>
                        <td className="py-2 pr-3">
                          <input aria-label="Comercio" value={l.comercio} placeholder="Ferretería, taxi…" onChange={(e) => cambiar(l.clave, { comercio: e.target.value })} className={claseCelda} />
                        </td>
                        <td className="py-2 pr-3">
                          <input aria-label="Detalle" value={l.descripcion} placeholder="Chapa bodega, taxi a planta…" onChange={(e) => cambiar(l.clave, { descripcion: e.target.value })} className={claseCelda} />
                        </td>
                        <td className="py-2 pr-3">
                          <select aria-label="Categoría" value={l.categoria_id} onChange={(e) => cambiar(l.clave, { categoria_id: e.target.value })} className={claseCelda}>
                            <option value="">— Sin categoría —</option>
                            {propias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <select aria-label="Tipo" value={l.tipo} onChange={(e) => cambiar(l.clave, { tipo: e.target.value as TipoCompra })} className={claseCelda}>
                            {tiposCompra.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <input aria-label="Monto pagado" inputMode="numeric" placeholder="0"
                            value={l.pagado === 0 ? "" : l.pagado.toLocaleString("es-CL")}
                            onChange={(e) => cambiar(l.clave, { pagado: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                            className={`${claseCelda} text-right tabular-nums`} />
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums text-ink">
                          {formatearPesos(costoRendido(l.pagado, l.tipo_documento).neto)}
                        </td>
                        <td className="py-2 text-right">
                          <button type="button" aria-label="Quitar gasto" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                            className="rounded-lg p-1.5 text-ink-soft hover:bg-[#fdeeec] hover:text-[#a52f24]">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <p className="text-ink-soft">Costo para el contrato <span className="ml-2 font-semibold tabular-nums text-ink">{formatearPesos(neto)}</span></p>
              {iva > 0 && <p className="text-ink-soft">IVA recuperable (facturas) <span className="ml-2 tabular-nums">{formatearPesos(iva)}</span></p>}
              <p className="mt-1 rounded-xl border-2 border-ink bg-white px-4 py-2 font-display font-semibold text-ink">
                A devolver a {f.datos.rendido_por.trim() || "quien rindió"} <span className="ml-2 tabular-nums">{formatearPesos(pagado)}</span>
              </p>
            </div>
          </section>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Registrar reembolso"}
            alEliminar={editando ? () => setConfirmando(true) : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={confirmando}
        titulo="Eliminar reembolso"
        detalle={`Se va a eliminar ${compra?.id ?? ""} — rendición de ${compra?.rendidoPor ?? ""}, con sus gastos. El costo del contrato se recalcula sin ella.`}
        error={errorBorrado}
        procesando={borrando}
        alCancelar={() => setConfirmando(false)}
        alConfirmar={borrar}
      />
    </>
  );
}
