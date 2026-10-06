"use client";

import { SelectorAnexo } from "../ui/SelectorAnexo";
import { useState } from "react";

import {
  Ancho,
  CampoDinero,
  CampoFecha,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Confirmacion,
  Dialogo,
  Pie,
  useBorrado,
  useFormulario,
} from "../ui/Formulario";
import { CamposDelContrato } from "../ui/CamposDelContrato";
import { actualizar, crear } from "@/lib/crud";
import type { CampoContrato, Datos } from "@/lib/campos";
import { categoriasDe, opcionesDeCategoria, type Categoria } from "@/lib/categorias";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import {
  periodicidades,
  tiposCompra,
  tiposServicio,
  type Servicio,
  type Periodicidad,
  type TipoCompra,
  type TipoServicio,
} from "@/lib/egresos";
import { formatearPesos } from "@/lib/formato";

const estadosPago = [
  { id: "pendiente" as const, titulo: "Pendiente de pago" },
  { id: "pagada" as const, titulo: "Pagada" },
];

const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  /** El anexo al que se carga; vacío = contrato base. */
  anexo_id: string;
  id: string;
  contrato_id: string;
  categoria_id: string;
  contratista: string;
  documento: string;
  detalle: string;
  tipo_servicio: TipoServicio;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  fecha: string;
  desde: string;
  hasta: string;
  recurrente: boolean;
  periodicidad: Periodicidad | "";
  estado_pago: "pendiente" | "pagada";
};

function borradorDe(s: Servicio | null, contratos: ContratoBreve[]): Borrador {
  if (!s) {
    return {
      id: "",
      contrato_id: contratos[0]?.id ?? "",
      anexo_id: "",
      categoria_id: "",
      contratista: "",
      documento: "",
      detalle: "",
      tipo_servicio: "subcontrato",
      tipo: "ordinario",
      neto: 0,
      iva: 0,
      fecha: hoy(),
      desde: "",
      hasta: "",
      recurrente: false,
      periodicidad: "",
      estado_pago: "pendiente",
    };
  }
  return {
    id: s.id,
    contrato_id: s.contratoId,
    anexo_id: s.anexoId ?? "",
    categoria_id: s.categoriaId ?? "",
    contratista: s.contratista,
    documento: s.documento ?? "",
    detalle: s.detalle,
    tipo_servicio: s.tipoServicio,
    tipo: s.tipo,
    neto: s.neto,
    iva: s.iva,
    fecha: s.fecha,
    desde: s.desde ?? "",
    hasta: s.hasta ?? "",
    recurrente: s.recurrente,
    periodicidad: s.periodicidad ?? "",
    estado_pago: s.estadoPago,
  };
}

