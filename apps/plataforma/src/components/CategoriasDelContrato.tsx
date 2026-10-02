"use client";

import { useState } from "react";
import { Chip } from "./ui/Chip";
import {
  Ancho,
  CampoDinero,
  CampoNumero,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Dialogo,
  Pie,
  useFormulario,
} from "./ui/Formulario";
import {
  cargarCategorias,
  familias,
  idDeCategoria,
  type Categoria,
  type Familia,
} from "@/lib/categorias";
import { useConsulta } from "@/lib/consulta";
import type { Contrato } from "@/lib/control-de-gestion";
import { actualizar, crear, eliminar } from "@/lib/crud";
import { formatearPesos } from "@/lib/formato";
import { usePuede } from "@/lib/sesion";

/**
 * Las categorías de costo de un contrato: de qué se compone su costo.
 *
 * NO HAY UNA LISTA COMÚN. En el control de gestión de Valar, Misceláneos se
 * abre en Personal, Camioneta, RRHH/Logística, EPP, Traslado, Reembolsables y
 * HH Extra; Torres en Personal, Torres, Herramientas, Camioneta e Insumos. Cada
 * contrato se presenta distinto al mandante y por eso se costea distinto.
 *
 * Lo que se defina acá es lo que aparece en el desplegable "Categoría de costo"
 * al cargar una compra, un servicio o el personal de ese contrato.
 *
 * DOS COSAS QUE NO SON DECORATIVAS:
 *
 *   · La FAMILIA dice en qué formulario aparece. Sin ella, Egresos no podría
 *     seguir teniendo Compras, Servicios y Personal.
 *
 *   · AFECTA A IVA evita la regla "se asume bruto y se divide por 1,19" que la
 *     planilla aplica a ojo sobre todo lo que no sea sueldo. Cuando una línea
 *     ya venía neta, esa regla le resta un IVA que nunca tuvo e infla el
 *     margen.
 */

