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
  ResumenIva,
  ivaDe,
  useBorrado,
  useFormulario,
} from "../ui/Formulario";
import { actualizar, crear } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import type { EstadoCobro, Factura } from "@/lib/ingresos";

const estados: { id: EstadoCobro; titulo: string }[] = [
  { id: "emitida", titulo: "Emitida · pendiente de pago" },
  { id: "enviada", titulo: "Enviada al mandante · pendiente de pago" },
  { id: "pagada", titulo: "Pagada" },
  { id: "vencida", titulo: "Vencida" },
];

const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  id: string;
  contrato_id: string;
  neto: number;
  iva: number;
  fecha_emision: string;
  vencimiento: string;
  estado_cobro: EstadoCobro;
};

function borradorDe(fa: Factura | null, contratos: ContratoBreve[]): Borrador {
  if (!fa) {
    return {
      id: "",
      contrato_id: contratos[0]?.id ?? "",
      neto: 0,
      iva: 0,
      fecha_emision: hoy(),
      vencimiento: "",
      estado_cobro: "emitida",
    };
  }
  return {
    id: fa.id,
    contrato_id: fa.contratoId,
    neto: fa.neto,
    iva: fa.iva,
    fecha_emision: fa.fechaEmision,
    vencimiento: fa.vencimiento ?? "",
    estado_cobro: fa.estadoCobro,
  };
}

export function FormularioFactura({
  factura,
  contratos,
  alCerrar,
  alGuardado,
}: {
  factura: Factura | null;
  contratos: ContratoBreve[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(factura, contratos));
  const editando = factura !== null;
  const borrado = useBorrado("facturas", factura?.id, () => {
    alGuardado();
    alCerrar();
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { id, ...campos } = f.datos;
    const fila = {
      ...campos,
      // El IVA no se escribe: las facturas de Valar son afectas, el 19% del neto.
      iva: ivaDe(campos.neto),
      vencimiento: campos.vencimiento || null,
    };

    f.enviar(
      () =>
        editando
          ? actualizar("facturas", factura.id, fila)
          : crear("facturas", { ...fila, id: id.trim() }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar factura" : "Nueva factura"}
        descripcion={
          editando
            ? `${factura.id}${factura.edps.length > 0 ? ` · cobra ${factura.edps.join(", ")}` : ""}. Alimenta la facturación mensual del Dashboard.`
            : "Lo que se emita acá es lo que aparece en el gráfico de facturación del Dashboard."
        }
        abierto
        alCerrar={alCerrar}
      >
        <form onSubmit={onSubmit}>
          <Campos>
            {!editando && (
              <CampoTexto
                etiqueta="Folio"
                requerido
                marcador="F-4838"
                ayuda="El folio de la factura. No se puede cambiar después."
                {...f.campo("id")}
              />
            )}

            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={opcionesDeContrato(contratos)}
              {...f.campo("contrato_id")}
            />

            <CampoDinero etiqueta="Neto" requerido {...f.campo("neto")} />

            <CampoFecha etiqueta="Fecha de emisión" requerido {...f.campo("fecha_emision")} />

            <CampoFecha
              etiqueta="Vencimiento"
              ayuda="A partir de esta fecha se cuenta la mora."
              {...f.campo("vencimiento")}
            />

            <CampoSeleccion
              etiqueta="Estado de cobro"
              requerido
              ayuda="Al marcarla pagada, sus estados de pago pasan a Pagado."
              opciones={estados}
              {...f.campo("estado_cobro")}
            />

            <ResumenIva neto={f.datos.neto} />
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear factura"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar factura"
        detalle={`Se va a eliminar la factura ${factura?.id ?? ""}. La facturación del mes en el Dashboard se recalcula sin ella.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
