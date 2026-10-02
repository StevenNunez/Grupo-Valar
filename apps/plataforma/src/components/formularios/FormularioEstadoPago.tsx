"use client";

import { useEffect, useState } from "react";
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
import type { CampoContrato, Datos } from "@/lib/campos";
import { actualizar, crear } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { formatearPesos, formatearUf } from "@/lib/formato";
import type { EstadoEP, EstadoPago, TipoEdp } from "@/lib/ingresos";
import { camposEdp, clavesEdp, montoUfTorres, resolverPlantillaEdp } from "@/lib/plantillas-edp";
import { supabase } from "@/lib/supabase";

const estados: { id: EstadoEP; titulo: string }[] = [
  { id: "presentado", titulo: "Presentado" },
  { id: "aprobado", titulo: "Aprobado" },
  { id: "facturado", titulo: "Facturado" },
  { id: "pagado", titulo: "Pagado" },
  { id: "rechazado", titulo: "Rechazado" },
];

const tipos: { id: TipoEdp; titulo: string }[] = [
  { id: "ordinario", titulo: "Ordinario" },
  { id: "extraordinario", titulo: "Extraordinario" },
];

/** Primer día del mes en curso: el período que cubre un EP nuevo. */
const mesActual = () => new Date().toISOString().slice(0, 8) + "01";
const hoy = () => new Date().toISOString().slice(0, 10);

type Borrador = {
  id: string;
  contrato_id: string;
  numero: number;
  periodo: string;
  tipo_edp: TipoEdp;
  avance_periodo: number;
  monto_neto: number;
  monto_uf: number;
  retenciones: number;
  monto_cobrado: number;
  estado: EstadoEP;
  fecha_presentacion: string;
  fecha_aprobacion: string;
};

function borradorDe(ep: EstadoPago | null): Borrador {
  if (!ep) {
    return {
      id: "",
      contrato_id: "",
      numero: 1,
      periodo: mesActual(),
      tipo_edp: "ordinario",
      avance_periodo: 0,
      monto_neto: 0,
      monto_uf: 0,
      retenciones: 0,
      monto_cobrado: 0,
      estado: "presentado",
      fecha_presentacion: hoy(),
      fecha_aprobacion: "",
    };
  }
  return {
    id: ep.id,
    contrato_id: ep.contratoId,
    numero: ep.numero,
    periodo: ep.periodo,
    tipo_edp: ep.tipoEdp,
    avance_periodo: ep.avancePeriodo,
    monto_neto: ep.montoNeto,
    monto_uf: ep.montoUf ?? 0,
    retenciones: ep.retenciones,
    monto_cobrado: ep.montoCobrado,
    estado: ep.estado,
    fecha_presentacion: ep.fechaPresentacion,
    fecha_aprobacion: ep.fechaAprobacion ?? "",
  };
}

