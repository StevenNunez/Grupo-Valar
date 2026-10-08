"use client";

import { SelectorAnexo } from "../ui/SelectorAnexo";
import { useState } from "react";

import {
  Ancho,
  CampoMes,
  CampoNumero,
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
import { FichaHaberes } from "./FichaHaberes";
import { errorDeHaberes, haberesEnCero, haberesParaGuardar, type Haberes } from "@/lib/haberes";
import { actualizar, crear } from "@/lib/crud";
import type { CampoContrato, Datos } from "@/lib/campos";
import { categoriasDe, type Categoria } from "@/lib/categorias";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { siguienteIdPersonal, type CostoPersonal } from "@/lib/egresos";

/** Primer día del mes en curso. */
const mesActual = () => new Date().toISOString().slice(0, 8) + "01";

type Borrador = Haberes & {
  contrato_id: string;
  /** El anexo al que se carga; vacío = contrato base. */
  anexo_id: string;
  faena: string;
  periodo: string;
  dotacion: number;
  horas_hombre: number;
};

function borradorDe(p: CostoPersonal | null, contratos: ContratoBreve[]): Borrador {
  if (!p) {
    return {
      ...haberesEnCero,
      contrato_id: contratos[0]?.id ?? "",
      anexo_id: "",
      faena: contratos[0]?.faena ?? "",
      periodo: mesActual(),
      dotacion: 0,
      horas_hombre: 0,
    };
  }
  return {
    contrato_id: p.contratoId,
    anexo_id: p.anexoId ?? "",
    faena: p.faena,
    periodo: p.periodo,
    dotacion: p.dotacion,
    horas_hombre: p.horasHombre,
    sueldo_bruto: p.sueldoBruto,
    hh_reemplazo: p.hhReemplazo,
    hh_parada_planta: p.hhParadaPlanta,
    hh_feriado_compensado: p.hhFeriadoCompensado,
    hh_apoyo_oficina: p.hhApoyoOficina,
    hh_otras: p.hhOtras,
    ...p.montosHh,
    horas_extra_monto: p.horasExtraMonto,
    total_no_imponible: p.totalNoImponible,
    otros_haberes: p.otrosHaberes,
    otros_haberes_detalle: p.otrosHaberesDetalle,
    descuento_trabajador: p.descuentoTrabajador,
    leyes_sociales: p.leyesSociales,
    aporte_patronal: p.aportePatronal,
  };
}

/**
 * La línea de la planilla donde entra el costo. No se pregunta: se está
 * cargando Personal, así que va a la línea de personal del contrato (la
 * primera, si hubiera más de una). Si el contrato no tiene ninguna, queda sin
 * categoría y el Dashboard lo muestra como "Personal" igual.
 */
function categoriaDePersonal(categorias: Categoria[], contratoId: string) {
  return categoriasDe(categorias, contratoId, "personal")[0]?.id ?? null;
}

export function FormularioPersonal({
  registro,
  registros,
  contratos,
  campos,
  categorias,
  alCerrar,
  alGuardado,
}: {
  registro: CostoPersonal | null;
  /** Los que ya existen, para armar el código correlativo. */
  registros: CostoPersonal[];
  contratos: ContratoBreve[];
  /** La planilla propia de cada contrato. */
  campos: CampoContrato[];
  /** Las categorías de costo, propias de cada contrato. */
  categorias: Categoria[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(registro, contratos));
  /* Los valores de la planilla del contrato viven aparte del borrador: cambian
     de forma según el contrato, y mezclarlos obligaría a rehacer el borrador
     entero cada vez que se cambia el desplegable de arriba. */
  const [propios, setPropios] = useState<Datos>(registro?.datos ?? {});
  const editando = registro !== null;
  const borrado = useBorrado("costos_personal", registro?.id, () => {
    alGuardado();
    alCerrar();
  });

  // La faena viene del contrato: elegir el contrato ya dice dónde se trabaja.
  function elegirContrato(id: string) {
    if (id !== f.datos.contrato_id) setPropios({});
    const contrato = contratos.find((c) => c.id === id);
    f.setDatos((d) => ({ ...d, contrato_id: id, faena: contrato?.faena || d.faena }));
  }
  const faenaDelContrato = contratos.find((c) => c.id === f.datos.contrato_id)?.faena ?? "";

  // El código no se teclea: se arma solo con el contrato y el mes.
  const codigo = editando
    ? registro.id
    : siguienteIdPersonal(registros, f.datos.contrato_id, f.datos.periodo);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problema = errorDeHaberes(f.datos);
    if (problema) {
      f.setError(problema);
      return;
    }
    const fila = {
      ...haberesParaGuardar(f.datos),
      faena: f.datos.faena || faenaDelContrato,
      anexo_id: f.datos.anexo_id || null,
      // Al editar se respeta la línea que ya tenía; al crear, la de personal del contrato.
      categoria_id: editando ? registro.categoriaId : categoriaDePersonal(categorias, f.datos.contrato_id),
      datos: propios,
    };

    f.enviar(
      () =>
        editando
          ? actualizar("costos_personal", registro.id, fila)
          : crear("costos_personal", { ...fila, id: codigo }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar costo de personal" : "Nuevo costo de personal"}
        descripcion={
          editando
            ? `${registro.id} · se respalda con la nómina de pagos, que se adjunta a la fila.`
            : "Los haberes del mes, como vienen en la nómina de pagos. Los totales se calculan solos."
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
            <SelectorAnexo contratoId={f.datos.contrato_id} valor={f.datos.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />

            <CampoMes
              etiqueta="Mes"
              requerido
              ayuda="El mes de la nómina que se está cargando."
              {...f.campo("periodo")}
            />

            {faenaDelContrato ? (
              <Ancho>
                <p className="rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 text-sm text-ink-soft">
                  Faena: <span className="font-semibold text-ink">{f.datos.faena || faenaDelContrato}</span>
                  <span className="ml-2 text-xs">Viene del contrato.</span>
                </p>
              </Ancho>
            ) : (
              <CampoTexto
                etiqueta="Faena"
                marcador="Planta Química Coya Sur"
                ayuda="El contrato no tiene faena registrada. Se puede completar en Contratos."
                {...f.campo("faena")}
              />
            )}

            <FichaHaberes
              datos={f.datos}
              campo={f.campo}
              horasHombre={f.datos.horas_hombre}
              antesDeHhExtra={
                <>
                  <CampoNumero
                    etiqueta="Dotación"
                    min={0}
                    sufijo="pers."
                    ayuda="Personas en la faena ese mes."
                    {...f.campo("dotacion")}
                  />
                  <CampoNumero
                    etiqueta="HH ordinarias"
                    min={0}
                    sufijo="HH"
                    ayuda="Horas de jornada normal. Las extras van más abajo."
                    {...f.campo("horas_hombre")}
                  />
                </>
              }
              camposPropios={
                <CamposDelContrato
                  campos={campos}
                  contratoId={f.datos.contrato_id}
                  seccion="personal"
                  datos={propios}
                  alCambiar={setPropios}
                />
              }
              nota={<>Código: <span className="font-mono text-ink">{codigo}</span> · se arma solo con el contrato y el mes.</>}
            />
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear registro"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar costo de personal"
        detalle={`Se va a eliminar ${registro?.id ?? ""}. El costo real del contrato se recalcula sin este mes.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
