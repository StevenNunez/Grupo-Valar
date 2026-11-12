"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Chip } from "../ui/Chip";
import { Buscador } from "../ui/Buscador";
import { Campos, CampoDinero, CampoFecha, CampoSeleccion, CampoTexto, Dialogo, Pie, useFormulario, Ancho } from "../ui/Formulario";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import {
  actualizarDesdePagnol, cargarPaginaActivos, cargarResumenActivos, cargarTodosLosActivos, estadosActivo, guardarActivos,
  propiedades, SIN_IDENTIFICAR, sumaAlPatrimonio,
  type ActivoFila, type CambiosDeActivo, type FiltrosActivos, type Propiedad, type Ubicacion,
} from "@/lib/activos";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha, formatearMonto, formatearPesos } from "@/lib/formato";
import { useListaServidor, useRetardado } from "@/lib/lista-servidor";
import { usePuede } from "@/lib/sesion";
import { useFiltro } from "@/lib/vista-guardada";

/**
 * Los activos de la empresa: qué hay, para qué contrato se compró cada uno,
 * dónde está hoy y cuánto vale (0096, 0109). Pagnol dice qué activos existen; acá se
 * identifican uno a uno o por tandas. Los montos son netos de IVA.
 *
 * La lista es de Valar: abre al instante y trae de a 50, con búsqueda y totales en la
 * base. Pagnol no se consulta al abrir; sus cambios llegan por aviso, o a pedido con
 * «Actualizar desde Pagnol».
 *
 * Caso típico: un activo comprado para Salar de Atacama que hoy está en Oficina
 * Central. Origen y ubicación son datos distintos, y el resumen los cruza.
 */

type FiltroPropiedad = "todos" | Propiedad;
const OFICINA = "oficina_central";

const etiquetaContrato = (c: ContratoBreve) => c.nombreCorto || `${c.id} · ${c.nombre}`;

