"use client";

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
import { actualizar, crear } from "@/lib/crud";
import { borrarContratoDemo, estadosContrato, type ResumenBorradoContratoDemo } from "@/lib/contratos";
import { useUsuario } from "@/lib/sesion";
import { plantillasEdp, type PlantillaEdp } from "@/lib/plantillas-edp";
import {
  formasContrato,
  modalidades,
  type Contrato,
  type EstadoContrato,
  type FormaContrato,
  type Modalidad,
} from "@/lib/control-de-gestion";

type Borrador = {
  id: string;
  nombre: string;
  cliente: string;
  faena: string;
  presupuesto: number;
  inicio: string;
  termino: string;
  modalidad: Modalidad;
  tipo: FormaContrato;
  plantilla_edp: PlantillaEdp;
  estado: EstadoContrato;
};

function borradorDe(c: Contrato | null): Borrador {
  return {
    id: c?.id ?? "",
    nombre: c?.nombre ?? "",
    cliente: c?.cliente ?? "",
    faena: c?.faena ?? "",
    presupuesto: c?.presupuesto ?? 0,
    inicio: c?.inicio ?? "",
    termino: c?.termino ?? "",
    modalidad: c?.modalidad ?? "largo_plazo",
    tipo: c?.forma ?? "precios_unitarios",
    plantilla_edp: c?.plantillaEdp ?? "general",
    estado: c?.estado ?? "activo",
  };
}

