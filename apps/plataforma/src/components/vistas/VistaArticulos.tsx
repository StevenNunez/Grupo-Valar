"use client";

import { useMemo, useState } from "react";
import { Chip } from "../ui/Chip";
import {
  Ancho,
  CampoNumero,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Dialogo,
  Pie,
  useFormulario,
} from "../ui/Formulario";
import { Tabla, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";
import {
  buscarArticulos,
  cargarArticulos,
  cargarEquivalencias,
  familias,
  guardarArticulo,
  nombreFamilia,
  siguienteCodigo,
  type Articulo,
  type BorradorArticulo,
  type EquivalenciaProveedor,
  type Familia,
} from "@/lib/articulos";

/**
 * El maestro de artículos.
 *
 * La columna que importa es «Nombre técnico». Faena pide "lentes de seguridad
 * oscuros" y el proveedor cotiza "LENTE MAX FENIX IN OUT": ese segundo nombre
 * es el único con el que el proveedor sabe qué mandar, y hasta ahora se
 * aprendía en cada compra y se perdía. Acá queda escrito, y es el que sale
 * impreso en la solicitud de cotización.
 *
 * Los códigos son los de las planillas de bodega (EPP-LEN-02, HM-009): quien
 * busca en el estante y quien busca acá tienen que encontrar lo mismo.
 */

type Filtrado = "todos" | Familia | "sin_tecnico" | "bajo_minimo";

export function VistaArticulos() {
  const { estado, recargar } = useConsulta<Articulo[]>(cargarArticulos);
  const edicion = useEdicion<Articulo>("articulos");

  return (
    <>
      <Encabezado
        titulo="Artículos"
        descripcion="Qué compra Valar y cómo se llama cada cosa. El nombre técnico es el que entiende el proveedor: es el que sale impreso en la solicitud de cotización."
        acciones={<BotonNuevo permiso="articulos.editar" onClick={edicion.abrirNuevo}>Nuevo artículo</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos filas={datos} edicion={edicion} />
            {edicion.editando && (
              <FormularioArticulo
                articulo={edicion.registro}
                articulos={datos}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial
          tabla="articulos"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}
    </>
  );
}

function Contenidos({
  filas,
  edicion,
}: {
  filas: Articulo[];
  edicion: ReturnType<typeof useEdicion<Articulo>>;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todos");
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const porFiltro =
      filtro === "todos"
        ? filas
        : filtro === "sin_tecnico"
          ? filas.filter((a) => !a.nombreTecnico)
          : filtro === "bajo_minimo"
            ? filas.filter((a) => a.bajoMinimo)
            : filas.filter((a) => a.familia === filtro);

    return buscarArticulos(porFiltro, busqueda);
  }, [filas, filtro, busqueda]);

  const conTecnico = filas.filter((a) => a.nombreTecnico).length;
  const bajos = filas.filter((a) => a.bajoMinimo);

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Todavía no hay artículos cargados
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
          Se cargan de una vez desde la planilla de bodega con{" "}
          <code className="rounded bg-mist px-1.5 py-0.5 text-xs">npm run articulos</code>,
          conservando los códigos con que están rotulados en el estante.
        </p>
      </div>
    );
  }

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Artículos",
            valor: String(filas.length),
            nota: `${filas.filter((a) => a.activo).length} activos`,
          },
          {
            etiqueta: "Con nombre técnico",
            valor: String(conTecnico),
            nota:
              conTecnico === filas.length
                ? "Todos listos para pedir"
                : `${filas.length - conTecnico} se piden con el nombre de faena`,
            acento: conTecnico === filas.length ? "bueno" : "aviso",
          },
          {
            etiqueta: "Bajo stock mínimo",
            valor: String(bajos.length),
            nota: bajos.length === 0 ? "Ninguno" : "Según la última toma de bodega",
            acento: bajos.length > 0 ? "critico" : "bueno",
          },
          {
            etiqueta: "Con proveedor conocido",
            valor: String(filas.filter((a) => a.proveedores > 0).length),
            nota: "Se sabe a quién pedírselos",
          },
        ]}
      />

      <Panel
        titulo="Catálogo"
        nota={`${visibles.length} de ${filas.length} artículos`}
        filtros={
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cualquiera de los dos nombres…"
              aria-label="Buscar artículo"
              className="w-56 rounded-full border border-mist-deep px-4 py-1.5 text-xs text-ink outline-none focus:border-cyan"
            />
            <Filtro
              etiqueta="Familia"
              opciones={[
                { id: "todos" as Filtrado, titulo: "Todos" },
                ...familias.map((f) => ({ id: f.id as Filtrado, titulo: f.titulo })),
                { id: "sin_tecnico" as Filtrado, titulo: "Sin nombre técnico" },
                { id: "bajo_minimo" as Filtrado, titulo: "Bajo mínimo" },
              ]}
              valor={filtro}
              alCambiar={setFiltro}
            />
          </div>
        }
      >
        <Tabla
          columnas={columnas(edicion)}
          filas={visibles}
          claveDe={(a) => a.id}
          vacio="Ningún artículo con este filtro."
        />
      </Panel>
    </>
  );
}