export function FormularioEstadoPago({
  estadoPago,
  contratos,
  campos,
  alCerrar,
  alGuardado,
}: {
  estadoPago: EstadoPago | null;
  contratos: ContratoBreve[];
  campos: CampoContrato[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(estadoPago));
  /* La planilla propia del contrato: cambia sola al cambiar el contrato de
     arriba, porque cada uno se presenta con informacion distinta. */
  const [propios, setPropios] = useState<Datos>(estadoPago?.datos ?? {});
  const [ufConsultada, setUfConsultada] = useState<{ clave: string; valor: number | null } | null>(null);
  const [errorUf, setErrorUf] = useState<string | null>(null);
  const editando = estadoPago !== null;
  const contrato = contratos.find((c) => c.id === f.datos.contrato_id);
  const plantilla = resolverPlantillaEdp(
    estadoPago?.contratoId === f.datos.contrato_id ? estadoPago.datos.plantilla_edp : null,
    contrato?.plantillaEdp ?? "general",
  );
  const claveUf = `${f.datos.contrato_id}:${f.datos.periodo}`;
  const ufGuardada = estadoPago?.contratoId === f.datos.contrato_id &&
    estadoPago.periodo === f.datos.periodo &&
    typeof estadoPago.datos.valor_uf_periodo === "number"
    ? estadoPago.datos.valor_uf_periodo : null;
  const valorUf = ufGuardada ?? (ufConsultada?.clave === claveUf ? ufConsultada.valor : null);
  const camposPlantilla = camposEdp(plantilla, f.datos.tipo_edp);
  const ufConceptos = plantilla === "torres" ? montoUfTorres(propios) : 0;
  // La planilla histórica trae el total en UF, pero no el desglose. Al cargar
  // conceptos nuevos, su suma pasa a ser el total y evita contarlo dos veces.
  const ufTotal = ufConceptos > 0 ? ufConceptos : f.datos.monto_uf;
  const netoCalculado = valorUf !== null && ufTotal > 0 ? Math.round(ufTotal * valorUf) : null;
  const netoVisible = plantilla === "torres" ? netoCalculado : f.datos.monto_neto;
  const hayRetencionesDesglosadas = plantilla === "carpas" &&
    ["retencion_calidad", "retencion_anticipo", "retencion_fiel_cumplimiento"]
      .some((clave) => propios[clave] !== undefined);
  const retencionesDesglosadas = hayRetencionesDesglosadas
    ? ["retencion_calidad", "retencion_anticipo", "retencion_fiel_cumplimiento"]
      .reduce((total, clave) => total + (Number(propios[clave]) || 0), 0)
    : 0;
  const retenciones = hayRetencionesDesglosadas ? retencionesDesglosadas : f.datos.retenciones;
  const camposAdicionales = campos.filter((c) => !clavesEdp(plantilla).includes(c.clave));

  useEffect(() => {
    if (plantilla !== "torres" || !f.datos.periodo) return;
    if (ufGuardada !== null) return;
    let vigente = true;
    const inicio = f.datos.periodo.slice(0, 7) + "-01";
    const [ano, mes] = inicio.split("-").map(Number);
    const fin = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
    void supabase.from("uf_diaria").select("valor").gte("fecha", inicio).lt("fecha", fin)
      .order("fecha", { ascending: false }).limit(1).then(({ data, error }) => {
        if (!vigente) return;
        setUfConsultada({ clave: claveUf, valor: !error && data?.length ? Number(data[0].valor) : null });
        setErrorUf(error ? "No se pudo consultar la UF del período." : null);
      });
    return () => { vigente = false; };
  }, [plantilla, f.datos.periodo, claveUf, ufGuardada]);

  function elegirContrato(id: string) {
    f.cambiar("contrato_id", id);
    f.cambiar("monto_uf", 0);
    f.cambiar("monto_neto", 0);
    setPropios({});
    setUfConsultada(null);
    setErrorUf(null);
  }
  const borrado = useBorrado("estados_pago", estadoPago?.id, () => {
    alGuardado();
    alCerrar();
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { id, ...resto } = f.datos;
    if (plantilla === "torres") {
      if (ufTotal <= 0) {
        setErrorUf("Ingresa el total en UF o el monto de los conceptos de Torres.");
        return;
      }
      if (valorUf === null) {
        setErrorUf("Falta la UF del período para convertir el monto a pesos.");
        return;
      }
    }
    const datosActivos = plantilla !== "general" && f.datos.tipo_edp === "ordinario"
      ? Object.fromEntries(Object.entries(propios).filter(([clave]) => clave !== "monto_gr"))
      : propios;
    // La fecha de aprobación va nula si está vacía: una cadena vacía no es una
    // fecha y Postgres la rechazaría.
    const fila = {
      ...resto,
      monto_neto: plantilla === "torres" ? netoCalculado : resto.monto_neto,
      retenciones,
      fecha_aprobacion: resto.fecha_aprobacion || null,
      // El monto en UF es opcional: cero significa "no se pactó en UF", no cero UF.
      monto_uf: plantilla === "torres" ? ufTotal : resto.monto_uf > 0 ? resto.monto_uf : null,
      datos: plantilla === "torres" && valorUf !== null
        ? { ...datosActivos, plantilla_edp: plantilla, valor_uf_periodo: valorUf }
        : { ...datosActivos, plantilla_edp: plantilla },
    };

    f.enviar(
      () =>
        editando
          ? actualizar("estados_pago", estadoPago.id, fila)
          : crear("estados_pago", { ...fila, id: id.trim() }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar estado de pago" : "Nuevo estado de pago"}
        descripcion={
          editando
            ? `${estadoPago.id} · cada cambio queda registrado con tu nombre y la hora.`
            : "Lo que se apruebe acá es lo que después se puede facturar."
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
                marcador="EP-C2601-10"
                ayuda="Identificador único. No se puede cambiar después."
                {...f.campo("id")}
              />
            )}

            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={[{ id: "", titulo: "— Seleccionar contrato —" }, ...opcionesDeContrato(contratos)]}
              valor={f.datos.contrato_id}
              alCambiar={elegirContrato}
            />

            {f.datos.contrato_id && <>
            <Ancho>
              <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                Plantilla de {contrato?.nombre ?? "este contrato"}: el detalle y el PDF usan los datos de este contrato.
              </p>
            </Ancho>

            <CampoNumero
              etiqueta="N° de EP"
              requerido
              min={1}
              ayuda="Correlativo dentro del contrato."
              {...f.campo("numero")}
            />

            <CampoFecha
              etiqueta="Período"
              requerido
              ayuda="El mes que cubre. Usa el día 1."
              {...f.campo("periodo")}
            />

            <CampoSeleccion
              etiqueta="Tipo"
              requerido
              opciones={tipos}
              ayuda="Extraordinario es lo que se cobra fuera del contrato base."
              {...f.campo("tipo_edp")}
            />

            {plantilla === "general" && <CampoNumero
              etiqueta="Avance del período"
              min={0}
              max={100}
              sufijo="%"
              {...f.campo("avance_periodo")}
            />}

            {plantilla === "torres" ? <>
              {ufConceptos === 0 && <CampoNumero
                etiqueta="Total del EDP en UF"
                requerido
                min={0}
                sufijo="UF"
                ayuda="Úsalo si aún no tienes el desglose por torres, traslados y mantenciones."
                {...f.campo("monto_uf")}
              />}
              <Ancho><p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                {netoCalculado !== null
                  ? <>{formatearUf(ufTotal)} UF × ${formatearUf(valorUf ?? 0)} = <strong className="text-ink">{formatearPesos(netoCalculado)}</strong> netos.</>
                  : "El monto neto se calculará con la UF del período al ingresar el total en UF."}
                {ufConceptos > 0 && " El desglose reemplaza el total en UF ingresado previamente."}
              </p></Ancho>
            </> : <CampoDinero etiqueta="Monto neto" requerido {...f.campo("monto_neto")} />}

            {plantilla === "general" && <CampoNumero
              etiqueta="Monto en UF"
              min={0}
              sufijo="UF"
              ayuda="Solo si el contrato se pactó en UF. Se deja en cero si no."
              {...f.campo("monto_uf")}
            />}

            {plantilla !== "general" && <Ancho>
              <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                {netoVisible === null
                  ? "Al ingresar el monto del EDP se mostrarán el IVA y el total con IVA."
                  : <>Neto: <strong className="text-ink">{formatearPesos(netoVisible)}</strong>
                    {" · "}IVA referencial (19%): <strong className="text-ink">{formatearPesos(Math.round(netoVisible * 0.19))}</strong>
                    {" · "}Total con IVA: <strong className="text-ink">{formatearPesos(netoVisible + Math.round(netoVisible * 0.19))}</strong></>}
              </p>
            </Ancho>}

            {hayRetencionesDesglosadas ? <Ancho>
              <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                Retenciones del contrato: <strong className="text-ink">{formatearPesos(retenciones)}</strong>.
              </p>
            </Ancho> : <CampoDinero
              etiqueta="Retención de garantía"
              ayuda="Lo que el mandante retiene hasta el cierre."
              {...f.campo("retenciones")}
            />}

            <CampoDinero
              etiqueta="Cobrado"
              ayuda="Lo efectivamente pagado por el mandante contra este EP."
              {...f.campo("monto_cobrado")}
            />

            <CampoSeleccion etiqueta="Estado" requerido opciones={estados} {...f.campo("estado")} />

            <CampoFecha
              etiqueta="Fecha de presentación"
              requerido
              {...f.campo("fecha_presentacion")}
            />

            <CampoFecha
              etiqueta="Fecha de aprobación"
              ayuda="Se deja vacía mientras el mandante no lo apruebe."
              {...f.campo("fecha_aprobacion")}
            />

            <Ancho>
              <p className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft">
                A cobrar:{" "}
                <span className="font-semibold text-ink">
                  {plantilla === "torres" && netoCalculado === null
                    ? "—"
                    : formatearPesos((plantilla === "torres" ? netoCalculado ?? 0 : f.datos.monto_neto) - retenciones)}
                </span>
                <span className="ml-2 text-xs">Neto menos la retención de garantía.</span>
              </p>
            </Ancho>

            {camposPlantilla.length > 0 && <Ancho>
              <h3 className="border-t border-mist pt-5 font-display text-sm font-semibold text-ink">Detalle de {contrato?.nombre}</h3>
            </Ancho>}
            {camposPlantilla.map((campo) => {
              const valor = propios[campo.clave];
              const cambiar = (v: string | number) => setPropios((previo) => ({ ...previo, [campo.clave]: v }));
              if (campo.tipo === "texto") return <CampoTexto key={campo.clave} etiqueta={campo.etiqueta} valor={typeof valor === "string" ? valor : ""} alCambiar={cambiar} />;
              if (campo.tipo === "moneda") return <CampoDinero key={campo.clave} etiqueta={campo.etiqueta} valor={Number(valor) || 0} alCambiar={cambiar} />;
              return <CampoNumero key={campo.clave} etiqueta={campo.etiqueta} sufijo={campo.unidad} min={0} valor={Number(valor) || 0} alCambiar={cambiar} />;
            })}

            {errorUf && <Ancho><p role="alert" className="text-sm text-[#a52f24]">{errorUf}</p></Ancho>}

            <CamposDelContrato
              campos={camposAdicionales}
              contratoId={f.datos.contrato_id}
              seccion="estado_pago"
              datos={propios}
              alCambiar={setPropios}
            />
            </>}
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear estado de pago"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar estado de pago"
        detalle={`Se va a eliminar ${estadoPago?.id ?? ""}. Si tiene una factura asociada, la factura queda sin su EP de origen.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