export function FormularioContrato({
  contrato,
  alCerrar,
  alGuardado,
}: {
  contrato: Contrato | null;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(contrato));
  const editando = contrato !== null;
  const [presupuestoEditado, setPresupuestoEditado] = useState(false);
  const usuario = useUsuario();
  const esDemo = usuario.empresa === "demo";
  const [confirmandoDemo, setConfirmandoDemo] = useState(false);
  const [consultandoDemo, setConsultandoDemo] = useState(false);
  const [eliminandoDemo, setEliminandoDemo] = useState(false);
  const [errorDemo, setErrorDemo] = useState<string | null>(null);
  const [resumenDemo, setResumenDemo] = useState<ResumenBorradoContratoDemo | null>(null);

  /* El plazo no es un campo: son dos fechas restadas. Guardarlo sería tener el
     mismo dato dos veces, y uno de los dos siempre termina desactualizado. */
  const plazo =
    f.datos.inicio && f.datos.termino
      ? Math.round(
          (new Date(`${f.datos.termino}T12:00:00`).getTime() -
            new Date(`${f.datos.inicio}T12:00:00`).getTime()) /
            86_400_000,
        )
      : null;
  const borrado = useBorrado("contratos", contrato?.id, () => {
    alGuardado();
    alCerrar();
  });

  async function abrirBorrado() {
    if (!contrato) return;
    if (!esDemo) {
      borrado.abrir();
      return;
    }
    setConfirmandoDemo(true);
    setConsultandoDemo(true);
    setErrorDemo(null);
    setResumenDemo(null);
    try {
      setResumenDemo(await borrarContratoDemo(contrato.id));
    } catch (error) {
      setErrorDemo(error instanceof Error ? error.message : String(error));
    } finally {
      setConsultandoDemo(false);
    }
  }

  async function confirmarBorradoDemo() {
    if (!contrato || !resumenDemo || resumenDemo.adjuntos > 0) return;
    setEliminandoDemo(true);
    setErrorDemo(null);
    try {
      await borrarContratoDemo(contrato.id, true);
      alGuardado();
      alCerrar();
    } catch (error) {
      setErrorDemo(error instanceof Error ? error.message : String(error));
    } finally {
      setEliminandoDemo(false);
    }
  }

  const detalleDemo = (() => {
    if (!resumenDemo) return "Calculando los datos relacionados con este contrato…";
    const otros = resumenDemo.total - 1 - resumenDemo.estados_pago - resumenDemo.compras -
      resumenDemo.servicios - resumenDemo.costos_personal - resumenDemo.facturas -
      resumenDemo.categorias_costo;
    const partes = [
      ["estados de pago", resumenDemo.estados_pago],
      ["compras", resumenDemo.compras],
      ["servicios", resumenDemo.servicios],
      ["personal", resumenDemo.costos_personal],
      ["facturas", resumenDemo.facturas],
      ["categorías", resumenDemo.categorias_costo],
      ["otros datos", otros],
    ].filter(([, cantidad]) => Number(cantidad) > 0)
      .map(([nombre, cantidad]) => `${cantidad} ${nombre}`).join(" · ");
    const alcance = partes
      ? `Se borrará ${contrato?.id} junto con ${resumenDemo.total - 1} registros: ${partes}.`
      : `Se borrará ${contrato?.id}. No tiene registros relacionados.`;
    return `${alcance} ${resumenDemo.adjuntos > 0
      ? `Hay ${resumenDemo.adjuntos} respaldos: elimínalos primero desde sus registros.`
      : "Solo afecta a demo."}`;
  })();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { id, ...campos } = f.datos;
    const fila = {
      ...campos,
      inicio: campos.inicio || null,
      presupuesto: editando && contrato.presupuesto == null && !presupuestoEditado
        ? null : campos.presupuesto,
    };
    f.enviar(
      () =>
        editando
          ? actualizar("contratos", contrato.id, fila)
          : crear("contratos", { ...fila, id: id.trim() }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar contrato" : "Nuevo contrato"}
        descripcion={
          editando
            ? `${contrato.id} · el costo real no se edita acá: sale de sus compras y su personal.`
            : "El contrato es la base de todo: sin él no se pueden cargar estados de pago, facturas ni compras."
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
                marcador="C-2618"
                ayuda="Identificador único. No se puede cambiar después."
                {...f.campo("id")}
              />
            )}

            <CampoTexto etiqueta="Cliente" requerido marcador="SQM" {...f.campo("cliente")} />

            <Ancho>
              <CampoTexto
                etiqueta="Nombre del contrato"
                requerido
                marcador="Fundaciones planta de cal"
                {...f.campo("nombre")}
              />
            </Ancho>

            <CampoTexto etiqueta="Faena" requerido marcador="Coya Sur" {...f.campo("faena")} />

            <CampoDinero
              etiqueta="Presupuesto"
              requerido={!editando || contrato.presupuesto != null}
              ayuda="Monto neto del contrato. Se puede dejar sin monto total en contratos recurrentes."
              valor={f.datos.presupuesto}
              alCambiar={(valor) => { f.cambiar("presupuesto", valor); setPresupuestoEditado(true); }}
            />

            <CampoFecha
              etiqueta="Inicio"
              ayuda="Desde cuándo rige. Con el término, de acá sale el plazo."
              {...f.campo("inicio")}
            />

            <CampoFecha etiqueta="Término contractual" requerido {...f.campo("termino")} />

            <CampoSeleccion
              etiqueta="Modalidad"
              requerido
              opciones={modalidades}
              ayuda={modalidades.find((m) => m.id === f.datos.modalidad)?.ayuda}
              {...f.campo("modalidad")}
            />

            <CampoSeleccion
              etiqueta="Forma de contratación"
              requerido
              opciones={formasContrato}
              ayuda={formasContrato.find((t) => t.id === f.datos.tipo)?.ayuda}
              {...f.campo("tipo")}
            />

            <CampoSeleccion
              etiqueta="Plantilla de Estado de Pago"
              requerido
              opciones={plantillasEdp}
              ayuda={plantillasEdp.find((p) => p.id === f.datos.plantilla_edp)?.ayuda}
              {...f.campo("plantilla_edp")}
            />

            {/* Vigente, por vencer o cerrado salen solos de las fechas. Lo único
                que el calendario no sabe es si se canceló antes: eso se marca
                acá, y por eso no aparece al crear uno. */}
            {editando && (
              <CampoSeleccion
                etiqueta="Estado"
                requerido
                opciones={estadosContrato}
                ayuda={
                  f.datos.estado === "cancelado"
                    ? "Terminó antes de plazo. Sale de los vigentes y de los montos por ejecutar."
                    : "La vigencia sale de las fechas. Márcalo cancelado solo si terminó antes de plazo."
                }
                {...f.campo("estado")}
              />
            )}

            <Ancho>
              <p className="rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 text-sm text-ink-soft">
                {plazo === null ? (
                  <>
                    El plazo se calcula con el inicio y el término. Carga las dos fechas y
                    aparece acá.
                  </>
                ) : (
                  <>
                    Plazo:{" "}
                    <span className="font-semibold text-ink">
                      {plazo} {plazo === 1 ? "día" : "días"}
                    </span>
                    {plazo >= 30 && (
                      <span className="ml-1">({(plazo / 30.44).toFixed(1)} meses)</span>
                    )}
                    <span className="ml-2 text-xs">
                      No se escribe. Los anexos que extiendan el plazo lo corren solos.
                    </span>
                  </>
                )}
              </p>
            </Ancho>
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear contrato"}
            alEliminar={editando ? abrirBorrado : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={esDemo ? confirmandoDemo : borrado.confirmando}
        titulo="Eliminar contrato"
        detalle={esDemo ? detalleDemo : `Se va a eliminar ${contrato?.id ?? ""} — ${contrato?.nombre ?? ""}. Si tiene movimientos asociados, primero hay que eliminarlos.`}
        error={esDemo ? errorDemo : borrado.error}
        procesando={esDemo ? eliminandoDemo : borrado.borrando}
        deshabilitado={esDemo && (consultandoDemo || !resumenDemo || resumenDemo.adjuntos > 0 || Boolean(errorDemo))}
        alCancelar={esDemo ? () => setConfirmandoDemo(false) : borrado.cerrar}
        alConfirmar={esDemo ? confirmarBorradoDemo : borrado.confirmar}
      />
    </>
  );
}