export function CategoriasDelContrato({
  contrato,
  alCerrar,
}: {
  contrato: Contrato;
  alCerrar: () => void;
}) {
  const { estado, recargar } = useConsulta<Categoria[]>(cargarCategorias);
  const [editando, setEditando] = useState<Categoria | Familia | null>(null);
  const puedeEditar = usePuede("contratos.editar");

  const suyas =
    estado.estado === "listo" ? estado.datos.filter((c) => c.contratoId === contrato.id) : [];
  const presupuesto = suyas.reduce((t, c) => t + c.presupuestoMensual, 0);

  return (
    <>
      <Dialogo
        titulo="Categorías de costo"
        descripcion={`${contrato.id} · de qué se compone el costo de este contrato`}
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
              Estas son las líneas en que se abre el costo de{" "}
              <strong className="text-ink">{contrato.nombre}</strong>. Aparecen en el desplegable
              «Categoría de costo» al cargar un egreso de este contrato, y son las que el Dashboard
              suma para la composición de costos.
              {presupuesto > 0 && (
                <span className="mt-1 block">
                  Presupuesto mensual total:{" "}
                  <strong className="text-ink">{formatearPesos(presupuesto)}</strong>.
                </span>
              )}
            </p>

            <div className="mt-6 flex flex-col gap-6">
              {familias.map((fam) => {
                const delGrupo = suyas
                  .filter((c) => c.familia === fam.id)
                  .sort((a, b) => a.orden - b.orden);

                return (
                  <section key={fam.id}>
                    <div className="flex items-center justify-between gap-4 border-b border-mist pb-2">
                      <h3 className="font-display text-sm font-semibold text-ink">{fam.titulo}</h3>
                      {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => setEditando(fam.id)}
                        className="shrink-0 rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                      >
                        Agregar categoría
                      </button>
                      )}
                    </div>

                    {delGrupo.length === 0 ? (
                      <p className="mt-3 text-sm text-ink-soft">
                        Sin categorías: los egresos de {fam.titulo.toLowerCase()} de este contrato
                        quedan sin línea a la que imputarse.
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-2">
                        {delGrupo.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setEditando(c)}
                              disabled={!puedeEditar}
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-mist px-3.5 py-2.5 text-left transition-colors hover:border-ink disabled:cursor-default disabled:hover:border-mist"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink">
                                  {c.nombre}
                                </span>
                                <span className="mt-0.5 block text-xs text-ink-soft">
                                  {c.presupuestoMensual > 0
                                    ? `${formatearPesos(c.presupuestoMensual)} al mes`
                                    : "Sin presupuesto definido"}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {!c.afectaIva && <Chip tono="info">Sin IVA</Chip>}
                                {!c.activa && <Chip tono="neutro">Apagada</Chip>}
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
        <FormularioCategoria
          contrato={contrato}
          categoria={typeof editando === "string" ? null : editando}
          familia={typeof editando === "string" ? editando : editando.familia}
          existentes={suyas}
          alCerrar={() => setEditando(null)}
          alGuardado={recargar}
        />
      )}
    </>
  );
}

/* ── Definir una categoría ────────────────────────────────────────────────── */

type Borrador = {
  nombre: string;
  familia: Familia;
  afecta_iva: string;
  presupuesto_mensual: number;
  orden: number;
  activa: string;
};

const siNo = [
  { id: "no", titulo: "No" },
  { id: "si", titulo: "Sí" },
];

function FormularioCategoria({
  contrato,
  categoria,
  familia,
  existentes,
  alCerrar,
  alGuardado,
}: {
  contrato: Contrato;
  categoria: Categoria | null;
  familia: Familia;
  existentes: Categoria[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const editando = categoria !== null;

  const f = useFormulario<Borrador>({
    nombre: categoria?.nombre ?? "",
    familia: categoria?.familia ?? familia,
    // El personal no lleva IVA: es la respuesta correcta por defecto ahí.
    afecta_iva: categoria
      ? categoria.afectaIva
        ? "si"
        : "no"
      : familia === "personal"
        ? "no"
        : "si",
    presupuesto_mensual: categoria?.presupuestoMensual ?? 0,
    orden: categoria?.orden ?? existentes.length,
    activa: categoria === null || categoria.activa ? "si" : "no",
  });

  const [borrando, setBorrando] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = f.datos;

    const fila = {
      contrato_id: contrato.id,
      nombre: d.nombre.trim(),
      familia: d.familia,
      afecta_iva: d.afecta_iva === "si",
      presupuesto_mensual: d.presupuesto_mensual,
      orden: d.orden,
      activa: d.activa === "si",
    };

    f.enviar(
      () =>
        editando
          ? actualizar("categorias_costo", categoria.id, fila)
          : crear("categorias_costo", {
              ...fila,
              id: idDeCategoria(contrato.id, fila.nombre),
            }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  async function quitar() {
    if (!categoria) return;
    setBorrando(true);
    try {
      await eliminar("categorias_costo", categoria.id);
      alGuardado();
      alCerrar();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Dialogo
      titulo={editando ? `Categoría: ${categoria.nombre}` : "Nueva categoría"}
      descripcion={`${contrato.id} · ${contrato.nombre}`}
      abierto
      alCerrar={alCerrar}
    >
      <form onSubmit={onSubmit}>
        <Campos>
          <Ancho>
            <CampoTexto
              etiqueta="Nombre"
              requerido
              marcador="EPP Básicos"
              ayuda="Como se llama en la planilla del contrato."
              {...f.campo("nombre")}
            />
          </Ancho>

          <CampoSeleccion
            etiqueta="Formulario"
            requerido
            opciones={familias}
            ayuda="En cuál de los tres formularios de Egresos aparece."
            {...f.campo("familia")}
          />

          <CampoSeleccion
            etiqueta="Afecta a IVA"
            opciones={siNo}
            ayuda="Los sueldos y las HH extra no llevan IVA y entran íntegros al costo."
            {...f.campo("afecta_iva")}
          />

          <CampoDinero
            etiqueta="Presupuesto mensual"
            ayuda="Contra esto se avisa cuando un mes se pasa. Cero es «sin control»."
            {...f.campo("presupuesto_mensual")}
          />

          <CampoNumero
            etiqueta="Orden"
            min={0}
            ayuda="En qué posición aparece dentro de su formulario."
            {...f.campo("orden")}
          />

          <CampoSeleccion
            etiqueta="Activa"
            opciones={siNo}
            ayuda="Apagarla la saca del desplegable sin borrar lo ya cargado con ella."
            {...f.campo("activa")}
          />
        </Campos>

        <Pie
          error={f.error}
          guardando={f.guardando || borrando}
          alCancelar={alCerrar}
          alEliminar={editando ? () => void quitar() : undefined}
          textoGuardar={editando ? "Guardar cambios" : "Agregar categoría"}
        />
      </form>
    </Dialogo>
  );
}
