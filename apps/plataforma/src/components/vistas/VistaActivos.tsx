"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Chip } from "../ui/Chip";
import { Buscador, coincide } from "../ui/Buscador";
import { Campos, CampoDinero, CampoFecha, CampoSeleccion, CampoTexto, Dialogo, Pie, useFormulario, Ancho } from "../ui/Formulario";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import {
  cargarActivos, estadosActivo, guardarActivos, propiedades, sumaAlPatrimonio,
  type ActivoFila, type CambiosDeActivo, type Propiedad, type Ubicacion,
} from "@/lib/activos";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha, formatearMonto, formatearPesos } from "@/lib/formato";
import { usePuede } from "@/lib/sesion";
import { useFiltro } from "@/lib/vista-guardada";

/**
 * Los activos de la empresa: qué hay, para qué contrato se compró cada uno,
 * dónde está hoy y cuánto vale (0096). Pagnol dice qué activos existen; acá se
 * identifican uno a uno o por tandas. Los montos son netos de IVA.
 *
 * Caso típico: un activo comprado para Salar de Atacama que hoy está en Oficina
 * Central. Origen y ubicación son datos distintos, y el resumen los cruza.
 */

type FiltroPropiedad = "todos" | Propiedad;
const OFICINA = "oficina_central";
const SIN_IDENTIFICAR = "sin_identificar";

const etiquetaContrato = (c: ContratoBreve) => c.nombreCorto || `${c.id} · ${c.nombre}`;

