"use client";

import { useState } from "react";

import {
  Ancho,
  CampoDinero,
  CampoFecha,
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
import { actualizar, crear } from "@/lib/crud";
import type { CampoContrato, Datos } from "@/lib/campos";
import { categoriasDe, opcionesDeCategoria, type Categoria } from "@/lib/categorias";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { siguienteIdPersonal, type CostoPersonal } from "@/lib/egresos";
import { formatearNumero, formatearPesos } from "@/lib/formato";

/** Primer día del mes en curso. */
const mesActual = () => new Date().toISOString().slice(0, 8) + "01";

type Borrador = {
  contrato_id: string;
  categoria_id: string;
  faena: string;
  periodo: string;
  dotacion: number;
  horas_hombre: number;
  sueldo_bruto: number;
  hh_reemplazo: number;
  hh_parada_planta: number;
  hh_feriado_compensado: number;
  hh_apoyo_oficina: number;
  hh_otras: number;
  horas_extra_monto: number;
  total_no_imponible: number;
  otros_haberes: number;
  leyes_sociales: number;
};

function borradorDe(p: CostoPersonal | null, contratos: ContratoBreve[]): Borrador {
  if (!p) {
    return {
      contrato_id: contratos[0]?.id ?? "",
      categoria_id: "",
      faena: "",
      periodo: mesActual(),
      dotacion: 0,
      horas_hombre: 0,
      sueldo_bruto: 0,
      hh_reemplazo: 0,
      hh_parada_planta: 0,
      hh_feriado_compensado: 0,
      hh_apoyo_oficina: 0,
      hh_otras: 0,
      horas_extra_monto: 0,
      total_no_imponible: 0,
      otros_haberes: 0,
      leyes_sociales: 0,
    };
  }
  return {
    contrato_id: p.contratoId,
    categoria_id: p.categoriaId ?? "",
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
    horas_extra_monto: p.horasExtraMonto,
    total_no_imponible: p.totalNoImponible,
    otros_haberes: p.otrosHaberes,
    leyes_sociales: p.leyesSociales,
  };
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

  /* Misceláneos separa "Personal" de "HH Extra" y Torres no: por eso la línea
     se elige y no se deduce. */
  const propias = categoriasDe(categorias, f.datos.contrato_id, "personal");

  function elegirContrato(id: string) {
    if (id !== f.datos.contrato_id) setPropios({});
    f.cambiar("contrato_id", id);
    if (!categoriasDe(categorias, id, "personal").some((c) => c.id === f.datos.categoria_id)) {
      f.cambiar("categoria_id", "");
    }
  }

  /* Los dos totales, igual que en la nómina. Se muestran mientras se escribe;
     quien los guarda es el trigger de la base. */
  /* Las horas extra del mes: la suma de sus motivos. El costo va aparte, porque
     el valor de la hora cambia mes a mes y no se puede derivar uno del otro. */
  const horasExtra =
    f.datos.hh_reemplazo +
    f.datos.hh_parada_planta +
    f.datos.hh_feriado_compensado +
    f.datos.hh_apoyo_oficina +
    f.datos.hh_otras;

  const totalHaberes =
    f.datos.sueldo_bruto +
    f.datos.horas_extra_monto +
    f.datos.total_no_imponible +
    f.datos.otros_haberes;

  const costoTotal = totalHaberes + f.datos.leyes_sociales;
  const porHora = f.datos.horas_hombre > 0 ? costoTotal / f.datos.horas_hombre : 0;
  const valorHoraExtra = horasExtra > 0 ? f.datos.horas_extra_monto / horasExtra : 0;

  // El código no se teclea: se arma solo con el contrato y el mes.
  const codigo = editando
    ? registro.id
    : siguienteIdPersonal(registros, f.datos.contrato_id, f.datos.periodo);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fila = { ...f.datos, categoria_id: f.datos.categoria_id || null, datos: propios };

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

            <CampoSeleccion
              etiqueta="Categoría de costo"
              requerido
              opciones={opcionesDeCategoria(categorias, f.datos.contrato_id, "personal")}
              ayuda={
                propias.length === 0
                  ? "Este contrato todavía no tiene categorías de personal definidas."
                  : "En qué línea de la planilla entra este costo."
              }
              {...f.campo("categoria_id")}
            />

            <CampoFecha
              etiqueta="Mes"
              requerido
              ayuda="El día 1 del mes que se está cargando."
              {...f.campo("periodo")}
            />

            <CampoTexto etiqueta="Faena" marcador="Planta Química Coya Sur" {...f.campo("faena")} />

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

            <CampoDinero
              etiqueta="Sueldo bruto"
              requerido
              ayuda="La remuneración imponible del mes, como viene en la nómina."
              {...f.campo("sueldo_bruto")}
            />

            {/* Las HH extra van por motivo: todas se pagan sobre horas, y
                "cuánto de este mes fue parada de planta" es lo que se discute
                con el mandante. Con un solo número no se puede responder. */}
            <Ancho>
              <div className="border-t border-mist pt-5">
                <h3 className="font-display text-sm font-semibold text-ink">
                  Horas extraordinarias
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  En horas, por motivo, como en la planilla. El costo va aparte.
                </p>
              </div>
            </Ancho>

            <CampoNumero
              etiqueta="Reemplazo por vacaciones o licencias"
              min={0}
              sufijo="HH"
              {...f.campo("hh_reemplazo")}
            />

            <CampoNumero
              etiqueta="Parada de planta"
              min={0}
              sufijo="HH"
              {...f.campo("hh_parada_planta")}
            />

            <CampoNumero
              etiqueta="Feriado compensado"
              min={0}
              sufijo="HH"
              {...f.campo("hh_feriado_compensado")}
            />

            <CampoNumero
              etiqueta="Apoyo oficina"
              min={0}
              sufijo="HH"
              {...f.campo("hh_apoyo_oficina")}
            />

            <CampoNumero
              etiqueta="Otras"
              min={0}
              sufijo="HH"
              ayuda="El resto de las horas extra. Acá va la diferencia si el total no calza con tu planilla."
              {...f.campo("hh_otras")}
            />

            <CampoDinero
              etiqueta="Costo total de las HH extra"
              ayuda="En pesos, como viene en la nómina. No se calcula: el valor de la hora cambia mes a mes."
              {...f.campo("horas_extra_monto")}
            />

            <Ancho>
              <div className="flex flex-col gap-1.5 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3">
                <p className="flex items-baseline justify-between gap-4 text-sm text-ink-soft">
                  Total HH extra
                  <span className="font-display text-lg font-semibold tabular-nums text-ink">
                    {formatearNumero(horasExtra)} HH
                  </span>
                </p>
                <p className="text-xs leading-relaxed text-ink-soft">
                  {valorHoraExtra > 0
                    ? `Suma de los cinco motivos. Sale a ${formatearPesos(Math.round(valorHoraExtra))} la hora.`
                    : "Suma de los cinco motivos. No se escribe."}
                </p>
              </div>
            </Ancho>

            <Ancho>
              <div className="border-t border-mist pt-5">
                <h3 className="font-display text-sm font-semibold text-ink">
                  Resto de los haberes
                </h3>
              </div>
            </Ancho>

            <CampoDinero
              etiqueta="Total no imponible"
              ayuda="Colación, movilización y viáticos."
              {...f.campo("total_no_imponible")}
            />

            <CampoDinero
              etiqueta="Otros haberes"
              ayuda="Aguinaldos y asignaciones que no son HH extra ni no imponible."
              {...f.campo("otros_haberes")}
            />

            <Ancho>
              <div className="flex flex-col gap-1.5 rounded-xl border-2 border-ink bg-white px-4 py-3">
                <p className="flex items-baseline justify-between gap-4">
                  <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                    Total haberes
                  </span>
                  <span className="font-display text-xl font-semibold tabular-nums text-ink">
                    {formatearPesos(totalHaberes)}
                  </span>
                </p>
                <p className="text-xs leading-relaxed text-ink-soft">
                  Sueldo bruto, HH extra, no imponible y otros haberes. No se escribe: si no calza
                  con tu nómina, la diferencia va en «otras» o en «otros haberes».
                </p>
              </div>
            </Ancho>

            <CamposDelContrato
              campos={campos}
              contratoId={f.datos.contrato_id}
              seccion="personal"
              datos={propios}
              alCambiar={setPropios}
            />

            <CampoDinero
              etiqueta="Leyes sociales"
              ayuda={
                totalHaberes > 0
                  ? `Suelen rondar el 23%: ${formatearPesos(Math.round(totalHaberes * 0.23))}.`
                  : "Cotizaciones y cargas sobre la remuneración."
              }
              {...f.campo("leyes_sociales")}
            />

            <Ancho>
              <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                Costo total:{" "}
                <span className="font-semibold text-ink">{formatearPesos(costoTotal)}</span>
                {porHora > 0 && (
                  <span className="ml-2">
                    · {formatearPesos(Math.round(porHora))} por hora hombre
                  </span>
                )}
                <span className="ml-2 text-xs">
                  Total haberes más leyes sociales. Es lo que entra al margen del contrato.
                </span>
                <span className="mt-1.5 block text-xs">
                  Código: <span className="font-mono text-ink">{codigo}</span> · se arma solo con el
                  contrato y el mes.
                </span>
              </p>
            </Ancho>
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