const columnas = (edicion: ReturnType<typeof useEdicion<Articulo>>): Columna<Articulo>[] => [
  {
    clave: "articulo",
    titulo: "Artículo",
    encabezado: true,
    celda: (a) => (
      <>
        <span className="block font-semibold text-ink">{a.nombre}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {a.id}
          {a.especificacion ? ` · ${a.especificacion}` : ""}
        </span>
      </>
    ),
  },
  {
    clave: "tecnico",
    titulo: "Nombre técnico",
    celda: (a) =>
      a.nombreTecnico ? (
        <span className="text-ink">{a.nombreTecnico}</span>
      ) : (
        <span className="text-[#8a5a09]">Se pide con el nombre de faena</span>
      ),
  },
  {
    clave: "familia",
    titulo: "Familia",
    celda: (a) => <span className="text-ink-soft">{nombreFamilia[a.familia]}</span>,
  },
  {
    clave: "stock",
    titulo: "Stock",
    derecha: true,
    celda: (a) =>
      a.stockActual === null ? (
        <span className="text-ink-soft">—</span>
      ) : (
        <>
          <span className={a.bajoMinimo ? "font-semibold text-[#a52f24]" : "text-ink"}>
            {formatearNumero(a.stockActual)}
          </span>
          {a.stockMinimo !== null && (
            <span className="mt-0.5 block text-xs text-ink-soft">
              mín. {formatearNumero(a.stockMinimo)}
            </span>
          )}
        </>
      ),
  },
  {
    clave: "proveedores",
    titulo: "Proveedores",
    celda: (a) =>
      a.proveedores === 0 ? (
        <span className="text-ink-soft">—</span>
      ) : (
        <>
          <span className="text-ink">{a.proveedores}</span>
          {a.mejorPrecio !== null && (
            <span className="mt-0.5 block text-xs text-ink-soft">
              desde {formatearPesos(a.mejorPrecio)}
            </span>
          )}
        </>
      ),
  },
  {
    clave: "estado",
    titulo: "",
    celda: (a) => (a.activo ? null : <Chip tono="neutro">Inactivo</Chip>),
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (a) => (
      <button
        type="button"
        onClick={() => edicion.abrirEdicion(a)}
        className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        Editar
      </button>
    ),
  },
];

/* ── Alta y edición ───────────────────────────────────────────────────────── */

function borradorDe(a: Articulo | null, articulos: Articulo[]): BorradorArticulo {
  if (!a) {
    return {
      id: siguienteCodigo(articulos, "insumos"),
      nombre: "",
      nombre_tecnico: "",
      especificacion: "",
      unidad: "un",
      familia: "insumos",
      stock_actual: null,
      stock_minimo: null,
      categoria_sugerida_id: "",
      activo: true,
      observaciones: "",
    };
  }
  return {
    id: a.id,
    nombre: a.nombre,
    nombre_tecnico: a.nombreTecnico ?? "",
    especificacion: a.especificacion ?? "",
    unidad: a.unidad,
    familia: a.familia,
    stock_actual: a.stockActual,
    stock_minimo: a.stockMinimo,
    categoria_sugerida_id: a.categoriaSugeridaId ?? "",
    activo: a.activo,
    observaciones: a.observaciones ?? "",
  };
}