export function FormularioServicio({
  servicio,
  contratos,
  campos,
  categorias,
  alCerrar,
  alGuardado,
}: {
  servicio: Servicio | null;
  contratos: ContratoBreve[];
  /** La planilla propia de cada contrato. */
  campos: CampoContrato[];
  /** Las categorías de costo, propias de cada contrato. */
  categorias: Categoria[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(servicio, contratos));
  const editando = servicio !== null;
  const [propios, setPropios] = useState<Datos>(servicio?.datos ?? {});
  const borrado = useBorrado("servicios", servicio?.id, () => {
    alGuardado();
    alCerrar();
  });

  const propias = categoriasDe(categorias, f.datos.contrato_id, "servicios");

  /* Cambiar de contrato deja seleccionada una categoría que el nuevo no tiene.
     Se limpia. */
  function elegirContrato(id: string) {
    if (id !== f.datos.contrato_id) setPropios({});
    f.cambiar("contrato_id", id);
    if (!categoriasDe(categorias, id, "servicios").some((c) => c.id === f.datos.categoria_id)) {
      f.cambiar("categoria_id", "");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (f.datos.desde && f.datos.hasta && f.datos.hasta < f.datos.desde) {
      f.setError("La fecha de término del servicio debe ser igual o posterior al inicio.");
      return;
    }
    const { id, ...campos } = f.datos;
    const fila = {
      ...campos,
      datos: propios,
      categoria_id: campos.categoria_id || null,
      anexo_id: campos.anexo_id || null,
      documento: campos.documento.trim() || null,
      desde: campos.desde || null,
      hasta: campos.hasta || null,
      // Sin recurrencia no hay periodicidad que guardar.
      periodicidad: campos.recurrente ? campos.periodicidad || "mensual" : null,
    };

    f.enviar(
      () =>
        editando
          ? actualizar("servicios", servicio.id, fila)
          : crear("servicios", { ...fila, id: id.trim() }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar servicio" : "Nuevo servicio"}
        descripcion={
          editando
            ? `${servicio.id} · cada cambio queda registrado con tu nombre y la hora.`
            : "Subcontratos, arriendos y servicios de terceros. Van al costo del contrato igual que las compras."
        }
        abierto
        alCerrar={alCerrar}
      >
        <form onSubmit={onSubmit}>
          <Campos>
            {!editando && (
              <CampoTexto
                etiqueta="Código"
                requerido
                marcador="SV-C2601-04"
                ayuda="Identificador único. No se puede cambiar después."
                {...f.campo("id")}
              />
            )}

            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={opcionesDeContrato(contratos)}
              valor={f.datos.contrato_id}
              alCambiar={elegirContrato}
            />
            <SelectorAnexo contratoId={f.datos.contrato_id} valor={f.datos.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />

            {/* La lista sale de la planilla del contrato: Torres tiene "Torres"
                y "Camioneta"; Misceláneos tiene "Traslado de Personal". */}
            <CampoSeleccion
              etiqueta="Categoría de costo"
              requerido
              opciones={opcionesDeCategoria(categorias, f.datos.contrato_id, "servicios")}
              ayuda={
                propias.length === 0
                  ? "Este contrato todavía no tiene categorías de servicios definidas."
                  : "En qué línea de la planilla entra este gasto."
              }
              {...f.campo("categoria_id")}
            />

            <CampoTexto
              etiqueta="Contratista"
              requerido
              marcador="Layher Chile"
              {...f.campo("contratista")}
            />

            <CampoSeleccion
              etiqueta="Clase de servicio"
              requerido
              opciones={tiposServicio}
              ayuda="Para saber cuánto de la obra se ejecuta con terceros."
              {...f.campo("tipo_servicio")}
            />

            <CampoSeleccion
              etiqueta="Tipo de gasto"
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
              ayuda="Factura del contratista."
              {...f.campo("documento")}
            />

            <Ancho>
              <CampoTexto
                etiqueta="Detalle"
                requerido
                marcador="Montaje y desmontaje de andamios"
                {...f.campo("detalle")}
              />
            </Ancho>

            <CampoDinero etiqueta="Neto" requerido {...f.campo("neto")} />

            <CampoDinero
              etiqueta="IVA"
              ayuda={
                f.datos.neto > 0
                  ? `El 19% del neto son ${formatearPesos(Math.round(f.datos.neto * 0.19))}.`
                  : "El 19% del neto."
              }
              {...f.campo("iva")}
            />

            <CampoFecha etiqueta="Fecha del documento" requerido {...f.campo("fecha")} />

            <CampoSeleccion
              etiqueta="Estado de pago"
              opciones={estadosPago}
              {...f.campo("estado_pago")}
            />

            <CampoFecha
              etiqueta="Servicio desde"
              ayuda="Opcional. Un subcontrato cubre un tramo, no un día."
              {...f.campo("desde")}
            />

            <CampoFecha etiqueta="Servicio hasta" {...f.campo("hasta")} />

            <Ancho>
              <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                Total con IVA:{" "}
                <span className="font-semibold text-ink">
                  {formatearPesos(f.datos.neto + f.datos.iva)}
                </span>
                <span className="ml-2 text-xs">Se calcula solo, no se escribe.</span>
              </p>
            </Ancho>
            <Ancho>
              <label className="flex items-start gap-3 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3">
                <input
                  type="checkbox"
                  checked={f.datos.recurrente}
                  onChange={(e) => f.setDatos((d) => ({ ...d, recurrente: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-mist-deep accent-cyan"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    Es un gasto recurrente
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    Un arriendo se repite todos los meses mientras dure; un flete puntual no.
                    Marcarlo permite separar el gasto que va a volver del que no.
                  </span>
                </span>
              </label>
            </Ancho>

            {f.datos.recurrente && (
              <CampoSeleccion
                etiqueta="Cada cuánto"
                opciones={periodicidades}
                ayuda="Con qué frecuencia se repite mientras dure el período."
                {...f.campo("periodicidad")}
              />
            )}

            <CamposDelContrato
              campos={campos}
              contratoId={f.datos.contrato_id}
              seccion="servicios"
              datos={propios}
              alCambiar={setPropios}
            />
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear servicio"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar servicio"
        detalle={`Se va a eliminar ${servicio?.id ?? ""} — ${servicio?.contratista ?? ""}. El costo del contrato se recalcula sin él.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
