"use client";

import { SelectorAnexo } from "../ui/SelectorAnexo";
import { useEffect, useMemo, useState } from "react";
import {
  Ancho,
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
import { etiquetaDe, type Articulo } from "@/lib/articulos";
import { actualizar, crear, eliminar } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import {
  cargarItemsDeSolped,
  prioridades,
  siguienteNumeroSolped,
  tiposGasto,
  type ItemSolped,
  type Prioridad,
  type Solped,
} from "@/lib/abastecimiento";
import type { FilaCategoria } from "@/lib/dashboard";
import { useUsuario } from "@/lib/sesion";
import { CampoConPagnol, unidadDesdePagnol } from "../ui/CampoConPagnol";

/**
 * La solicitud de pedido.
 *
 * NO lleva precios, y no es un olvido: en el proceso real de Valar los precios
 * aparecen recién al cotizar. Lo que se aprueba acá es la necesidad —"¿hace
 * falta esto?"—, y el monto se autoriza después, cuando hay cotización.
 *
 * NO lleva la numeración del mandante —SA, GR, RQM—. El número de requerimiento
 * ya es el número de la solicitud, y el SA identifica un servicio del mandante,
 * no un pedido de materiales: mezclarlos obliga a teclear dos veces lo mismo y a
 * decidir cuál manda cuando no coinciden.
 *
 * Sí lleva el tipo de gasto, que es el campo que decide si lo que se compre va a
 * castigar el margen o se le va a recuperar al mandante.
 */

const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyan";

type Linea = {
  /** Del maestro, cuando se eligió del catálogo. Nulo si se escribió a mano. */
  articulo_id: string;
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  categoria_id: string;
  observacion: string;
  /** El material en Pagnol, si se eligió de su catálogo. Solo la referencia. */
  pagnol_material_id: string;
  pagnol_codigo: string;
  nuevo: boolean;
};

const lineaVacia = (n: number): Linea => ({
  articulo_id: "",
  id: `nueva-${n}-${Math.random().toString(36).slice(2, 8)}`,
  descripcion: "",
  unidad: "un",
  cantidad: 1,
  categoria_id: "",
  observacion: "",
  pagnol_material_id: "",
  pagnol_codigo: "",
  nuevo: true,
});

type Borrador = {
  /** El anexo para el que se pide; vacío = contrato base. La OC lo hereda. */
  anexo_id: string;
  id: string;
  numero: string;
  contrato_id: string;
  solicitante_nombre: string;
  solicitante_cargo: string;
  area: string;
  fecha_emision: string;
  fecha_requerida: string;
  tipo_gasto: "ordinario" | "reembolsable";
  prioridad: Prioridad;
  observaciones: string;
};

const hoy = () => new Date().toISOString().slice(0, 10);

export function FormularioSolped({
  solped,
  todas,
  contratos,
  categorias,
  articulos,
  alCerrar,
  alGuardado,
}: {
  solped: Solped | null;
  todas: Solped[];
  contratos: ContratoBreve[];
  categorias: FilaCategoria[];
  /** El maestro, para autocompletar y dejar el ítem enlazado. */
  articulos: Articulo[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const usuario = useUsuario();
  const editando = solped !== null;

  const f = useFormulario<Borrador>(
    solped
      ? {
          id: solped.id,
          numero: solped.numero,
          contrato_id: solped.contratoId,
          anexo_id: solped.anexoId ?? "",
          solicitante_nombre: solped.solicitanteNombre,
          solicitante_cargo: solped.solicitanteCargo ?? "",
          area: solped.area ?? "",
          fecha_emision: solped.fechaEmision,
          fecha_requerida: solped.fechaRequerida ?? "",
          tipo_gasto: solped.tipoGasto,
          prioridad: solped.prioridad,
          observaciones: "",
        }
      : {
          id: "",
          numero: siguienteNumeroSolped(todas),
          contrato_id: contratos[0]?.id ?? "",
          anexo_id: "",
          // Quien la crea es quien la pide: sale de la sesión, no se teclea.
          solicitante_nombre: usuario.nombre,
          solicitante_cargo: usuario.cargo,
          area: "",
          fecha_emision: hoy(),
          fecha_requerida: "",
          tipo_gasto: "ordinario",
          prioridad: "normal",
          observaciones: "",
        },
  );

  const [lineas, setLineas] = useState<Linea[]>(editando ? [] : [lineaVacia(0)]);
  const [eliminadas, setEliminadas] = useState<string[]>([]);

  const borrado = useBorrado("solped", solped?.id, () => {
    alGuardado();
    alCerrar();
  });

  useEffect(() => {
    if (!solped) return;
    let vigente = true;

    cargarItemsDeSolped(solped.id).then((items) => {
      if (!vigente) return;
      setLineas(
        items.map((i: ItemSolped) => ({
          id: i.id,
          articulo_id: i.articuloId ?? "",
          descripcion: i.descripcion,
          unidad: i.unidad,
          cantidad: i.cantidad,
          categoria_id: i.categoriaId ?? "",
          observacion: i.observacion ?? "",
          pagnol_material_id: i.pagnolMaterialId ?? "",
          pagnol_codigo: "",
          nuevo: false,
        })),
      );
    });

    return () => {
      vigente = false;
    };
    // Solo al montar: la solicitud no cambia mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const delContrato = categorias.filter((c) => c.contratoId === f.datos.contrato_id);
  const opcionesCategoria = [
    { id: "", titulo: "— Sin categoría —" },
    // Una categoría aparece una vez, aunque la vista traiga una fila por mes.
    ...[...new Map(delContrato.map((c) => [c.categoriaId, c])).values()].map((c) => ({
      id: c.categoriaId,
      titulo: c.categoria,
    })),
  ];

  const sinCategoria = lineas.filter((l) => l.descripcion.trim() && !l.categoria_id).length;

  const articulosPorId = useMemo(
    () => new Map(articulos.map((a) => [a.id, a])),
    [articulos],
  );

  /* La lista del navegador devuelve el texto de la opción, no su id. Se busca
     por la etiqueta completa —que incluye el código— y si calza se enlaza; si
     alguien escribió algo suyo, queda como texto libre y el enlace se suelta. */
  const porEtiqueta = useMemo(
    () => new Map(articulos.map((a) => [etiquetaDe(a), a])),
    [articulos],
  );

  function elegirArticulo(id: string, texto: string) {
    const articulo = porEtiqueta.get(texto);
    setLineas((ls) =>
      ls.map((l) =>
        l.id !== id
          ? l
          : articulo
            ? {
                ...l,
                articulo_id: articulo.id,
                descripcion: articulo.nombre,
                unidad: articulo.unidad,
                categoria_id: articulo.categoriaSugeridaId ?? l.categoria_id,
              }
            : { ...l, descripcion: texto, articulo_id: "" },
      ),
    );
  }

  function cambiar(id: string, campo: keyof Linea, valor: unknown) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function quitar(linea: Linea) {
    if (!linea.nuevo) setEliminadas((e) => [...e, linea.id]);
    setLineas((ls) => ls.filter((l) => l.id !== linea.id));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { id, ...campos } = f.datos;

    const cabecera = {
      ...campos,
      solicitante_cargo: campos.solicitante_cargo.trim() || null,
      area: campos.area.trim() || null,
      anexo_id: campos.anexo_id || null,
      fecha_requerida: campos.fecha_requerida || null,
      observaciones: campos.observaciones.trim() || null,
      ...(editando ? {} : { solicitante_id: usuario.id }),
    };

    const solpedId = editando
      ? solped.id
      : id.trim() || `SP-${campos.contrato_id.replace(/^C-/, "")}-${campos.numero.replace(/\D/g, "")}`;

    f.enviar(
      async () => {
        if (editando) await actualizar("solped", solped.id, cabecera);
        else await crear("solped", { ...cabecera, id: solpedId });

        for (const borrada of eliminadas) await eliminar("solped_items", borrada);

        let n = 0;
        for (const l of lineas) {
          if (!l.descripcion.trim()) continue;
          n += 1;
          const fila = {
            solped_id: solpedId,
            linea: n,
            articulo_id: l.articulo_id || null,
            pagnol_material_id: l.pagnol_material_id || null,
            descripcion: l.descripcion.trim(),
            unidad: l.unidad.trim() || "un",
            cantidad: l.cantidad || 1,
            categoria_id: l.categoria_id || null,
            observacion: l.observacion.trim() || null,
          };

          if (l.nuevo) {
            await crear("solped_items", {
              ...fila,
              id: `SPI-${solpedId}-${String(n).padStart(3, "0")}`,
            });
          } else {
            await actualizar("solped_items", l.id, fila);
          }
        }
      },
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? `Solicitud ${solped.numero}` : "Nueva solicitud de pedido"}
        descripcion={
          editando
            ? "Los precios no van acá: llegan al cotizar. Lo que se aprueba es la necesidad."
            : "Qué se necesita, para qué contrato y para cuándo. Sin precios: eso viene después, al cotizar."
        }
        abierto
        alCerrar={alCerrar}
        ancho="max-w-5xl"
      >
        <form onSubmit={onSubmit}>
          <Campos>
            <CampoTexto
              etiqueta="N° de solicitud"
              requerido
              marcador="SOLPED-098"
              ayuda="Viene propuesto con el siguiente de la serie."
              {...f.campo("numero")}
            />

            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={opcionesDeContrato(contratos)}
              {...f.campo("contrato_id")}
            />
            <SelectorAnexo contratoId={f.datos.contrato_id} valor={f.datos.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />

            <CampoTexto
              etiqueta="Solicita"
              requerido
              ayuda="Sale de tu sesión. Es quien firma la solicitud."
              {...f.campo("solicitante_nombre")}
            />

            <CampoTexto
              etiqueta="Cargo"
              marcador="Jefe de Prevención"
              {...f.campo("solicitante_cargo")}
            />

            <CampoTexto etiqueta="Área" marcador="Prevención" {...f.campo("area")} />

            <CampoSeleccion
              etiqueta="Prioridad"
              requerido
              opciones={prioridades}
              {...f.campo("prioridad")}
            />

            <CampoFecha etiqueta="Fecha de emisión" requerido {...f.campo("fecha_emision")} />
            <CampoFecha
              etiqueta="Requerida en obra"
              ayuda="Es lo que convierte la solicitud en un compromiso con una fecha."
              {...f.campo("fecha_requerida")}
            />

            <Ancho>
              <CampoSeleccion
                etiqueta="Tipo de gasto"
                requerido
                opciones={tiposGasto}
                ayuda="Reembolsable = se le cobra al mandante y no descuenta margen. Es el mismo campo que decide la rentabilidad del contrato."
                {...f.campo("tipo_gasto")}
              />
            </Ancho>

            <Ancho>
              <CampoTexto
                etiqueta="Observaciones"
                marcador="Reposición por rotura en turno B"
                {...f.campo("observaciones")}
              />
            </Ancho>
          </Campos>

          {/* ── Lo que se pide ─────────────────────────────────────────────── */}
          <section className="border-t border-mist px-6 py-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">Lo que se pide</h3>
                {sinCategoria > 0 && (
                  <p className="mt-1 text-xs text-[#8a5a09]">
                    {sinCategoria} {sinCategoria === 1 ? "ítem" : "ítems"} sin categoría: ese
                    gasto no va a aparecer en el análisis de rentabilidad.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLineas((ls) => [...ls, lineaVacia(ls.length)])}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Agregar ítem
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    <th className="w-8 py-2 pr-3">N°</th>
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="w-40 py-2 pr-3">Categoría</th>
                    <th className="w-20 py-2 pr-3">UM</th>
                    <th className="w-24 py-2 pr-3 text-right">Cantidad</th>
                    <th className="w-48 py-2 pr-3">Observación</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={l.id} className="border-b border-mist last:border-0">
                      <td className="py-2 pr-3 tabular-nums text-ink-soft">{i + 1}</td>
                      <td className="py-2 pr-3">
                        {/* Autocompleta con el catálogo. Al elegir uno queda
                            enlazado, y con eso la solicitud de cotización sale
                            con el nombre técnico que el proveedor entiende. */}
                        <CampoConPagnol
                          ariaLabel="Descripción"
                          list="catalogo-articulos"
                          valor={l.descripcion}
                          alCambiar={(v) => {
                            // Escribir a mano suelta la referencia a Pagnol: ya no es ese material.
                            cambiar(l.id, "pagnol_material_id", "");
                            elegirArticulo(l.id, v);
                          }}
                          alElegir={(m) =>
                            setLineas((ls) =>
                              ls.map((x) =>
                                x.id === l.id
                                  ? { ...x, articulo_id: "", descripcion: m.nombre, unidad: unidadDesdePagnol(m.unidad_medida), pagnol_material_id: m.id, pagnol_codigo: m.codigo }
                                  : x,
                              ),
                            )
                          }
                          enlazado={l.pagnol_material_id ? l.pagnol_codigo || "enlazado" : null}
                          placeholder="Cinta aisladora color rojo"
                          className={claseCelda}
                        />
                        {l.articulo_id && (
                          <span className="mt-1 block text-[11px] text-ink-soft">
                            {l.articulo_id}
                            {articulosPorId.get(l.articulo_id)?.nombreTecnico
                              ? ` · se pide como «${articulosPorId.get(l.articulo_id)?.nombreTecnico}»`
                              : " · sin nombre técnico todavía"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={l.categoria_id}
                          onChange={(e) => cambiar(l.id, "categoria_id", e.target.value)}
                          className={claseCelda}
                        >
                          {opcionesCategoria.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.titulo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={l.unidad}
                          onChange={(e) => cambiar(l.id, "unidad", e.target.value)}
                          className={claseCelda}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.cantidad}
                          onChange={(e) => cambiar(l.id, "cantidad", Number(e.target.value) || 0)}
                          className={`${claseCelda} text-right tabular-nums`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={l.observacion}
                          onChange={(e) => cambiar(l.id, "observacion", e.target.value)}
                          placeholder="Reposición por rotura"
                          className={claseCelda}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitar(l)}
                          aria-label={`Quitar ítem ${i + 1}`}
                          className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-mist hover:text-[#a52f24]"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12h9.4l.8-12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lineas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-soft">
                        Agrega el primer ítem.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* La lista que alimenta el autocompletado de cada línea. Va una sola
            vez: son los mismos artículos para todas. */}
        <datalist id="catalogo-articulos">
          {articulos
            .filter((a) => a.activo)
            .map((a) => (
              <option key={a.id} value={etiquetaDe(a)} />
            ))}
        </datalist>

        <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            alEliminar={editando ? borrado.abrir : undefined}
            textoGuardar={editando ? "Guardar cambios" : "Crear solicitud"}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar solicitud"
        detalle={`Se va a eliminar ${solped?.numero} con todos sus ítems. Si ya tiene compras asociadas, márcala como anulada en vez de borrarla.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
