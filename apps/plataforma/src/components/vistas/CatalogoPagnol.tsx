"use client";

import { useEffect, useMemo, useState } from "react";
import { Chip } from "../ui/Chip";
import { Dialogo } from "../ui/Formulario";
import { Tabla, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Filtro, Panel, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/formato";
import { catalogoDePagnol, existenciasDeMaterial } from "@/lib/pagnol/navegador";
import type { ActivoPagnol, ExistenciasPagnol, MaterialPagnol, Resultado } from "@/lib/pagnol/tipos";
import { useFiltro } from "@/lib/vista-guardada";

/**
 * El catálogo de Valar tal como está en Pagnol: materiales (con su stock) y
 * activos (con su contrato y su pañol). Es solo lectura: Pagnol es la fuente
 * de verdad, aquí no se copia nada; cuando algo cambia allá, el aviso limpia
 * la caché y la próxima carga ya trae el dato nuevo.
 */

const POR_VEZ = 100;

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function traer<T>(pedir: () => Promise<Resultado<T> | { ok: false; error: string }>): Promise<T[]> {
  const r = await pedir();
  if (!r.ok) throw new Error(r.error);
  return r.datos;
}

const bajoMinimo = (m: MaterialPagnol) => m.stock_actual != null && m.stock_minimo != null && m.stock_actual < m.stock_minimo;

function Buscador({ valor, alCambiar, texto }: { valor: string; alCambiar: (v: string) => void; texto: string }) {
  return (
    <input
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      placeholder={texto}
      aria-label={texto}
      className="w-60 rounded-full border border-mist-deep px-4 py-1.5 text-xs text-ink outline-none focus:border-cyan"
    />
  );
}

/** Muestra de a 100 filas: la tabla completa de 400 se siente lenta. */
function Paginado<T>({ filas, columnas, claveDe, vacio }: { filas: T[]; columnas: Columna<T>[]; claveDe: (f: T) => string; vacio: string }) {
  const [pagina, setPagina] = useState({ filas, cuantas: POR_VEZ });
  // Cambiar el filtro vuelve al principio (se ajusta al renderizar, sin efecto).
  if (pagina.filas !== filas) setPagina({ filas, cuantas: POR_VEZ });
  const cuantas = pagina.filas === filas ? pagina.cuantas : POR_VEZ;
  const setCuantas = (f: (c: number) => number) => setPagina({ filas, cuantas: f(cuantas) });
  return (
    <>
      <Tabla columnas={columnas} filas={filas.slice(0, cuantas)} claveDe={claveDe} vacio={vacio} />
      {filas.length > cuantas && (
        <div className="border-t border-mist px-6 py-4 text-center lg:px-8">
          <button
            type="button"
            onClick={() => setCuantas((c) => c + POR_VEZ)}
            className="rounded-full border border-mist-deep px-4 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Mostrar {Math.min(POR_VEZ, filas.length - cuantas)} más ({filas.length - cuantas} sin mostrar)
          </button>
        </div>
      )}
    </>
  );
}

/* ── Materiales ───────────────────────────────────────────────────────────── */

type FiltroMaterial = "todos" | "bajo_minimo" | "sin_minimo" | "consumibles" | "rastreables";

export function MaterialesDePagnol() {
  const { estado } = useConsulta<MaterialPagnol[]>(() => traer(catalogoDePagnol.materiales));
  const [detalle, setDetalle] = useState<MaterialPagnol | null>(null);
  return (
    <>
      <Contenido consulta={estado}>{(datos) => <TablaMateriales filas={datos} verPanoles={setDetalle} />}</Contenido>
      {detalle && <DialogoExistencias material={detalle} alCerrar={() => setDetalle(null)} />}
    </>
  );
}

function TablaMateriales({ filas, verPanoles }: { filas: MaterialPagnol[]; verPanoles: (m: MaterialPagnol) => void }) {
  const [filtro, setFiltro] = useFiltro<FiltroMaterial>("articulos:pagnol:materiales", "todos");
  const [categoria, setCategoria] = useFiltro<string>("articulos:pagnol:categoria", "todas");
  const [busqueda, setBusqueda] = useState("");

  const categorias = useMemo(() => [...new Set(filas.map((m) => m.categoria).filter((c): c is string => !!c))].sort(), [filas]);
  const visibles = useMemo(() => {
    const q = norm(busqueda.trim());
    return filas.filter((m) => {
      if (categoria !== "todas" && m.categoria !== categoria) return false;
      if (filtro === "bajo_minimo" && !bajoMinimo(m)) return false;
      if (filtro === "sin_minimo" && m.stock_minimo != null) return false;
      if (filtro === "consumibles" && m.rastreable) return false;
      if (filtro === "rastreables" && !m.rastreable) return false;
      return !q || norm(`${m.codigo} ${m.nombre} ${m.descripcion ?? ""} ${m.categoria ?? ""}`).includes(q);
    });
  }, [filas, filtro, categoria, busqueda]);

  const bajos = filas.filter(bajoMinimo).length;
  const conMinimo = filas.filter((m) => m.stock_minimo != null).length;

  const columnas: Columna<MaterialPagnol>[] = [
    {
      clave: "material",
      titulo: "Material",
      encabezado: true,
      celda: (m) => (
        <>
          <span className="block font-semibold text-ink">{m.nombre}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {m.codigo}
            {m.descripcion ? ` · ${m.descripcion}` : ""}
          </span>
        </>
      ),
    },
    { clave: "categoria", titulo: "Categoría", celda: (m) => <span className="text-ink-soft">{m.categoria ?? "—"}</span> },
    {
      clave: "tipo",
      titulo: "Tipo",
      celda: (m) => <span className="text-ink-soft">{m.rastreable ? "Rastreable (activo por unidad)" : "Consumible"}</span>,
    },
    {
      clave: "stock",
      titulo: "Stock",
      derecha: true,
      celda: (m) =>
        m.stock_actual == null ? (
          <span className="text-ink-soft">—</span>
        ) : (
          <>
            <span className={bajoMinimo(m) ? "font-semibold text-[#a52f24]" : "text-ink"}>
              {formatearNumero(m.stock_actual)} <span className="text-xs text-ink-soft">{m.unidad_medida}</span>
            </span>
            {m.stock_minimo != null && <span className="mt-0.5 block text-xs text-ink-soft">mín. {formatearNumero(m.stock_minimo)}</span>}
          </>
        ),
    },
    { clave: "estado", titulo: "", celda: (m) => (m.activo ? null : <Chip tono="neutro">Inactivo</Chip>) },
    {
      clave: "acciones",
      titulo: "",
      derecha: true,
      celda: (m) => (
        <button
          type="button"
          onClick={() => verPanoles(m)}
          className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Ver pañoles
        </button>
      ),
    },
  ];

  return (
    <>
      <Resumen
        datos={[
          { etiqueta: "Materiales", valor: String(filas.length), nota: `${filas.filter((m) => m.activo).length} activos en Pagnol` },
          {
            etiqueta: "Bajo el mínimo",
            valor: String(bajos),
            nota: bajos === 0 ? "Ninguno" : "Piden reposición",
            acento: bajos > 0 ? "critico" : "bueno",
          },
          {
            etiqueta: "Con mínimo definido",
            valor: String(conMinimo),
            nota: conMinimo === 0 ? "Sin mínimo no hay aviso automático" : `${filas.length - conMinimo} sin mínimo`,
            acento: conMinimo === 0 ? "aviso" : undefined,
          },
          { etiqueta: "Rastreables", valor: String(filas.filter((m) => m.rastreable).length), nota: "Se controlan por unidad" },
        ]}
      />
      <Panel
        titulo="Materiales"
        nota={`${visibles.length} de ${filas.length} · datos de Pagnol, solo lectura`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Buscar">
              <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Código, nombre o categoría…" />
            </CampoFiltro>
            <CampoFiltro etiqueta="Categoría">
              <Desplegable
                etiqueta="Categoría"
                grupos={[{ opciones: [{ id: "todas", titulo: "Todas las categorías" }, ...categorias.map((c) => ({ id: c, titulo: c }))] }]}
                valor={categoria}
                alCambiar={setCategoria}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Mostrar">
              <Filtro
                etiqueta="Mostrar"
                opciones={[
                  { id: "todos" as FiltroMaterial, titulo: "Todos" },
                  { id: "bajo_minimo" as FiltroMaterial, titulo: "Bajo mínimo" },
                  { id: "sin_minimo" as FiltroMaterial, titulo: "Sin mínimo" },
                  { id: "consumibles" as FiltroMaterial, titulo: "Consumibles" },
                  { id: "rastreables" as FiltroMaterial, titulo: "Rastreables" },
                ]}
                valor={filtro}
                alCambiar={setFiltro}
              />
            </CampoFiltro>
          </>
        }
      >
        <Paginado filas={visibles} columnas={columnas} claveDe={(m) => m.id} vacio="Ningún material con este filtro." />
      </Panel>
    </>
  );
}

/** Dónde está el stock de un material: por pañol y por contrato. */
function DialogoExistencias({ material, alCerrar }: { material: MaterialPagnol; alCerrar: () => void }) {
  const [datos, setDatos] = useState<ExistenciasPagnol | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    existenciasDeMaterial(material.id).then((r) => {
      if (!vigente) return;
      if (r.ok) setDatos(r.existencias);
      else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [material.id]);

  return (
    <Dialogo titulo={material.nombre} descripcion={`${material.codigo} · dónde está el stock en Pagnol`} abierto alCerrar={alCerrar} ancho="max-w-xl">
      {error ? (
        <p className="text-sm text-[#8a5a09]">{error}</p>
      ) : !datos ? (
        <p className="text-sm text-ink-soft">Consultando Pagnol…</p>
      ) : datos.existencias.length === 0 ? (
        <p className="text-sm text-ink-soft">Este material no tiene existencias registradas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {datos.existencias.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-mist-deep px-3 py-2 text-sm">
              <span className="text-ink">
                {e.panol?.nombre ?? "Sin pañol"}
                <span className="block text-xs text-ink-soft">{e.contrato?.nombre ?? "Stock central (sin contrato)"}</span>
              </span>
              <span className="font-semibold text-ink">
                {formatearNumero(e.cantidad)} <span className="text-xs font-normal text-ink-soft">{material.unidad_medida}</span>
              </span>
            </li>
          ))}
          <li className="px-3 pt-1 text-right text-sm text-ink-soft">
            Total {formatearNumero(datos.stock_actual ?? 0)}
            {material.stock_minimo != null ? ` · mínimo ${formatearNumero(material.stock_minimo)}` : ""}
          </li>
        </ul>
      )}
    </Dialogo>
  );
}

