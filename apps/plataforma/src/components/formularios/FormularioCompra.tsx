"use client";

import { useState } from "react";
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
import { formatearRut, siguienteIdProveedor, type Proveedor } from "@/lib/abastecimiento";
import type { CampoContrato, Datos } from "@/lib/campos";
import { categoriasDe, opcionesDeCategoria, type Categoria } from "@/lib/categorias";
import { actualizar, crear, eliminar } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { siguienteIdCompra, tiposCompra, type Compra, type TipoCompra } from "@/lib/egresos";
import { formatearPesos } from "@/lib/formato";

/**
 * Una compra de Control de Gestión.
 *
 * Una compra tiene fecha documental y mes de control. Normalmente coinciden;
 * si una factura de agosto se imputa en septiembre, ambos datos quedan visibles
 * y el Dashboard usa el mes de control sin alterar la fecha del comprobante.
 *
 * Por eso acá no se pregunta el estado de pago: si la factura al proveedor está
 * pagada o no es asunto de Abastecimiento, no del resultado del mes.
 */

const mesActual = () => `${new Date().toISOString().slice(0, 7)}-01`;
const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  contrato_id: string;
  categoria_id: string;
  proveedor_id: string;
  proveedor: string;
  documento: string;
  detalle: string;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  fecha: string;
  periodo_control: string;
};

