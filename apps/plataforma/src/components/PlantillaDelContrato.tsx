"use client";

import { useState } from "react";
import { Chip } from "./ui/Chip";
import {
  Ancho,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Dialogo,
  Pie,
  useFormulario,
} from "./ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import {
  cargarCamposDeContrato,
  claveDesde,
  idDeCampo,
  secciones,
  tiposCampo,
  type CampoContrato,
  type Seccion,
  type TipoCampo,
} from "@/lib/campos";
import type { Contrato } from "@/lib/control-de-gestion";
import { actualizar, crear, eliminar } from "@/lib/crud";
import { plantillasEdp } from "@/lib/plantillas-edp";
import { usePuede } from "@/lib/sesion";

/**
 * La planilla del contrato: qué campos pide este contrato al cargar un costo.
 *
 * Cada contrato se presenta distinto al mandante, y por eso pide información
 * distinta. Acá se define cuál, por formulario. Lo que se declare acá aparece
 * abajo del núcleo fijo cuando alguien elige este contrato en Personal,
 * Servicios, Compras o al presentar el estado de pago.
 *
 * Lo que NO se define acá: el neto, el IVA, la categoría y el tipo de gasto.
 * Esos son fijos en todos los contratos porque son los que el Dashboard suma
 * entre uno y otro. Los campos de acá describen; los fijos cuentan.
 */