/* ── Activos ──────────────────────────────────────────────────────────────── */

type FiltroEstado = "todos" | ActivoPagnol["estado"];

const nombreEstado: Record<ActivoPagnol["estado"], string> = {
  operativo: "Operativo",
  en_mantencion: "En mantención",
  de_baja: "De baja",
  extraviado: "Extraviado",
};
const tonoEstado = { operativo: "bueno", en_mantencion: "aviso", de_baja: "neutro", extraviado: "critico" } as const;

/**
 * En Pagnol un activo llega a un contrato solo por una solicitud de material, y
 * mientras está entregado. Al devolverse vuelve a su pañol (o a la Oficina
 * Central) y el contrato queda en null: «sin contrato» no es un faltante, es
 * un activo disponible. Entregado: panol null y responsable con quien lo tiene.
 */
const entregado = (a: ActivoPagnol) => !!a.contrato || (!a.panol && !!a.responsable);

const SIN_CONTRATO = "__sin_contrato";
const SIN_PANOL = "__sin_panol";

export function ActivosDePagnol() {
  const { estado } = useConsulta<ActivoPagnol[]>(() => traer(catalogoDePagnol.activos));
  return <Contenido consulta={estado}>{(datos) => <TablaActivos filas={datos} />}</Contenido>;
}