function FormularioArticulo({
  articulo,
  articulos,
  alCerrar,
  alGuardado,
}: {
  articulo: Articulo | null;
  articulos: Articulo[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<BorradorArticulo>(borradorDe(articulo, articulos));
  const editando = articulo !== null;

  return (
    <Dialogo
      titulo={editando ? articulo.nombre : "Nuevo artículo"}
      descripcion={
        editando
          ? `${articulo.id} · el nombre técnico es el que se le manda al proveedor`
          : "El código se propone según la familia. Los que vienen de bodega conservan el suyo."
      }
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          f.enviar(
            () => guardarArticulo(f.datos, editando),
            () => {
              alGuardado();
              alCerrar();
            },
          );
        }}
      >
        <Campos>
          <CampoTexto
            etiqueta="Código"
            requerido
            deshabilitado={editando}
            ayuda={editando ? "No se cambia: es el rótulo del estante." : "El de bodega, si ya tiene."}
            {...f.campo("id")}
          />

          <CampoSeleccion
            etiqueta="Familia"
            requerido
            opciones={familias}
            valor={f.datos.familia}
            alCambiar={(v: Familia) => {
              f.cambiar("familia", v);
              if (!editando) f.cambiar("id", siguienteCodigo(articulos, v));
            }}
          />

          <Ancho>
            <CampoTexto
              etiqueta="Nombre"
              requerido
              marcador="Lentes de seguridad oscuros"
              ayuda="Como lo pide faena. Es el nombre con el que alguien lo busca."
              {...f.campo("nombre")}
            />
          </Ancho>

          <Ancho>
            <CampoTexto
              etiqueta="Nombre técnico"
              marcador="LENTE MAX FENIX IN OUT"
              ayuda="Como lo vende el proveedor. Es el que sale impreso en la solicitud de cotización: sin él, hay que explicarle por teléfono qué se necesita."
              {...f.campo("nombre_tecnico")}
            />
          </Ancho>

          <CampoTexto
            etiqueta="Especificación"
            marcador="XL · 5 mts · NX-2"
            ayuda="Talla, medida o modelo."
            {...f.campo("especificacion")}
          />
          <CampoTexto etiqueta="Unidad" marcador="un" {...f.campo("unidad")} />

          <CampoNumero
            etiqueta="Stock actual"
            min={0}
            ayuda="Última toma de bodega. No se descuenta solo al despachar."
            valor={f.datos.stock_actual ?? 0}
            alCambiar={(v) => f.cambiar("stock_actual", v)}
          />
          <CampoNumero
            etiqueta="Stock mínimo"
            min={0}
            ayuda="Bajo esto, la pantalla lo marca en rojo."
            valor={f.datos.stock_minimo ?? 0}
            alCambiar={(v) => f.cambiar("stock_minimo", v)}
          />

          <Ancho>
            <CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} />
          </Ancho>
        </Campos>

        {editando && <Equivalencias articuloId={articulo.id} />}

        <Pie error={f.error} guardando={f.guardando} alCancelar={alCerrar} />
      </form>
    </Dialogo>
  );
}

/** Cómo le llama cada proveedor, y a cuánto lo vendió la última vez. */
function Equivalencias({ articuloId }: { articuloId: string }) {
  const { estado } = useConsulta<EquivalenciaProveedor[]>(() =>
    cargarEquivalencias(articuloId),
  );

  if (estado.estado !== "listo" || estado.datos.length === 0) return null;

  return (
    <section className="border-t border-mist px-6 py-5">
      <h3 className="font-display text-sm font-semibold text-ink">
        Cómo le llama cada proveedor
      </h3>
      <p className="mt-1 text-xs text-ink-soft">
        Se aprende solo al cargar cada cotización. Sirve para reconocer el artículo la
        próxima vez y para ver si el precio subió.
      </p>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {estado.datos.map((e) => (
          <li
            key={e.proveedorId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-mist/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-ink">{e.nombreProveedor}</span>
              <span className="block text-xs text-ink-soft">
                {e.proveedor}
                {e.sku ? ` · ${e.sku}` : ""}
              </span>
            </span>
            {e.ultimoPrecio !== null && (
              <span className="shrink-0 text-right">
                <span className="block font-semibold tabular-nums text-ink">
                  {formatearPesos(e.ultimoPrecio)}
                </span>
                {e.ultimaFecha && (
                  <span className="block text-xs text-ink-soft">
                    {formatearFecha(e.ultimaFecha)}
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
