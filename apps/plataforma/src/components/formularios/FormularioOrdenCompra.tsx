"use client";

import {
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
import { actualizar, crear } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import type { EstadoOC, OrdenCompra } from "@/lib/ingresos";

const estados: { id: EstadoOC; titulo: string }[] = [
  { id: "vigente", titulo: "Vigente" },
  { id: "consumida", titulo: "Consumida" },
  { id: "vencida", titulo: "Vencida" },
];

const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  id: string;
  contrato_id: string;
  numero: string;
  mandante: string;
  monto_autorizado: number;
  fecha_emision: string;
  vigencia: string;
  estado: EstadoOC;
};

function borradorDe(oc: OrdenCompra | null, contratos: ContratoBreve[]): Borrador {
  if (!oc) {
    return {
      id: "",
      contrato_id: contratos[0]?.id ?? "",
      numero: "",
      mandante: contratos[0]?.cliente ?? "",
      monto_autorizado: 0,
      fecha_emision: hoy(),
      vigencia: "",
      estado: "vigente",
    };
  }
  return {
    id: oc.id,
    contrato_id: oc.contratoId,
    numero: oc.numero,
    mandante: oc.mandante,
    monto_autorizado: oc.montoAutorizado,
    fecha_emision: oc.fechaEmision,
    vigencia: oc.vigencia ?? "",
    estado: oc.estado,
  };
}

export function FormularioOrdenCompra({
  orden,
  contratos,
  alCerrar,
  alGuardado,
}: {
  orden: OrdenCompra | null;
  contratos: ContratoBreve[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(orden, contratos));
  const editando = orden !== null;
  const borrado = useBorrado("ordenes_compra", orden?.id, () => {
    alGuardado();
    alCerrar();
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { id, ...campos } = f.datos;
    const fila = { ...campos, vigencia: campos.vigencia || null };

    f.enviar(
      () =>
        editando
          ? actualizar("ordenes_compra", orden.id, fila)
          : crear("ordenes_compra", { ...fila, id: id.trim() }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar orden de compra" : "Nueva orden de compra"}
        descripcion={
          editando
            ? `${orden.id} · el consumo no se edita: es la suma de los estados de pago del contrato.`
            : "La OC es el techo de lo que se puede cobrar en ese contrato."
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
                marcador="OC-C2601-02"
                ayuda="Identificador único. No se puede cambiar después."
                {...f.campo("id")}
              />
            )}

            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={opcionesDeContrato(contratos)}
              {...f.campo("contrato_id")}
            />

            <CampoTexto
              etiqueta="N° de OC"
              requerido
              marcador="4537"
              ayuda="El folio que emite el mandante."
              {...f.campo("numero")}
            />

            <CampoTexto etiqueta="Mandante" requerido marcador="SQM" {...f.campo("mandante")} />

            <CampoDinero
              etiqueta="Monto autorizado"
              requerido
              ayuda="Lo máximo que se puede presentar contra esta OC."
              {...f.campo("monto_autorizado")}
            />

            <CampoFecha etiqueta="Fecha de emisión" requerido {...f.campo("fecha_emision")} />

            <CampoFecha etiqueta="Vigencia" {...f.campo("vigencia")} />

            <CampoSeleccion etiqueta="Estado" requerido opciones={estados} {...f.campo("estado")} />
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear orden de compra"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar orden de compra"
        detalle={`Se va a eliminar ${orden?.id ?? ""} — N° ${orden?.numero ?? ""} de ${orden?.mandante ?? ""}.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