export function PlantillaDelContrato({
  contrato,
  alCerrar,
}: {
  contrato: Contrato;
  alCerrar: () => void;
}) {
  const { estado, recargar } = useConsulta<CampoContrato[]>(() =>
    cargarCamposDeContrato(contrato.id),
  );
  const [editando, setEditando] = useState<CampoContrato | Seccion | null>(null);
  const puedeEditar = usePuede("contratos.editar");

  return (
    <>
      <Dialogo
        titulo="Planilla del contrato"
        descripcion={`${contrato.id} · qué pide este contrato al cargar información`}
        abierto
        alCerrar={alCerrar}
        ancho="max-w-3xl"
      >
        {estado.estado === "cargando" && (
          <p className="px-6 py-12 text-center text-sm text-ink-soft">Cargando…</p>
        )}

        {estado.estado === "error" && (
          <p role="alert" className="px-6 py-12 text-center text-sm text-[#a52f24]">
            {estado.mensaje}
          </p>
        )}

        {estado.estado === "listo" && (
          <div className="px-6 py-6">
            <p className="text-sm leading-relaxed text-ink-soft">
              Estos campos aparecen abajo del formulario cuando alguien elige{" "}
              <strong className="text-ink">{contrato.nombre}</strong>. El neto, el IVA y la
              categoría no se definen acá: son iguales en todos los contratos, porque son
              los que el Dashboard suma entre uno y otro.
            </p>

            <div className="mt-4 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 text-sm text-ink-soft">
              Plantilla de Estado de Pago: <strong className="text-ink">{plantillasEdp.find((p) => p.id === contrato.plantillaEdp)?.titulo ?? "General"}</strong>.
              <span className="ml-1">Se cambia al editar el contrato; aquí se agregan sus campos propios.</span>
            </div>

            <div className="mt-6 flex flex-col gap-6">
              {secciones.map((s) => {
                const suyos = estado.datos.filter((c) => c.seccion === s.id);
                return (
                  <section key={s.id}>
                    <div className="flex items-center justify-between gap-4 border-b border-mist pb-2">
                      <div>
                        <h3 className="font-display text-sm font-semibold text-ink">
                          {s.titulo}
                        </h3>
                        <p className="text-xs text-ink-soft">{s.ayuda}</p>
                      </div>
                      {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => setEditando(s.id)}
                        className="shrink-0 rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                      >
                        Agregar campo
                      </button>
                      )}
                    </div>

                    {suyos.length === 0 ? (
                      <p className="mt-3 text-sm text-ink-soft">
                        Sin campos propios: el formulario sale con el núcleo nomás.
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-2">
                        {suyos.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setEditando(c)}
                              disabled={!puedeEditar}
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-mist px-3.5 py-2.5 text-left transition-colors hover:border-ink disabled:cursor-default disabled:hover:border-mist"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink">
                                  {c.etiqueta}
                                  {c.unidad ? (
                                    <span className="font-normal text-ink-soft"> · {c.unidad}</span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-xs text-ink-soft">
                                  {tiposCampo.find((t) => t.id === c.tipo)?.titulo}
                                  {c.opciones.length > 0 ? ` · ${c.opciones.length} opciones` : ""}
                                  {" · "}
                                  <span className="font-mono">{c.clave}</span>
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {c.obligatorio && <Chip tono="aviso">Obligatorio</Chip>}
                                {c.sumaEnEdp && <Chip tono="info">Suma en el EDP</Chip>}
                                {!c.activo && <Chip tono="neutro">Apagado</Chip>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Dialogo>

      {editando && (
        <FormularioCampo
          contrato={contrato}
          campo={typeof editando === "string" ? null : editando}
          seccion={typeof editando === "string" ? editando : editando.seccion}
          existentes={estado.estado === "listo" ? estado.datos : []}
          alCerrar={() => setEditando(null)}
          alGuardado={recargar}
        />
      )}
    </>
  );
}

/* ── Definir un campo ─────────────────────────────────────────────────────── */

type Borrador = {
  etiqueta: string;
  tipo: TipoCampo;
  unidad: string;
  opciones: string;
  ayuda: string;
  obligatorio: string;
  suma_en_edp: string;
  activo: string;
  orden: number;
};

const siNo = [
  { id: "no", titulo: "No" },
  { id: "si", titulo: "Sí" },
];

function FormularioCampo({
  contrato,
  campo,
  seccion,
  existentes,
  alCerrar,
  alGuardado,
}: {
  contrato: Contrato;
  campo: CampoContrato | null;
  seccion: Seccion;
  existentes: CampoContrato[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const editando = campo !== null;

  const f = useFormulario<Borrador>({
    etiqueta: campo?.etiqueta ?? "",
    tipo: campo?.tipo ?? "texto",
    unidad: campo?.unidad ?? "",
    opciones: campo?.opciones.join(", ") ?? "",
    ayuda: campo?.ayuda ?? "",
    obligatorio: campo?.obligatorio ? "si" : "no",
    suma_en_edp: campo?.sumaEnEdp ? "si" : "no",
    activo: campo === null || campo.activo ? "si" : "no",
    orden:
      campo?.orden ??
      existentes.filter((c) => c.seccion === seccion).length + 1,
  });

  const [borrando, setBorrando] = useState(false);

  // La clave se deriva de la etiqueta: es el nombre con que el valor queda
  // guardado, y si cada uno la escribiera el mismo campo terminaría con dos
  // nombres distintos en dos contratos.
  const clave = campo?.clave ?? claveDesde(f.datos.etiqueta);
  const esNumerico = f.datos.tipo === "numero";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = f.datos;

    const fila = {
      contrato_id: contrato.id,
      seccion,
      clave,
      etiqueta: d.etiqueta.trim(),
      tipo: d.tipo,
      unidad: d.unidad.trim() || null,
      opciones:
        d.tipo === "opcion"
          ? d.opciones.split(",").map((o) => o.trim()).filter(Boolean)
          : [],
      ayuda: d.ayuda.trim() || null,
      obligatorio: d.obligatorio === "si",
      suma_en_edp: esNumerico && d.suma_en_edp === "si",
      activo: d.activo === "si",
      orden: d.orden,
    };

    f.enviar(
      () =>
        editando
          ? actualizar("campos_contrato", campo.id, fila)
          : crear("campos_contrato", { ...fila, id: idDeCampo(contrato.id, seccion, clave) }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  async function quitar() {
    if (!campo) return;
    setBorrando(true);
    try {
      await eliminar("campos_contrato", campo.id);
      alGuardado();
      alCerrar();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Dialogo
      titulo={editando ? `Campo: ${campo.etiqueta}` : "Nuevo campo"}
      descripcion={`${contrato.id} · ${secciones.find((s) => s.id === seccion)?.titulo}`}
      abierto
      alCerrar={alCerrar}
    >
      <form onSubmit={onSubmit}>
        <Campos>
          <Ancho>
            <CampoTexto
              etiqueta="Nombre del campo"
              requerido
              marcador="Cargo"
              ayuda={
                clave
                  ? `Se guarda como «${clave}». No se puede cambiar después de crearlo.`
                  : "Como quieres que aparezca en el formulario."
              }
              {...f.campo("etiqueta")}
            />
          </Ancho>

          <CampoSeleccion
            etiqueta="Tipo"
            requerido
            opciones={tiposCampo}
            ayuda={tiposCampo.find((t) => t.id === f.datos.tipo)?.ayuda}
            {...f.campo("tipo")}
          />

          <CampoTexto
            etiqueta="Unidad"
            marcador="HH"
            ayuda="Lo que va después del número: HH, un, días."
            {...f.campo("unidad")}
          />

          {f.datos.tipo === "opcion" && (
            <Ancho>
              <CampoTexto
                etiqueta="Opciones"
                requerido
                marcador="Supervisor, Maestro eléctrico, Ayudante"
                ayuda="Separadas por coma. Son las alternativas del desplegable."
                {...f.campo("opciones")}
              />
            </Ancho>
          )}

          <Ancho>
            <CampoTexto
              etiqueta="Ayuda"
              marcador="Horas de este cargo en el mes."
              ayuda="El texto chico bajo el campo. Sirve para que no haya dos formas de llenarlo."
              {...f.campo("ayuda")}
            />
          </Ancho>

          <CampoSeleccion
            etiqueta="Obligatorio"
            opciones={siNo}
            ayuda="Se avisa si falta, pero no impide guardar: un dato que falta no puede bloquear un costo que ya ocurrió."
            {...f.campo("obligatorio")}
          />

          {esNumerico && (
            <CampoSeleccion
              etiqueta="Suma en el estado de pago"
              opciones={siNo}
              ayuda="Los campos marcados se pueden totalizar al presentar el EDP."
              {...f.campo("suma_en_edp")}
            />
          )}

          <CampoSeleccion
            etiqueta="Activo"
            opciones={siNo}
            ayuda="Apagarlo lo saca del formulario sin borrar lo ya cargado."
            {...f.campo("activo")}
          />
        </Campos>

        <Pie
          error={f.error}
          guardando={f.guardando || borrando}
          alCancelar={alCerrar}
          alEliminar={editando ? () => void quitar() : undefined}
          textoGuardar={editando ? "Guardar cambios" : "Agregar campo"}
        />
      </form>
    </Dialogo>
  );
}