function TablaActivos({ filas }: { filas: ActivoPagnol[] }) {
  const [estadoF, setEstadoF] = useFiltro<FiltroEstado>("articulos:pagnol:estado", "todos");
  const [contrato, setContrato] = useFiltro<string>("articulos:pagnol:contrato", "todos");
  const [panol, setPanol] = useFiltro<string>("articulos:pagnol:panol", "todos");
  const [busqueda, setBusqueda] = useState("");

  const contratos = useMemo(() => [...new Set(filas.map((a) => a.contrato?.nombre).filter((c): c is string => !!c))].sort(), [filas]);
  const panoles = useMemo(() => [...new Set(filas.map((a) => a.panol?.nombre).filter((c): c is string => !!c))].sort(), [filas]);
  const enContratos = filas.filter((a) => !!a.contrato).length;
  const disponibles = filas.filter((a) => !entregado(a)).length;

  const visibles = useMemo(() => {
    const q = norm(busqueda.trim());
    return filas.filter((a) => {
      if (estadoF !== "todos" && a.estado !== estadoF) return false;
      if (contrato === SIN_CONTRATO ? !!a.contrato : contrato !== "todos" && a.contrato?.nombre !== contrato) return false;
      if (panol === SIN_PANOL ? !!a.panol : panol !== "todos" && a.panol?.nombre !== panol) return false;
      return !q || norm(`${a.codigo} ${a.nombre} ${a.responsable ?? ""} ${a.contrato?.nombre ?? ""} ${a.panol?.nombre ?? ""}`).includes(q);
    });
  }, [filas, estadoF, contrato, panol, busqueda]);

  const valorTotal = visibles.reduce((t, a) => t + Number(a.valor_compra ?? 0), 0);

  const columnas: Columna<ActivoPagnol>[] = [
    {
      clave: "activo",
      titulo: "Activo",
      encabezado: true,
      celda: (a) => (
        <>
          <span className="block font-semibold text-ink">{a.nombre}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{a.codigo}</span>
        </>
      ),
    },
    { clave: "estado", titulo: "Estado", celda: (a) => <Chip tono={tonoEstado[a.estado]}>{nombreEstado[a.estado]}</Chip> },
    {
      clave: "contrato",
      titulo: "Contrato",
      celda: (a) =>
        a.contrato ? (
          <>
            <span className="text-ink">{a.contrato.nombre}</span>
            <span className="mt-0.5 block text-xs text-ink-soft">Entregado por solicitud</span>
          </>
        ) : (
          <span className="text-ink-soft">Sin contrato</span>
        ),
    },
    {
      clave: "panol",
      titulo: "Dónde está",
      celda: (a) => <span className="text-ink-soft">{a.panol?.nombre ?? (entregado(a) ? "Entregado" : (a.ubicacion ?? "—"))}</span>,
    },
    {
      clave: "responsable",
      titulo: "Lo tiene",
      celda: (a) => <span className="text-ink-soft">{a.responsable ?? "—"}</span>,
    },
    {
      clave: "valor",
      titulo: "Compra",
      derecha: true,
      celda: (a) =>
        a.valor_compra == null ? (
          <span className="text-ink-soft">—</span>
        ) : (
          <>
            <span className="text-ink">{formatearPesos(a.valor_compra)}</span>
            {a.fecha_compra && <span className="mt-0.5 block text-xs text-ink-soft">{formatearFecha(a.fecha_compra.slice(0, 10))}</span>}
          </>
        ),
    },
  ];

  return (
    <>
      <Resumen
        datos={[
          { etiqueta: "Activos", valor: String(filas.length), nota: "Registrados en Pagnol" },
          { etiqueta: "Operativos", valor: String(filas.filter((a) => a.estado === "operativo").length), nota: `${filas.filter((a) => a.estado === "en_mantencion").length} en mantención`, acento: "bueno" },
          { etiqueta: "En un contrato", valor: String(enContratos), nota: "Entregados por solicitud de material" },
          { etiqueta: "En pañol u oficina", valor: String(disponibles), nota: "Disponibles, sin contrato" },
          { etiqueta: "Valor de compra", valor: formatearPesos(valorTotal), nota: `${visibles.length} activos en el filtro` },
        ]}
      />
      <Panel
        titulo="Activos"
        nota={`${visibles.length} de ${filas.length} · datos de Pagnol, solo lectura`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Buscar">
              <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Código, nombre, responsable…" />
            </CampoFiltro>
            <CampoFiltro etiqueta="Contrato">
              <Desplegable
                etiqueta="Contrato"
                grupos={[{ opciones: [{ id: "todos", titulo: "Todos los contratos" }, { id: SIN_CONTRATO, titulo: "Sin contrato (disponibles)" }, ...contratos.map((c) => ({ id: c, titulo: c }))] }]}
                valor={contrato}
                alCambiar={setContrato}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Pañol">
              <Desplegable
                etiqueta="Pañol"
                grupos={[{ opciones: [{ id: "todos", titulo: "Todos los pañoles" }, { id: SIN_PANOL, titulo: "Sin pañol" }, ...panoles.map((p) => ({ id: p, titulo: p }))] }]}
                valor={panol}
                alCambiar={setPanol}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Estado">
              <Filtro
                etiqueta="Estado"
                opciones={[
                  { id: "todos" as FiltroEstado, titulo: "Todos" },
                  { id: "operativo" as FiltroEstado, titulo: "Operativos" },
                  { id: "en_mantencion" as FiltroEstado, titulo: "En mantención" },
                  { id: "de_baja" as FiltroEstado, titulo: "De baja" },
                ]}
                valor={estadoF}
                alCambiar={setEstadoF}
              />
            </CampoFiltro>
          </>
        }
      >
        <Paginado filas={visibles} columnas={columnas} claveDe={(a) => a.id} vacio="Ningún activo con este filtro." />
      </Panel>
    </>
  );
}