export function VistaActivos() {
  const activos = useConsulta(cargarActivos);
  const contratos = useConsulta(cargarContratosBreve);
  const [propiedad, setPropiedad] = useFiltro<FiltroPropiedad>("activos:propiedad", "todos");
  const [donde, setDonde] = useFiltro<string>("activos:donde", "todos");
  const [origen, setOrigen] = useFiltro<string>("activos:origen", "todos");
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [edicion, setEdicion] = useState<ActivoFila | null>(null);
  const [masivo, setMasivo] = useState(false);
  const puedeEditar = usePuede("gestion.editar");

  const lista = useMemo(() => (contratos.estado.estado === "listo" ? contratos.estado.datos : []), [contratos.estado]);
  const nombreContrato = useMemo(() => new Map(lista.map((c) => [c.id, etiquetaContrato(c)])), [lista]);
  const alGuardar = () => { setElegidos(new Set()); activos.recargar(); };

  return (
    <>
      <Encabezado
        titulo="Activos"
        descripcion="Lo que la empresa tiene: para qué contrato se compró cada activo, dónde está hoy y cuánto vale. Pagnol dice qué activos existen; acá se identifican. Los montos son netos de IVA."
      />
      <Contenido consulta={activos.estado}>
        {(filas) => {
          const nombre = (id: string | null) => (id ? nombreContrato.get(id) ?? id : "—");
          const dondeDe = (f: ActivoFila) => (f.ubicacion === null ? SIN_IDENTIFICAR : f.ubicacion === "oficina_central" ? OFICINA : f.contratoUbicacion ?? SIN_IDENTIFICAR);

          const propios = filas.filter(sumaAlPatrimonio);
          const conValor = propios.filter((f) => f.valor !== null && f.valor > 0);
          const porIdentificar = filas.filter((f) => !f.identificado);
          const sinValor = propios.filter((f) => !f.valor);
          const arrendados = filas.filter((f) => f.propiedad === "arrendado");
          const costoArriendos = arrendados.reduce((t, f) => t + (f.valor ?? 0), 0);
          const patrimonio = conValor.reduce((t, f) => t + (f.valor ?? 0), 0);

          // Dónde están: lo que se ve en las tarjetas.
          const lugares = [...new Set(filas.map(dondeDe))].sort((a, b) => (a === OFICINA ? -1 : b === OFICINA ? 1 : a === SIN_IDENTIFICAR ? 1 : b === SIN_IDENTIFICAR ? -1 : nombre(a).localeCompare(nombre(b))));
          const resumenLugar = (id: string) => {
            const f = filas.filter((x) => dondeDe(x) === id);
            const p = f.filter(sumaAlPatrimonio);
            return { cantidad: f.length, valor: p.reduce((t, x) => t + (x.valor ?? 0), 0) };
          };
          const tituloLugar = (id: string) => (id === OFICINA ? "Oficina Central" : id === SIN_IDENTIFICAR ? "Por identificar" : nombre(id));

          // Para qué contrato se compraron y dónde están hoy.
          const origenes = [...new Set(filas.map((f) => f.origen).filter((x): x is string => !!x))].sort((a, b) => nombre(a).localeCompare(nombre(b)));
          const filaOrigen = (id: string) => {
            const f = filas.filter((x) => x.origen === id);
            const p = f.filter(sumaAlPatrimonio);
            return {
              cantidad: f.length,
              valor: p.reduce((t, x) => t + (x.valor ?? 0), 0),
              enOficina: f.filter((x) => x.ubicacion === "oficina_central").length,
              enSuContrato: f.filter((x) => x.ubicacion === "contrato" && x.contratoUbicacion === id).length,
              enOtro: f.filter((x) => x.ubicacion === "contrato" && x.contratoUbicacion !== id).length,
              sinUbicar: f.filter((x) => x.ubicacion === null).length,
            };
          };

          const visibles = filas.filter((f) =>
            (propiedad === "todos" || f.propiedad === propiedad)
            && (donde === "todos" || dondeDe(f) === donde)
            && (origen === "todos" || (origen === SIN_IDENTIFICAR ? !f.origen : f.origen === origen))
            && coincide(texto, [f.codigo, f.nombre, f.observaciones, nombre(f.origen), nombre(f.contratoUbicacion)]));
          const seleccion = visibles.filter((f) => elegidos.has(f.clave));
          const todosElegidos = visibles.length > 0 && seleccion.length === visibles.length;
          const alternar = (id: string) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

          const columnas: Columna<ActivoFila>[] = [
            ...(puedeEditar ? [{
              clave: "sel", titulo: "", ancho: "w-10",
              celda: (f: ActivoFila) => <input type="checkbox" aria-label={`Elegir ${f.codigo}`} checked={elegidos.has(f.clave)} onChange={() => alternar(f.clave)} className="h-4 w-4 accent-cyan" />,
            }] : []),
            { clave: "codigo", titulo: "Activo", encabezado: true, celda: (f) => <div><span className={`text-xs text-ink-soft ${f.pagnolId ? "font-mono" : ""}`}>{f.codigo}</span><span className="block text-ink">{f.nombre}</span></div> },
            { clave: "propiedad", titulo: "Propiedad", celda: (f) => <Chip tono={f.propiedad === "propio" ? "bueno" : "neutro"}>{propiedades.find((p) => p.id === f.propiedad)?.titulo}</Chip> },
            { clave: "origen", titulo: "Comprado para", celda: (f) => f.origen ? <span>{nombre(f.origen)}{f.origenDeLaOrden && <span className="block text-xs text-ink-soft">{f.pagnolId ? "de su orden de compra" : "de la compra"}</span>}</span> : <span className="text-ink-soft">—</span> },
            { clave: "donde", titulo: "Está en", celda: (f) => f.ubicacion === null ? <Chip tono="aviso">Por identificar</Chip> : <span>{tituloLugar(dondeDe(f))}</span> },
            { clave: "valor", titulo: "Valor neto", derecha: true, celda: (f) => f.valor ? <span>{formatearPesos(f.valor)}{f.valorDe !== "valar" && <span className="block text-xs text-ink-soft">{f.valorDe === "pagnol" ? "de Pagnol" : "de la compra"}</span>}</span> : <span className="text-ink-soft">Sin valor</span> },
            { clave: "fecha", titulo: "Compra", celda: (f) => f.fecha ? formatearFecha(f.fecha) : <span className="text-ink-soft">—</span> },
            { clave: "estado", titulo: "Estado", celda: (f) => estadosActivo[f.estado] ?? f.estado },
            ...(puedeEditar ? [{
              clave: "acciones", titulo: "Acciones",
              celda: (f: ActivoFila) => <button type="button" onClick={() => setEdicion(f)} className="font-semibold text-cyan-deep hover:underline">{f.identificado ? "Editar" : "Identificar"}</button>,
            }] : []),
          ];

          return (
            <>
              <Resumen datos={[
                { etiqueta: "Valor de los activos propios", valor: formatearMonto(patrimonio), nota: `${conValor.length} de ${propios.length} propios con valor · neto` },
                { etiqueta: "Activos", valor: String(filas.length), nota: `${propios.length} propios · ${filas.filter((f) => f.propiedad === "arrendado").length} arrendados · ${filas.filter((f) => f.propiedad === "del_cliente").length} del cliente` },
                { etiqueta: "Arriendos", valor: formatearMonto(costoArriendos), nota: `${arrendados.length} ${arrendados.length === 1 ? "activo arrendado" : "activos arrendados"} · costo neto, no suma al valor` },
                { etiqueta: "Por identificar", valor: String(porIdentificar.length), nota: porIdentificar.length ? "Sin contrato de origen ni ubicación confirmados" : "Todos identificados", acento: porIdentificar.length ? "aviso" : "bueno" },
                { etiqueta: "Propios sin valor", valor: String(sinValor.length), nota: sinValor.length ? "No suman al valor total hasta cargarles el costo" : "Todos con valor", acento: sinValor.length ? "aviso" : "bueno" },
              ]} />

              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {lugares.map((id) => {
                  const r = resumenLugar(id);
                  const activo = donde === id;
                  return (
                    <button key={id} type="button" onClick={() => setDonde(activo ? "todos" : id)} aria-pressed={activo}
                      className={`rounded-2xl border p-5 text-left transition-colors ${activo ? "border-cyan bg-cyan/5" : "border-mist-deep bg-white hover:border-cyan"}`}>
                      <span className="block text-sm font-semibold text-ink">{tituloLugar(id)}</span>
                      <span className="mt-2 block font-display text-xl font-semibold text-ink">{formatearMonto(r.valor)}</span>
                      <span className="mt-2 block text-xs text-ink-soft">{r.cantidad} {r.cantidad === 1 ? "activo" : "activos"} · {activo ? "ver todos" : "ver solo estos"}</span>
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

              <Panel titulo="Activos" nota={`${visibles.length} de ${filas.length} activos · propios, arrendados y del cliente`} filtrosAbajo
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
                      <input type="checkbox" checked={todosElegidos} onChange={() => setElegidos(todosElegidos ? new Set() : new Set(visibles.map((f) => f.clave)))} className="h-4 w-4 accent-cyan" />
                      Elegir los {visibles.length} que se ven
                    </label>
                    {seleccion.length > 0 && (
                      <button type="button" onClick={() => setMasivo(true)} className="rounded-full bg-cyan px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-deep">
                        Identificar {seleccion.length} {seleccion.length === 1 ? "activo" : "activos"}…
                      </button>
                    )}
                  </div>
                )}
                <Tabla filas={visibles} claveDe={(f) => f.clave} columnas={columnas}
                  vacio={texto.trim() ? "Ningún activo coincide con la búsqueda." : "No hay activos para este filtro."}
                  pie={<><Total colSpan={puedeEditar ? 5 : 4}>Valor neto de los propios que se ven</Total><Total derecha>{formatearPesos(visibles.filter(sumaAlPatrimonio).reduce((t, f) => t + (f.valor ?? 0), 0))}</Total><Total colSpan={puedeEditar ? 3 : 2} /></>} />
              </Panel>
            </>
          );
        }}
      </Contenido>

      {edicion && <FormularioActivos key={edicion.clave} filas={[edicion]} contratos={lista} alCerrar={() => setEdicion(null)} alGuardado={alGuardar} />}
      {masivo && activos.estado.estado === "listo" && (
        <FormularioActivos key="masivo" filas={activos.estado.datos.filter((f) => elegidos.has(f.clave))} contratos={lista} alCerrar={() => setMasivo(false)} alGuardado={alGuardar} />
      )}
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
