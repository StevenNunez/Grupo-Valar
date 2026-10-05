"use client";

import { useEffect, useState } from "react";
import {
  Ancho,
  CampoDinero,
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
import { Combo } from "../ui/Combo";
import { CamposDelContrato } from "../ui/CamposDelContrato";
import { FormularioProveedor } from "./FormularioProveedor";
import { LineasDeGasto, lineaVacia, netoLinea, type LineaGasto } from "./LineasDeGasto";
import { formatearRut, siguienteIdProveedor, type Proveedor } from "@/lib/abastecimiento";
import type { CampoContrato, Datos } from "@/lib/campos";
import { categoriasDe, type Categoria } from "@/lib/categorias";
import { eliminar } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { cargarLineasDeCompra, guardarCompraDirecta, siguienteIdCompra, type Compra } from "@/lib/egresos";
import { formatearPesos } from "@/lib/formato";

/**
 * Una compra directa de Control de Gestión: el documento y sus líneas.
 *
 * Una factura de ferretería trae varias líneas con categorías distintas y a
 * veces alguna reembolsable; antes había que crear una compra por línea
 * repitiendo proveedor, documento y fecha. Ahora el documento lleva su detalle
 * (migración 0053) y el costo sale por línea.
 *
 * Es la compra SIN orden de compra, al contado: no espera recepción, así que
 * queda pagable de inmediato. La factura de una OC se registra y se edita en el
 * ciclo de la orden.
 *
 * Una compra tiene fecha documental y mes de control. Normalmente coinciden;
 * si una factura de agosto se imputa en septiembre, ambos datos quedan visibles
 * y el Dashboard usa el mes de control sin alterar la fecha del comprobante.
 */

const mesActual = () => `${new Date().toISOString().slice(0, 7)}-01`;
const hoy = () => new Date().toISOString().slice(0, 10);

type Cabecera = {
  contrato_id: string;
  proveedor_id: string;
  proveedor: string;
  documento: string;
  fecha: string;
  periodo_control: string;
  iva: number;
};

function cabeceraDe(compra: Compra | null, contratos: ContratoBreve[]): Cabecera {
  if (!compra) {
    return {
      contrato_id: contratos[0]?.id ?? "",
      proveedor_id: "",
      proveedor: "",
      documento: "",
      fecha: hoy(),
      periodo_control: mesActual(),
      iva: 0,
    };
  }
  return {
    contrato_id: compra.contratoId,
    proveedor_id: compra.proveedorId ?? "",
    proveedor: compra.proveedor,
    documento: compra.documento ?? "",
    fecha: compra.fecha,
    periodo_control: compra.periodoControl,
    iva: compra.iva,
  };
}

export function FormularioCompra({
  compra,
  compras,
  contratos,
  campos,
  proveedores,
  categorias,
  alCerrar,
  alGuardado,
}: {
  compra: Compra | null;
  /** Las que ya existen: de ahí sale el correlativo del código. */
  compras: Compra[];
  contratos: ContratoBreve[];
  /** La planilla propia de cada contrato. */
  campos: CampoContrato[];
  /** El maestro de Abastecimiento. */
  proveedores: Proveedor[];
  /** Las categorías de costo, propias de cada contrato. */
  categorias: Categoria[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Cabecera>(cabeceraDe(compra, contratos));
  const editando = compra !== null;
  const [lineas, setLineas] = useState<LineaGasto[]>(() => (compra ? [] : [lineaVacia()]));
  const [cargandoLineas, setCargandoLineas] = useState(editando);
  /* El IVA sigue a las líneas mientras no se escriba a mano: hay facturas con
     redondeos del proveedor que no dan exactamente lo calculado. */
  const [ivaTocado, setIvaTocado] = useState(editando);
  const [confirmando, setConfirmando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [propios, setPropios] = useState<Datos>(compra?.datos ?? {});
  const [creandoProveedor, setCreandoProveedor] = useState(false);

  /* Al editar se traen sus líneas. Una compra anterior a las líneas no tiene:
     se muestra como una sola, con su detalle, categoría, tipo y neto; al
     guardarla queda con el formato nuevo y los mismos montos. */
  useEffect(() => {
    if (!compra) return;
    let vigente = true;
    cargarLineasDeCompra(compra.id)
      .then((ls) => {
        if (!vigente) return;
        setLineas(
          ls.length > 0
            ? ls.map((l) => lineaVacia(l))
            : [lineaVacia({ descripcion: compra.detalle, cantidad: 1, precio_unitario: compra.neto, categoria_id: compra.categoriaId ?? "", tipo: compra.tipo })],
        );
      })
      .catch((e) => vigente && f.setError(e instanceof Error ? e.message : String(e)))
      .finally(() => vigente && setCargandoLineas(false));
    return () => {
      vigente = false;
    };
    // Solo al abrir: la compra no cambia mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* El código no se teclea: es el contrato y el mes. Escribirlo a mano es la
     forma más común de terminar con dos compras del mismo mes con el mismo
     código, o con uno que no calza con ningún contrato. */
  const codigo = editando
    ? compra.id
    : siguienteIdCompra(compras, f.datos.contrato_id, f.datos.periodo_control);

  const propias = categoriasDe(categorias, f.datos.contrato_id, "compras");
  const afectaIva = (id: string) => categorias.find((c) => c.id === id)?.afectaIva ?? true;
  const neto = lineas.reduce((t, l) => t + netoLinea(l), 0);
  const ivaCalculado = lineas.reduce((t, l) => t + (afectaIva(l.categoria_id) ? Math.round(netoLinea(l) * 0.19) : 0), 0);
  const iva = ivaTocado ? f.datos.iva : ivaCalculado;

  /* El presupuesto de cada categoría del documento, con lo que ya lleva en el
     mes sin contar esta compra. Es el semáforo de desviación de la planilla. */
  const semaforo = propias
    .filter((c) => c.presupuestoMensual > 0 && lineas.some((l) => l.categoria_id === c.id))
    .map((c) => {
      const yaLleva = compras
        .filter((x) => x.id !== compra?.id && x.categoriaId === c.id && x.periodoControl.slice(0, 7) === f.datos.periodo_control.slice(0, 7))
        .reduce((t, x) => t + x.neto, 0);
      const estaCompra = lineas.filter((l) => l.categoria_id === c.id).reduce((t, l) => t + netoLinea(l), 0);
      return { categoria: c, acumulado: yaLleva + estaCompra };
    });

  /* Cambiar de contrato deja categorías que en el nuevo no existen. Se limpian. */
  function elegirContrato(id: string) {
    if (id !== f.datos.contrato_id) setPropios({});
    f.cambiar("contrato_id", id);
    const delNuevo = new Set(categoriasDe(categorias, id, "compras").map((c) => c.id));
    setLineas((ls) => ls.map((l) => (delNuevo.has(l.categoria_id) ? l : { ...l, categoria_id: "" })));
  }

  /* El proveedor se elige del maestro y el nombre se copia: el enlace sirve para
     consultar, el texto es lo que dice el documento. */
  function elegirProveedor(id: string) {
    f.cambiar("proveedor_id", id);
    const p = proveedores.find((x) => x.id === id);
    if (p) f.cambiar("proveedor", p.razonSocial);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const conDescripcion = lineas.filter((l) => l.descripcion.trim());
    if (!f.datos.proveedor.trim()) return f.setError("Elige el proveedor.");
    if (conDescripcion.length === 0) return f.setError("Agrega al menos una línea con descripción.");
    if (conDescripcion.some((l) => l.cantidad <= 0)) return f.setError("Cada línea necesita una cantidad mayor que cero.");

    f.enviar(
      () =>
        guardarCompraDirecta({
          id: codigo,
          contratoId: f.datos.contrato_id,
          proveedorId: f.datos.proveedor_id,
          proveedor: f.datos.proveedor,
          documento: f.datos.documento,
          fecha: f.datos.fecha,
          periodoControl: f.datos.periodo_control,
          iva,
          datos: propios,
          lineas: conDescripcion.map(({ descripcion, unidad, cantidad, precio_unitario, categoria_id, tipo }) => ({
            descripcion: descripcion.trim(), unidad, cantidad, precio_unitario, categoria_id, tipo,
          })),
        }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  async function borrar() {
    setErrorBorrado(null);
    setBorrando(true);
    try {
      // Sus líneas se borran con ella (trigger de la 0053).
      await eliminar("compras", compra!.id);
      alGuardado();
      alCerrar();
    } catch (e) {
      setErrorBorrado(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(false);
    }
  }

  /* La factura de una OC es del ciclo de la orden: sus líneas son las de la
     orden y se registran contra lo recibido. Editarla acá las desordenaría. */
  if (compra?.ordenId) {
    return (
      <Dialogo titulo={`Factura ${compra.documento ?? compra.id}`} abierto alCerrar={alCerrar}
        descripcion="Esta factura viene de una orden de compra.">
        <p className="px-6 py-6 text-sm leading-relaxed text-ink-soft">
          Se registró contra la orden y cubre líneas de ella. Para corregirla, o para registrar una nota de crédito, abre
          la orden en <strong className="text-ink">Órdenes de compra</strong>, más abajo en esta misma pantalla.
        </p>
        <div className="flex justify-end border-t border-mist px-6 py-5">
          <button type="button" onClick={alCerrar}
            className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
            Cerrar
          </button>
        </div>
      </Dialogo>
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar compra" : "Nueva compra"}
        descripcion={
          editando
            ? `${compra.id} · cada cambio queda registrado con tu nombre y la hora.`
            : "Una compra sin orden de compra, al contado: el documento y sus líneas. Para una OC, usa «Registrar OC»."
        }
        abierto
        alCerrar={alCerrar}
        ancho="max-w-5xl"
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

            <CampoTexto
              etiqueta="N° de documento"
              marcador="123456"
              ayuda="Factura o boleta del proveedor."
              {...f.campo("documento")}
            />

            <CampoFecha
              etiqueta="Fecha del documento"
              requerido
              ayuda="La fecha real de la factura o comprobante."
              {...f.campo("fecha")}
            />

            <CampoMes
              etiqueta="Mes de control"
              requerido
              ayuda="Mes al que se imputa el costo en el Dashboard; puede diferir de la fecha del documento."
              {...f.campo("periodo_control")}
            />

            <Ancho>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Combo
                    etiqueta="Proveedor"
                    requerido
                    opciones={proveedores
                      .filter((p) => p.estado === "activo" || p.estado === "por_completar")
                      .map((p) => ({
                        id: p.id,
                        titulo: p.razonSocial,
                        nota: [formatearRut(p.rut), ...p.rubros.slice(0, 2)].filter(Boolean).join(" · "),
                      }))}
                    marcador="Escribe para buscar…"
                    ayuda="Son los mismos de Abastecimiento. Si no está, agrégalo acá al lado."
                    valor={f.datos.proveedor_id}
                    alCambiar={elegirProveedor}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCreandoProveedor(true)}
                  className="shrink-0 rounded-full border border-mist-deep bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  Nuevo proveedor
                </button>
              </div>
            </Ancho>

            {/* Cuando la compra vieja no tiene enlace al maestro, el nombre
                escrito es lo único que hay: se muestra en vez de esconderlo. */}
            {!f.datos.proveedor_id && f.datos.proveedor && (
              <Ancho>
                <CampoTexto
                  etiqueta="Nombre escrito en el documento"
                  ayuda="Esta compra es anterior al maestro. Elige el proveedor arriba para engancharla."
                  {...f.campo("proveedor")}
                />
              </Ancho>
            )}

            <Ancho>
              <p className="text-xs text-ink-soft">
                Código: <span className="font-mono font-semibold text-ink">{codigo}</span>
                {editando ? " · no se puede cambiar." : " · se arma solo con el contrato y el mes."}
              </p>
            </Ancho>
          </Campos>

          <section className="border-t border-mist px-6 py-6">
            {cargandoLineas ? (
              <p className="py-6 text-center text-sm text-ink-soft">Cargando las líneas…</p>
            ) : (
              <LineasDeGasto
                lineas={lineas}
                alCambiar={setLineas}
                categorias={propias.map((c) => ({ id: c.id, nombre: c.nombre }))}
                afectaIva={afectaIva}
              />
            )}
          </section>

          <Campos>
            <CampoDinero
              etiqueta="IVA del documento"
              ayuda={
                ivaTocado && iva !== ivaCalculado
                  ? `Según las categorías serían ${formatearPesos(ivaCalculado)}. Se guarda lo que dice la factura.`
                  : "Se calcula con las categorías. Corrígelo si la factura dice otra cosa."
              }
              valor={iva}
              alCambiar={(v) => {
                setIvaTocado(true);
                f.cambiar("iva", v);
              }}
            />
            <div className="flex items-baseline justify-between gap-4 self-end rounded-xl border-2 border-ink bg-white px-4 py-3">
              <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">Total</span>
              <span className="font-display text-xl font-semibold tabular-nums text-ink">{formatearPesos(neto + iva)}</span>
            </div>

            {semaforo.map(({ categoria, acumulado }) => (
              <Ancho key={categoria.id}>
                <p
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    acumulado > categoria.presupuestoMensual
                      ? "bg-[#fdeeec] text-[#a52f24]"
                      : acumulado > categoria.presupuestoMensual * 0.85
                        ? "bg-[#fdf3e3] text-[#8a5a09]"
                        : "bg-mist/50 text-ink-soft"
                  }`}
                >
                  <strong>{categoria.nombre}</strong> tiene {formatearPesos(categoria.presupuestoMensual)} de presupuesto al
                  mes. Con esta compra el mes va en <strong>{formatearPesos(acumulado)}</strong>
                  {acumulado > categoria.presupuestoMensual
                    ? ` — ${formatearPesos(acumulado - categoria.presupuestoMensual)} por sobre el presupuesto.`
                    : ` (${Math.round((acumulado / categoria.presupuestoMensual) * 100)}% del presupuesto).`}
                </p>
              </Ancho>
            ))}

            <CamposDelContrato
              campos={campos}
              contratoId={f.datos.contrato_id}
              seccion="compras"
              datos={propios}
              alCambiar={setPropios}
            />
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear compra"}
            alEliminar={editando ? () => setConfirmando(true) : undefined}
          />
        </form>
      </Dialogo>

      {/* Dar de alta un proveedor sin salir de la compra. El id del nuevo se
          conoce de antemano porque el maestro lo arma con el mismo correlativo,
          así que queda seleccionado apenas se guarda. */}
      {creandoProveedor && (
        <FormularioProveedor
          proveedor={null}
          proveedores={proveedores}
          alCerrar={() => setCreandoProveedor(false)}
          alGuardado={() => {
            f.cambiar("proveedor_id", siguienteIdProveedor(proveedores));
            alGuardado();
          }}
        />
      )}

      <Confirmacion
        abierto={confirmando}
        titulo="Eliminar compra"
        detalle={`Se va a eliminar ${compra?.id ?? ""} — ${compra?.proveedor ?? ""}, con sus líneas. El costo del contrato se recalcula sin ella.`}
        error={errorBorrado}
        procesando={borrando}
        alCancelar={() => setConfirmando(false)}
        alConfirmar={borrar}
      />
    </>
  );
}