function borradorDe(compra: Compra | null, contratos: ContratoBreve[]): Borrador {
  if (!compra) {
    return {
      contrato_id: contratos[0]?.id ?? "",
      categoria_id: "",
      proveedor_id: "",
      proveedor: "",
      documento: "",
      detalle: "",
      tipo: "ordinario",
      neto: 0,
      iva: 0,
      fecha: hoy(),
      periodo_control: mesActual(),
    };
  }
  return {
    contrato_id: compra.contratoId,
    categoria_id: compra.categoriaId ?? "",
    proveedor_id: compra.proveedorId ?? "",
    proveedor: compra.proveedor,
    documento: compra.documento ?? "",
    detalle: compra.detalle,
    tipo: compra.tipo,
    neto: compra.neto,
    iva: compra.iva,
    fecha: compra.fecha,
    periodo_control: compra.periodoControl,
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
  const f = useFormulario<Borrador>(borradorDe(compra, contratos));
  const [confirmando, setConfirmando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const editando = compra !== null;
  const [propios, setPropios] = useState<Datos>(compra?.datos ?? {});
  const [creandoProveedor, setCreandoProveedor] = useState(false);

  /* El código no se teclea: es el contrato y el mes. Escribirlo a mano es la
     forma más común de terminar con dos líneas del mismo mes con el mismo
     código, o con uno que no calza con ningún contrato. */
  const codigo = editando
    ? compra.id
    : siguienteIdCompra(compras, f.datos.contrato_id, f.datos.periodo_control);

  const total = f.datos.neto + f.datos.iva;

  /* La categoría elegida y su presupuesto del mes. Cambiar el contrato cambia
     la lista: cargar un EPP contra Torres no debería ser posible, porque Torres
     no tiene esa línea en su planilla. */
  const propias = categoriasDe(categorias, f.datos.contrato_id, "compras");
  const categoria = propias.find((c) => c.id === f.datos.categoria_id);

  /* Lo que ya lleva esa categoría en el mes, sin contar la línea que se está
     editando. Es el semáforo de desviación de la planilla. */
  const consumido = compras
    .filter(
      (c) =>
        c.id !== compra?.id &&
        c.categoriaId === f.datos.categoria_id &&
        c.periodoControl.slice(0, 7) === f.datos.periodo_control.slice(0, 7),
    )
    .reduce((t, c) => t + c.neto, 0);

  const presupuesto = categoria?.presupuestoMensual ?? 0;
  const acumulado = consumido + f.datos.neto;

  /* El IVA se calcula al escribir el neto, y queda editable: hay facturas
     exentas y hay redondeos del proveedor que no dan exactamente el 19%. */
  function ponerNeto(neto: number) {
    f.cambiar("neto", neto);
    f.cambiar("iva", Math.round(neto * 0.19));
  }

  /* Cambiar de contrato deja la categoría del contrato anterior seleccionada, y
     esa categoría no existe en el nuevo. Se limpia. */
  function elegirContrato(id: string) {
    if (id !== f.datos.contrato_id) setPropios({});
    f.cambiar("contrato_id", id);
    if (!categoriasDe(categorias, id, "compras").some((c) => c.id === f.datos.categoria_id)) {
      f.cambiar("categoria_id", "");
    }
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
    const d = f.datos;
    const fila = {
      ...d,
      categoria_id: d.categoria_id || null,
      proveedor_id: d.proveedor_id || null,
      documento: d.documento.trim() || null,
      datos: propios,
    };

    f.enviar(
      () =>
        editando
          ? actualizar("compras", compra.id, fila)
          : crear("compras", { ...fila, id: codigo }),
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
        titulo={editando ? "Editar compra" : "Nueva compra"}
        descripcion={
          editando
            ? `${compra.id} · cada cambio queda registrado con tu nombre y la hora.`
            : "El egreso del mes por contrato, con su respaldo. Los gastos reembolsables se le recuperan al mandante, así que no entran al costo."
        }
        abierto
        alCerrar={alCerrar}
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
              <div className="rounded-xl border border-mist-deep bg-mist/40 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  Código
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-ink">{codigo}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {editando
                    ? "No se puede cambiar."
                    : "Se arma solo con el contrato y el mes, y sigue el correlativo."}
                </p>
              </div>
            </Ancho>

            {/* La lista sale de la planilla del contrato elegido: Misceláneos
                tiene EPP Básicos y Torres no, porque no compra EPP. */}
            <CampoSeleccion
              etiqueta="Categoría de costo"
              requerido
              opciones={opcionesDeCategoria(categorias, f.datos.contrato_id, "compras")}
              ayuda={
                propias.length === 0
                  ? "Este contrato todavía no tiene categorías de compras definidas."
                  : categoria && !categoria.afectaIva
                    ? "No afecta a IVA: entra íntegra al costo."
                    : "En qué línea de la planilla entra este gasto."
              }
              {...f.campo("categoria_id")}
            />

            {/* Ordinario o gasto reembolsable: decide si el monto entra o no al
                costo del contrato. */}
            <CampoSeleccion
              etiqueta="Tipo de compra"
              requerido
              opciones={tiposCompra}
              ayuda={
                f.datos.tipo === "reembolsable"
                  ? "No suma al costo real del contrato: se le cobra al mandante."
                  : "Suma al costo real del contrato y descuenta del presupuesto."
              }
              {...f.campo("tipo")}
            />

            <CampoTexto
              etiqueta="N° de documento"
              marcador="123456"
              ayuda="Factura o guía del proveedor."
              {...f.campo("documento")}
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
                        nota: [formatearRut(p.rut), ...p.rubros.slice(0, 2)]
                          .filter(Boolean)
                          .join(" · "),
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
              <CampoTexto
                etiqueta="Detalle"
                requerido
                marcador="Hormigón H30 para fundaciones"
                {...f.campo("detalle")}
              />
            </Ancho>

            <CampoDinero
              etiqueta="Neto"
              requerido
              ayuda="Al escribirlo se calculan solos el IVA y el total."
              valor={f.datos.neto}
              alCambiar={ponerNeto}
            />

            <CampoDinero
              etiqueta="IVA"
              ayuda="El 19% del neto. Se puede corregir si la factura viene exenta o con otro redondeo."
              {...f.campo("iva")}
            />

            <Ancho>
              <div className="flex items-baseline justify-between gap-4 rounded-xl border-2 border-ink bg-white px-4 py-3">
                <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                  Total con IVA
                </span>
                <span className="font-display text-xl font-semibold tabular-nums text-ink">
                  {formatearPesos(total)}
                </span>
              </div>
            </Ancho>

            {presupuesto > 0 && (
              <Ancho>
                <p
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    acumulado > presupuesto
                      ? "bg-[#fdeeec] text-[#a52f24]"
                      : acumulado > presupuesto * 0.85
                        ? "bg-[#fdf3e3] text-[#8a5a09]"
                        : "bg-mist/50 text-ink-soft"
                  }`}
                >
                  <strong>{categoria?.nombre}</strong> tiene {formatearPesos(presupuesto)} de
                  presupuesto al mes. Con esta compra el mes va en{" "}
                  <strong>{formatearPesos(acumulado)}</strong>
                  {acumulado > presupuesto
                    ? ` — ${formatearPesos(acumulado - presupuesto)} por sobre el presupuesto.`
                    : ` (${Math.round((acumulado / presupuesto) * 100)}% del presupuesto).`}
                </p>
              </Ancho>
            )}

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
        detalle={`Se va a eliminar ${compra?.id ?? ""} — ${compra?.proveedor ?? ""}. El costo del contrato se recalcula sin ella.`}
        error={errorBorrado}
        procesando={borrando}
        alCancelar={() => setConfirmando(false)}
        alConfirmar={borrar}
      />
    </>
  );
}