/** «hace 5 minutos», «hace 2 horas», «hace 3 días». */
function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export function VistaActivos() {
  const resumen = useConsulta(cargarResumenActivos);
  const contratos = useConsulta(cargarContratosBreve);
  const [propiedad, setPropiedad] = useFiltro<FiltroPropiedad>("activos:propiedad", "todos");
  const [donde, setDonde] = useFiltro<string>("activos:donde", "todos");
  const [origen, setOrigen] = useFiltro<string>("activos:origen", "todos");
  const [texto, setTexto] = useState("");
  const textoBuscado = useRetardado(texto);
  const [elegidos, setElegidos] = useState<Map<string, ActivoFila>>(new Map());
  const [edicion, setEdicion] = useState<ActivoFila | null>(null);
  const [masivo, setMasivo] = useState(false);
  const [eligiendoTodos, setEligiendoTodos] = useState(false);
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const puedeEditar = usePuede("gestion.editar");

  const filtros = useMemo<FiltrosActivos>(() => ({ texto: textoBuscado, propiedad, donde, origen }), [textoBuscado, propiedad, donde, origen]);
  const lista = useListaServidor<ActivoFila, FiltrosActivos>({ traer: cargarPaginaActivos, filtros });

  const listaContratos = useMemo(() => (contratos.estado.estado === "listo" ? contratos.estado.datos : []), [contratos.estado]);
  const nombreContrato = useMemo(() => new Map(listaContratos.map((c) => [c.id, etiquetaContrato(c)])), [listaContratos]);
  const nombre = (id: string | null) => (id ? nombreContrato.get(id) ?? id : "—");

  const recargarTodo = () => {
    resumen.recargar();
    lista.recargar();
  };
  const alGuardar = () => { setElegidos(new Map()); recargarTodo(); };

  /** Pone la lista al día con Pagnol: lo que cambió, todo, o un solo activo. */
  async function actualizar(modo: "uno" | "cambios" | "todo", id?: string) {
    setSincronizando(id ?? modo);
    setAviso(null);
    const r = await actualizarDesdePagnol(modo, id);
    setSincronizando(null);
    if (!r.ok) {
      setAviso({ tono: "error", texto: r.error });
      return;
    }
    setAviso({
      tono: "ok",
      texto: r.cambiados === 0
        ? `Todo al día: se revisaron ${r.revisados} ${r.revisados === 1 ? "activo" : "activos"} y no cambió nada.`
        : `Listo: se actualizaron ${r.cambiados} de ${r.revisados} ${r.revisados === 1 ? "activo revisado" : "activos revisados"}.`,
    });
    recargarTodo();
  }

  /* La primera vez, la lista de Valar está vacía: se trae todo de Pagnol sola, una vez. */
  const primeraVez = useRef(false);
  const sinSincronizar = resumen.estado.estado === "listo" && resumen.estado.datos.completaSync === null;
  useEffect(() => {
    if (!sinSincronizar || primeraVez.current) return;
    primeraVez.current = true;
    void actualizar("todo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinSincronizar]);

  const alternar = (f: ActivoFila) => setElegidos((m) => { const n = new Map(m); if (n.has(f.clave)) n.delete(f.clave); else n.set(f.clave, f); return n; });
  const cargadosElegidos = lista.filas.length > 0 && lista.filas.every((f) => elegidos.has(f.clave));

  async function elegirTodosLosQueCoinciden() {
    setEligiendoTodos(true);
    try {
      const todos = await cargarTodosLosActivos(filtros);
      setElegidos(new Map(todos.map((f) => [f.clave, f])));
    } catch (e) {
      setAviso({ tono: "error", texto: e instanceof Error ? e.message : "No se pudieron elegir los activos." });
    } finally {
      setEligiendoTodos(false);
    }
  }

  const ultima = resumen.estado.estado === "listo" ? resumen.estado.datos.ultimaSync : null;

  return (
    <>
      <Encabezado
        titulo="Activos"
        descripcion="Lo que la empresa tiene: para qué contrato se compró cada activo, dónde está hoy y cuánto vale. Pagnol dice qué activos existen; acá se identifican y se valorizan. Los montos son netos de IVA."
        acciones={
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={sincronizando !== null}
              onClick={() => void actualizar("cambios")}
              className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-60"
            >
              {sincronizando === "cambios" || sincronizando === "todo" ? "Actualizando…" : "Actualizar desde Pagnol"}
            </button>
            <span className="text-xs text-ink-soft">Última vez: {haceCuanto(ultima)}</span>
          </div>
        }
      />
      {aviso && (
        <p role={aviso.tono === "error" ? "alert" : "status"}
          className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${aviso.tono === "error" ? "bg-peligro-suave text-peligro" : "bg-exito-suave text-exito"}`}>
          {aviso.texto}
        </p>
      )}
      <Contenido consulta={resumen.estado}>
        {(r) => {
          const tituloLugar = (id: string) => (id === OFICINA ? "Oficina Central" : id === SIN_IDENTIFICAR ? "Por identificar" : nombre(id));
          const lugares = [...r.lugares.map((l) => l.id)].sort((a, b) => (a === OFICINA ? -1 : b === OFICINA ? 1 : a === SIN_IDENTIFICAR ? 1 : b === SIN_IDENTIFICAR ? -1 : nombre(a).localeCompare(nombre(b))));
          const resumenLugar = (id: string) => r.lugares.find((l) => l.id === id) ?? { id, cantidad: 0, valor: 0 };
          const origenes = r.origenes.map((o) => o.id).sort((a, b) => nombre(a).localeCompare(nombre(b)));
          const filaOrigen = (id: string) => r.origenes.find((o) => o.id === id)!;

          const dondeDe = (f: ActivoFila) => (f.ubicacion === null ? SIN_IDENTIFICAR : f.ubicacion === "oficina_central" ? OFICINA : f.contratoUbicacion ?? SIN_IDENTIFICAR);

          const columnas: Columna<ActivoFila>[] = [
            ...(puedeEditar ? [{
              clave: "sel", titulo: "", ancho: "w-10",
              celda: (f: ActivoFila) => <input type="checkbox" aria-label={`Elegir ${f.codigo}`} checked={elegidos.has(f.clave)} onChange={() => alternar(f)} className="h-4 w-4 accent-cyan" />,
            }] : []),
            { clave: "codigo", titulo: "Activo", encabezado: true, celda: (f) => <div><span className={`text-xs text-ink-soft ${f.pagnolId ? "font-mono" : ""}`}>{f.codigo}</span><span className="block text-ink">{f.nombre}</span></div> },
            { clave: "propiedad", titulo: "Propiedad", celda: (f) => <Chip tono={f.propiedad === "propio" ? "bueno" : "neutro"}>{propiedades.find((p) => p.id === f.propiedad)?.titulo}</Chip> },
            { clave: "origen", titulo: "Comprado para", celda: (f) => f.origen ? <span>{nombre(f.origen)}{f.origenDeLaOrden && <span className="block text-xs text-ink-soft">{f.pagnolId ? "de su orden de compra" : "de la compra"}</span>}</span> : <span className="text-ink-soft">—</span> },
            { clave: "donde", titulo: "Está en", celda: (f) => f.ubicacion === null ? <Chip tono="aviso">Por identificar</Chip> : <span>{tituloLugar(dondeDe(f))}</span> },
            { clave: "valor", titulo: "Valor neto", derecha: true, celda: (f) => f.valor ? <span>{formatearPesos(f.valor)}{f.valorDe !== "valar" && <span className="block text-xs text-ink-soft">{f.valorDe === "pagnol" ? "de Pagnol" : "de la compra"}</span>}</span> : <span className="text-ink-soft">Sin valor</span> },
            { clave: "fecha", titulo: "Compra", celda: (f) => f.fecha ? formatearFecha(f.fecha) : <span className="text-ink-soft">—</span> },
            { clave: "estado", titulo: "Estado", celda: (f) => estadosActivo[f.estado] ?? f.estado },
            {
              clave: "acciones", titulo: "Acciones",
              celda: (f: ActivoFila) => (
                <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
                  {puedeEditar && <button type="button" onClick={() => setEdicion(f)} className="font-semibold text-cyan-deep hover:underline">{f.identificado ? "Editar" : "Identificar"}</button>}
                  {f.pagnolId && (
                    <button type="button" disabled={sincronizando !== null} onClick={() => void actualizar("uno", f.pagnolId as string)} className="font-semibold text-ink-soft hover:text-ink hover:underline disabled:opacity-50">
                      {sincronizando === f.pagnolId ? "Actualizando…" : "Actualizar"}
                    </button>
                  )}
                </span>
              ),
            },
          ];

          return (
            <>
              <Resumen datos={[
                { etiqueta: "Valor de los activos propios", valor: formatearMonto(r.patrimonio), nota: `${r.conValor} de ${r.propios} propios con valor · neto` },
                { etiqueta: "Activos", valor: String(r.total), nota: `${r.propios} propios · ${r.arrendados} arrendados · ${r.delCliente} del cliente` },
                { etiqueta: "Arriendos", valor: formatearMonto(r.costoArriendos), nota: `${r.arrendados} ${r.arrendados === 1 ? "activo arrendado" : "activos arrendados"} · costo neto, no suma al valor` },
                { etiqueta: "Por identificar", valor: String(r.porIdentificar), nota: r.porIdentificar ? "Sin contrato de origen ni ubicación confirmados" : "Todos identificados", acento: r.porIdentificar ? "aviso" : "bueno" },
                { etiqueta: "Propios sin valor", valor: String(r.sinValor), nota: r.sinValor ? "No suman al valor total hasta cargarles el costo" : "Todos con valor", acento: r.sinValor ? "aviso" : "bueno" },
              ]} />

              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {lugares.map((id) => {
                  const l = resumenLugar(id);
                  const activo = donde === id;
                  return (
                    <button key={id} type="button" onClick={() => setDonde(activo ? "todos" : id)} aria-pressed={activo}
                      className={`rounded-2xl border p-5 text-left transition-colors ${activo ? "border-cyan bg-cyan/5" : "border-mist-deep bg-white hover:border-cyan"}`}>
                      <span className="block text-sm font-semibold text-ink">{tituloLugar(id)}</span>
                      <span className="mt-2 block font-display text-xl font-semibold text-ink">{formatearMonto(l.valor)}</span>
                      <span className="mt-2 block text-xs text-ink-soft">{l.cantidad} {l.cantidad === 1 ? "activo" : "activos"} · {activo ? "ver todos" : "ver solo estos"}</span>
                    </button>
                  );
                })}
              </div>

              {origenes.length > 0 && (
                <section className="mb-6 rounded-2xl border border-mist-deep bg-white">
                  <div className="border-b border-mist px-6 py-4">
                    <h2 className="font-display text-lg font-semibold text-ink">Para qué contrato se compraron</h2>
                    <p className="mt-1 text-sm text-ink-soft">Cada contrato con lo que se compró para él y dónde está hoy. Un activo puede haberse comprado para un contrato y estar ahora en Oficina Central.</p>
                  </div>
                  <Tabla filas={origenes} claveDe={(id) => id} columnas={[
                    { clave: "c", titulo: "Contrato de origen", encabezado: true, celda: (id) => <button type="button" onClick={() => setOrigen(origen === id ? "todos" : id)} className="text-left font-semibold text-cyan-deep hover:underline">{nombre(id)}</button> },
                    { clave: "n", titulo: "Activos", derecha: true, celda: (id) => filaOrigen(id).cantidad },
                    { clave: "v", titulo: "Valor neto", derecha: true, celda: (id) => formatearPesos(filaOrigen(id).valor) },
                    { clave: "o", titulo: "Hoy en Oficina Central", derecha: true, celda: (id) => filaOrigen(id).enOficina },
                    { clave: "s", titulo: "En su contrato", derecha: true, celda: (id) => filaOrigen(id).enSuContrato },
                    { clave: "x", titulo: "En otro contrato", derecha: true, celda: (id) => filaOrigen(id).enOtro },
                    { clave: "u", titulo: "Sin ubicar", derecha: true, celda: (id) => filaOrigen(id).sinUbicar },
                  ]} />
                </section>
              )}

              <Panel titulo="Activos" nota={`${lista.filas.length}${lista.hayMas ? "+" : ""} mostrados · ${r.total} en total · propios, arrendados y del cliente`} filtrosAbajo
                filtros={<>
                  <CampoFiltro etiqueta="Propiedad">
                    <Filtro etiqueta="Propiedad" opciones={[{ id: "todos" as FiltroPropiedad, titulo: "Todos" }, ...propiedades]} valor={propiedad} alCambiar={setPropiedad} />
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Está en">
                    <Desplegable etiqueta="Está en" valor={donde} alCambiar={setDonde} grupos={[{ opciones: [{ id: "todos", titulo: "Todos los lugares" }, ...lugares.map((id) => ({ id, titulo: tituloLugar(id) }))] }]} />
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Comprado para">
                    <Desplegable etiqueta="Comprado para" valor={origen} alCambiar={setOrigen} grupos={[{ opciones: [{ id: "todos", titulo: "Todos los contratos" }, ...origenes.map((id) => ({ id, titulo: nombre(id) })), { id: SIN_IDENTIFICAR, titulo: "Sin contrato de origen" }] }]} />
                  </CampoFiltro>
                </>}>
                <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar activos" placeholder="Buscar por código, nombre o contrato…" />
                {puedeEditar && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 text-ink-soft">
                      <input type="checkbox" checked={cargadosElegidos}
                        onChange={() => setElegidos((m) => { const n = new Map(m); for (const f of lista.filas) { if (cargadosElegidos) n.delete(f.clave); else n.set(f.clave, f); } return n; })}
                        className="h-4 w-4 accent-cyan" />
                      Elegir los {lista.filas.length} que se ven
                    </label>
                    {lista.hayMas && (
                      <button type="button" disabled={eligiendoTodos} onClick={() => void elegirTodosLosQueCoinciden()} className="font-semibold text-cyan-deep hover:underline disabled:opacity-50">
                        {eligiendoTodos ? "Eligiendo…" : "Elegir todos los que coinciden con el filtro"}
                      </button>
                    )}
                    {elegidos.size > 0 && (
                      <>
                        <button type="button" onClick={() => setMasivo(true)} className="rounded-full bg-cyan-deep px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-hondo">
                          Identificar {elegidos.size} {elegidos.size === 1 ? "activo" : "activos"}…
                        </button>
                        <button type="button" onClick={() => setElegidos(new Map())} className="text-xs font-semibold text-ink-soft hover:text-ink hover:underline">Quitar la selección</button>
                      </>
                    )}
                  </div>
                )}
                {lista.error ? (
                  <p role="alert" className="px-6 py-10 text-center text-sm text-peligro lg:px-8">
                    No se pudo cargar la lista: {lista.error}{" "}
                    <button type="button" onClick={lista.recargar} className="font-semibold underline">Reintentar</button>
                  </p>
                ) : lista.cargando && lista.filas.length === 0 ? (
                  <p className="px-6 py-14 text-center text-sm text-ink-soft lg:px-8">{sinSincronizar ? "Trayendo los activos desde Pagnol por primera vez…" : "Cargando activos…"}</p>
                ) : (
                  <Tabla filas={lista.filas} claveDe={(f) => f.clave} columnas={columnas}
                    vacio={texto.trim() ? "Ningún activo coincide con la búsqueda." : "No hay activos para este filtro."}
                    pie={<><Total colSpan={puedeEditar ? 5 : 4}>Valor neto de los propios que se ven</Total><Total derecha>{formatearPesos(lista.filas.filter(sumaAlPatrimonio).reduce((t, f) => t + (f.valor ?? 0), 0))}</Total><Total colSpan={3} /></>} />
                )}
                {lista.hayMas && !lista.error && (
                  <div className="flex justify-center border-t border-mist px-6 py-4">
                    <button type="button" onClick={lista.cargarMas} disabled={lista.cargandoMas}
                      className="rounded-full border border-mist-deep px-5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-60">
                      {lista.cargandoMas ? "Cargando…" : "Cargar más"}
                    </button>
                  </div>
                )}
              </Panel>
            </>
          );
        }}
      </Contenido>

      {edicion && <FormularioActivos key={edicion.clave} filas={[edicion]} contratos={listaContratos} alCerrar={() => setEdicion(null)} alGuardado={alGuardar} />}
      {masivo && <FormularioActivos key="masivo" filas={[...elegidos.values()]} contratos={listaContratos} alCerrar={() => setMasivo(false)} alGuardado={alGuardar} />}
    </>
  );
}

/* ── Identificar: uno o varios a la vez ───────────────────────────────────── */

const SIN_CAMBIO = "__igual__";

/**
 * Con un solo activo se muestran sus valores y se cambia lo que haga falta.
 * Con varios, cada campo parte en «Sin cambios» y solo se aplica lo que se toque:
 * así se identifican decenas de golpe (todos al mismo contrato, todos en Oficina
 * Central…) sin pisar lo que ya tenían.
 */
function FormularioActivos({ filas, contratos, alCerrar, alGuardado }: {
  filas: ActivoFila[];
  contratos: ContratoBreve[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const uno = filas.length === 1 ? filas[0] : null;
  const f = useFormulario({
    propiedad: uno ? uno.propiedad : SIN_CAMBIO,
    origen: uno ? uno.origen ?? "" : SIN_CAMBIO,
    ubicacion: uno ? uno.ubicacion ?? "" : SIN_CAMBIO,
    contratoUbicacion: uno ? uno.contratoUbicacion ?? "" : "",
    valor: uno?.valorDe === "valar" ? uno.valor ?? 0 : 0,
    fecha: uno?.fecha ?? "",
    observaciones: uno?.observaciones ?? "",
  });
  const d = f.datos;
  const contratosOpc = contratos.map((c) => ({ id: c.id as string, titulo: etiquetaContrato(c) }));
  const noCambia = (v: string) => v === SIN_CAMBIO;
  // Un arriendo no se compra ni suma patrimonio: el formulario habla de arrendar, no de comprar.
  const arriendo = d.propiedad === "arrendado";

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const c: CambiosDeActivo = {};
    if (!noCambia(d.propiedad)) c.propiedad = d.propiedad as Propiedad;
    if (!noCambia(d.origen)) c.origen = d.origen || null;
    if (!noCambia(d.ubicacion)) {
      if (!d.ubicacion) return f.setError("Elige dónde están los activos.");
      c.ubicacion = d.ubicacion as Ubicacion;
      if (d.ubicacion === "contrato") {
        if (!d.contratoUbicacion) return f.setError("Elige en qué contrato están.");
        c.contratoUbicacion = d.contratoUbicacion;
      }
    } else if (d.contratoUbicacion) {
      c.contratoUbicacion = d.contratoUbicacion;
    }
    if (uno) {
      c.valor = d.valor > 0 ? d.valor : null;
      c.fecha = d.fecha || null;
      c.observaciones = d.observaciones;
      if (!uno.identificado && c.ubicacion === undefined) return f.setError("Elige dónde está el activo.");
    }
    void f.enviar(() => guardarActivos(filas, c), () => { alGuardado(); alCerrar(); });
  }

  const sinCambio = !uno ? [{ id: SIN_CAMBIO, titulo: "— Sin cambios —" }] : [];
  return (
    <Dialogo abierto alCerrar={alCerrar}
      titulo={uno ? `${uno.codigo} · ${uno.nombre}` : `Identificar ${filas.length} activos`}
      descripcion={uno
        ? (arriendo
          ? "Es un arriendo: no suma al valor de la empresa. Indica para qué contrato se arrienda, dónde se usa hoy y cuánto cuesta."
          : "Para qué contrato se compró, dónde está hoy, de quién es y cuánto costó. El valor de Pagnol se usa mientras no pongas uno.")
        : "Solo se cambia lo que elijas; lo demás queda como estaba en cada activo."}>
      <form onSubmit={guardar}>
        <Campos>
          <CampoSeleccion etiqueta="Propiedad" opciones={[...sinCambio, ...propiedades]} {...f.campo("propiedad")}
            ayuda="Solo los propios suman al valor. Un arriendo o un equipo del cliente se rastrea pero no es patrimonio." />
          <CampoSeleccion etiqueta={arriendo ? "Arrendado para el contrato" : "Comprado para el contrato"} opciones={[...sinCambio, { id: "", titulo: "— Ninguno —" }, ...contratosOpc]} {...f.campo("origen")}
            ayuda={arriendo ? "Para qué contrato se arrienda." : "Para qué contrato se compró. No cambia aunque el activo se mueva."} />
          <CampoSeleccion etiqueta={arriendo ? "Se usa hoy en" : "Está hoy en"} opciones={[...sinCambio, ...(uno && !uno.identificado ? [{ id: "", titulo: "— Elige —" }] : []), { id: "oficina_central", titulo: "Oficina Central" }, { id: "contrato", titulo: "Un contrato" }]} {...f.campo("ubicacion")} />
          {(d.ubicacion === "contrato" || (noCambia(d.ubicacion) && uno === null)) && (
            <CampoSeleccion etiqueta="En el contrato" opciones={[{ id: "", titulo: "— Elige —" }, ...contratosOpc]} {...f.campo("contratoUbicacion")}
              ayuda={noCambia(d.ubicacion) ? "Solo se usa si cambias «Está hoy en» a «Un contrato»." : undefined} />
          )}
          {uno && <>
            <CampoDinero etiqueta={arriendo ? "Costo del arriendo (neto)" : "Valor de compra (neto)"} {...f.campo("valor")}
              ayuda={uno.valorDe !== "valar" && d.valor === 0 && uno.valor ? `${uno.valorDe === "compra" ? "La compra tiene" : "Pagnol tiene"} ${formatearPesos(uno.valor)}. Déjalo en 0 para usar ese.` : "En 0 se usa el de Pagnol o el de la compra, si tiene."} />
            <CampoFecha etiqueta={arriendo ? "Arrendado desde" : "Fecha de compra"} {...f.campo("fecha")} />
            <Ancho><CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} /></Ancho>
          </>}
        </Campos>
        <Pie error={f.error} guardando={f.guardando} alCancelar={alCerrar} textoGuardar={uno ? "Guardar" : `Aplicar a ${filas.length} activos`} />
      </form>
    </Dialogo>
  );
}
