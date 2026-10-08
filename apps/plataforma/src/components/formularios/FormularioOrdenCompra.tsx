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
import { formasPago, type EstadoOC, type FormaPago, type OrdenCompra } from "@/lib/ingresos";

/**
 * La orden de compra del mandante. Es para COBRARLE, no para comprar: lo que
 * importa es cuánto autoriza, si paga al contado o a crédito y cuándo se le
 * cobra. Se carga desde Estado de Pago; acá se corrige.
 */

const estados: { id: EstadoOC; titulo: string }[] = [
  { id: "vigente", titulo: "Vigente" },
  { id: "consumida", titulo: "Consumida" },
  { id: "vencida", titulo: "Vencida" },
];

const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  contrato_id: string;
  numero: string;
  mandante: string;
  monto_autorizado: number;
  forma_pago: FormaPago;
  fecha_cobro: string;
  estado: EstadoOC;
};

function borradorDe(oc: OrdenCompra | null, contratos: ContratoBreve[]): Borrador {
  if (!oc) {
    return {
      contrato_id: contratos[0]?.id ?? "",
      numero: "",
      mandante: contratos[0]?.cliente ?? "",
      monto_autorizado: 0,
      forma_pago: "credito",
      fecha_cobro: "",
      estado: "vigente",
    };
  }
  return {
    contrato_id: oc.contratoId,
    numero: oc.numero,
    mandante: oc.mandante,
    monto_autorizado: oc.montoAutorizado,
    forma_pago: oc.formaPago ?? "credito",
    fecha_cobro: oc.fechaCobro ?? "",
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
    const fila = { ...f.datos, numero: f.datos.numero.trim(), fecha_cobro: f.datos.fecha_cobro || null };

    f.enviar(
      () =>
        editando
          ? actualizar("ordenes_compra", orden.id, fila)
          // El código se arma con el contrato y el N°: una OC es una por contrato y número.
          : crear("ordenes_compra", {
              ...fila,
              id: `OC-${fila.contrato_id.replace(/^C-/, "")}-${fila.numero.replace(/\s+/g, "")}`,
              fecha_emision: hoy(),
            }),
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
            ? `N° ${orden.numero}${orden.edps.length > 0 ? ` · cubre ${orden.edps.join(", ")}` : ""}. El consumo no se edita: es la suma de esos estados de pago.`
            : "La OC del mandante: lo que autoriza cobrar y cuándo se le cobra."
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
              {...f.campo("contrato_id")}
            />

            <CampoTexto
              etiqueta="N° de OC"
              requerido
              marcador="9000114150"
              ayuda="El folio que emite el mandante."
              {...f.campo("numero")}
            />

            <CampoTexto etiqueta="Mandante" requerido marcador="Novandino Litio" {...f.campo("mandante")} />

            <CampoDinero
              etiqueta="Monto autorizado"
              requerido
              ayuda="Lo máximo que se puede cobrar contra esta OC."
              {...f.campo("monto_autorizado")}
            />

            <CampoSeleccion etiqueta="Forma de pago" requerido opciones={formasPago} {...f.campo("forma_pago")} />

            <CampoFecha
              etiqueta="Fecha de cobro"
              ayuda="Cuándo se le cobra al mandante. Es el vencimiento que se propone al facturar."
              {...f.campo("fecha_cobro")}
            />

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
        detalle={`Se va a eliminar la OC N° ${orden?.numero ?? ""} de ${orden?.mandante ?? ""}. Los estados de pago que cubre quedan sin orden.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
