"use client";

import { SeccionRespaldos, useRespaldos } from "@/components/ui/Respaldos";
import { useFiltro } from "@/lib/vista-guardada";
import { useState, type FormEvent } from "react";
import { actualizar, crearConId, eliminar } from "@/lib/crud";
import { supabase } from "@/lib/supabase";
import { deshacerCompraConPagnol } from "@/lib/pagnol/navegador";
import { IngresoAPagnol } from "../formularios/IngresoAPagnol";
import { useConsulta } from "@/lib/consulta";
import { usePuede } from "@/lib/sesion";
import { formatearFecha, formatearMonto, formatearPesos, mesLargo } from "@/lib/formato";
import {
  CENTRO_GENERAL,
  cargarOficina,
  categoriasSinIngresoAPagnol,
  totalOficina,
  type CategoriaOficina,
  type CentroCosto,
  type DatosEgresoOficina,
  type EgresoOficina,
} from "@/lib/oficina-central";
import { AdministrarOficina } from "../AdministrarOficina";
import {
  Ancho, CampoDinero, CampoFecha, CampoSeleccion, CampoTexto,
  Campos, Confirmacion, Dialogo, Pie, ResumenIva, ivaDe, useBorrado, useFormulario,
} from "../ui/Formulario";
import { DialogoHistorial } from "../ui/Historial";
import { Buscador, coincide } from "../ui/Buscador";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";

type Catalogo = { categorias: CategoriaOficina[]; centros: CentroCosto[] };
type Estatus = "todos" | "porPagar" | "pagados" | "sinDocumento";

const estatusGasto: { id: Estatus; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "porPagar", titulo: "Por pagar" },
  { id: "pagados", titulo: "Pagados" },
  { id: "sinDocumento", titulo: "Sin documento" },
];

function fechaHoy() {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function borradorNuevo(categoria: string, centro: string): DatosEgresoOficina {
  return {
    categoria,
    centro_costo: centro,
    fecha: fechaHoy(),
    proveedor: "",
    descripcion: "",
    documento: null,
    neto: 0,
    iva: 0,
    estado: "pendiente",
    observaciones: null,
  };
}

export function VistaOficinaCentral() {
  const { estado, recargar } = useConsulta(cargarOficina);
  const [categoria, setCategoria] = useFiltro<string>("oficina-central:categoria", "todos");
  const [centro, setCentro] = useFiltro<string>("oficina-central:centro", "todos");
  const [administrando, setAdministrando] = useState(false);
  const [mes, setMes] = useFiltro("oficina-central:mes", "todos");
  const [estatus, setEstatus] = useFiltro<Estatus>("oficina-central:estatus", "todos");
  const [texto, setTexto] = useState("");
  const [formulario, setFormulario] = useState<{ registro: EgresoOficina | null; categoria: string; centro: string } | null>(null);
  const [historial, setHistorial] = useState<EgresoOficina | null>(null);
  const puedeCargar = usePuede("gestion.editar");

  return (
    <>
      <Encabezado
        titulo="Oficina Central"
        descripcion="Egresos generales de la empresa, separados de los contratos. Cada egreso lleva una categoría (qué tipo de gasto es) y un centro de costo (para quién o para qué se gastó). Los montos del resumen son netos de IVA."
        acciones={
          puedeCargar && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAdministrando(true)}
                className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft hover:border-ink hover:text-ink">
                Categorías y centros
              </button>
              <button type="button" onClick={() => setFormulario({ registro: null, categoria: categoria === "todos" ? "compras" : categoria, centro: centro === "todos" ? CENTRO_GENERAL : centro })}
                className="rounded-full bg-cyan-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-hondo">
                Nuevo egreso
              </button>
            </div>
          )
        }
      />
      <Contenido consulta={estado}>
        {({ egresos: filas, categorias, centros }) => {
          const meses = [...new Set(filas.map((fila) => fila.fecha.slice(0, 7)))].sort().reverse();
          const delMes = mes === "todos" ? filas : filas.filter((fila) => fila.fecha.startsWith(mes));
          // Período y estatus recortan todo; la categoría, además, la lista y las tarjetas de arriba.
          const delEstatus = delMes.filter((fila) =>
            estatus === "porPagar" ? fila.estado === "pendiente"
              : estatus === "pagados" ? fila.estado === "pagado"
              : estatus === "sinDocumento" ? !fila.documento
              : true);
          const delCentro = centro === "todos" ? delEstatus : delEstatus.filter((fila) => fila.centro_costo === centro);
          const delTexto = (categoria === "todos" ? delCentro : delCentro.filter((fila) => fila.categoria === categoria));
          // Se muestran las categorías y centros encendidos, más los apagados que aún tengan movimientos.
          const conMovimientos = new Set(filas.map((fila) => fila.categoria));
          const categoriasVisibles = categorias.filter((c) => c.activa || conMovimientos.has(c.id));
          const centrosConMovimientos = new Set(filas.map((fila) => fila.centro_costo));
          const centrosVisibles = centros.filter((c) => c.activo || centrosConMovimientos.has(c.id));
          const visibles = delTexto.filter((fila) =>
            coincide(texto, [fila.proveedor, fila.descripcion, fila.documento, fila.observaciones]),
          );
          // Cada grupo de tarjetas respeta los demás filtros pero no el suyo propio, para ver a dónde cambiar.
          const porCategoria: Record<string, number> = Object.fromEntries(
            categoriasVisibles.map(({ id }) => [id, totalOficina(delCentro.filter((fila) => fila.categoria === id))]),
          );
          const delEstatusYCategoria = categoria === "todos" ? delEstatus : delEstatus.filter((fila) => fila.categoria === categoria);
          const porCentro: Record<string, number> = Object.fromEntries(
            centrosVisibles.map(({ id }) => [id, totalOficina(delEstatusYCategoria.filter((fila) => fila.centro_costo === id))]),
          );
          const porPagar = visibles.filter((fila) => fila.estado === "pendiente");
          const sinDocumento = visibles.filter((fila) => !fila.documento);
          const activos = visibles.filter((fila) => fila.esActivo);
          return (
            <>
              <Resumen datos={[
                { etiqueta: "Egresos netos", valor: formatearMonto(totalOficina(visibles)), nota: `${visibles.length} ${visibles.length === 1 ? "movimiento" : "movimientos"} · incluye compra de activos` },
                { etiqueta: "Gastos operativos", valor: formatearMonto(totalOficina(visibles.filter((fila) => !fila.esActivo))), nota: "Todo menos la compra de activos" },
                { etiqueta: "Compra de activos", valor: formatearMonto(totalOficina(activos)), nota: `${activos.length} ${activos.length === 1 ? "activo" : "activos"} · inversión identificada aparte` },
                { etiqueta: "Pendiente de pago", valor: formatearMonto(totalOficina(porPagar)), nota: `${porPagar.length} por pagar${sinDocumento.length > 0 ? ` · ${sinDocumento.length} sin documento` : ""} · neto`,
                  acento: porPagar.length > 0 ? "aviso" : undefined },
              ]} />
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {categoriasVisibles.map(({ id, titulo }) => (
                  <button key={id} type="button" onClick={() => setCategoria(categoria === id ? "todos" : id)}
                    aria-pressed={categoria === id}
                    className={`rounded-2xl border p-5 text-left transition-colors ${categoria === id ? "border-cyan bg-cyan/5" : "border-mist-deep bg-white hover:border-cyan"}`}>
                    <span className="block text-sm font-semibold text-ink">{titulo}</span>
                    <span className="mt-2 block font-display text-xl font-semibold text-ink">{formatearMonto(porCategoria[id])}</span>
                    <span className="mt-2 block text-xs text-cyan-deep">{categoria === id ? "Ver todos" : `Ver ${titulo.toLowerCase()}`}</span>
                  </button>
                ))}
              </div>
              {centrosVisibles.length > 1 && (
                <section aria-label="Por centro de costo" className="mb-6">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Por centro de costo</h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {centrosVisibles.map(({ id, nombre }) => (
                      <button key={id} type="button" onClick={() => setCentro(centro === id ? "todos" : id)}
                        aria-pressed={centro === id}
                        className={`rounded-2xl border p-4 text-left transition-colors ${centro === id ? "border-realce bg-realce-suave" : "border-mist-deep bg-white hover:border-realce"}`}>
                        <span className="block text-sm font-semibold text-ink">{nombre}</span>
                        <span className="mt-1.5 block font-display text-lg font-semibold text-ink">{formatearMonto(porCentro[id])}</span>
                        <span className="mt-1.5 block text-xs text-realce">{centro === id ? "Ver todos" : "Ver este centro"}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <Panel titulo="Movimientos de Oficina Central" nota={`${visibles.length} de ${filas.length} movimientos · las tarjetas siguen los filtros · cada movimiento es de la empresa y no afecta el margen de un contrato`}
                filtrosAbajo
                filtros={<>
                  <CampoFiltro etiqueta="Período">
                    <Desplegable etiqueta="Período" valor={mes} alCambiar={setMes} grupos={[{ opciones: [
                      { id: "todos", titulo: "Todos los meses" },
                      ...meses.map((id) => ({ id, titulo: mesLargo(`${id}-01`) })),
                    ] }]} />
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Categoría">
                    <Filtro etiqueta="Categoría" opciones={[{ id: "todos", titulo: "Todos" }, ...categoriasVisibles.map((c) => ({ id: c.id, titulo: c.titulo }))]} valor={categoria} alCambiar={setCategoria} />
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Centro de costo">
                    <Filtro etiqueta="Centro de costo" opciones={[{ id: "todos", titulo: "Todos" }, ...centrosVisibles.map((c) => ({ id: c.id, titulo: c.nombre }))]} valor={centro} alCambiar={setCentro} />
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Estatus">
                    <Filtro etiqueta="Estatus" opciones={estatusGasto} valor={estatus} alCambiar={setEstatus} />
                  </CampoFiltro>
                </>}>
                <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar egresos" placeholder="Buscar por proveedor, descripción o documento…" />
                <Tabla filas={visibles} claveDe={(fila) => fila.id} vacio={texto.trim() ? "Ningún egreso coincide con la búsqueda." : "Aún no hay egresos de oficina central para este filtro."}
                  columnas={columnas(puedeCargar ? (fila) => setFormulario({ registro: fila, categoria: fila.categoria, centro: fila.centro_costo }) : null, setHistorial)}
                  pie={<><Total colSpan={5}>Total neto</Total><Total derecha>{formatearPesos(totalOficina(visibles))}</Total><Total colSpan={2} /></>} />
              </Panel>
            </>
          );
        }}
      </Contenido>
      {formulario && (
        <FormularioOficina key={formulario.registro?.id ?? `${formulario.categoria}:${formulario.centro}`}
          registro={formulario.registro} categoriaInicial={formulario.categoria} centroInicial={formulario.centro}
          catalogo={estado.estado === "listo" ? estado.datos : { categorias: [], centros: [] }}
          alCerrar={() => setFormulario(null)} alGuardado={recargar} />
      )}
      {administrando && <AdministrarOficina alCerrar={() => setAdministrando(false)} alCambiar={recargar} />}
      {historial && <DialogoHistorial tabla="egresos_oficina_central" registroId={historial.id}
        titulo={historial.descripcion} abierto alCerrar={() => setHistorial(null)} />}
    </>
  );
}

function columnas(editar: ((fila: EgresoOficina) => void) | null, verHistorial: (fila: EgresoOficina) => void): Columna<EgresoOficina>[] {
  return [
    { clave: "fecha", titulo: "Fecha", encabezado: true, celda: (f) => formatearFecha(f.fecha) },
    { clave: "categoria", titulo: "Categoría", celda: (f) => f.categoriaTitulo },
    { clave: "centro", titulo: "Centro de costo", celda: (f) => f.centro_costo === CENTRO_GENERAL ? <span className="text-ink-soft">{f.centroNombre}</span> : <span className="font-semibold text-realce">{f.centroNombre}</span> },
    { clave: "detalle", titulo: "Detalle", celda: (f) => <><span className="block font-semibold text-ink">{f.descripcion}</span><span className="text-xs text-ink-soft">{f.proveedor}{f.documento ? ` · ${f.documento}` : ""}</span></> },
    { clave: "estado", titulo: "Pago", celda: (f) => <span className={f.estado === "pagado" ? "text-exito" : "text-alerta"}>{f.estado === "pagado" ? "Pagado" : "Pendiente"}</span> },
    { clave: "neto", titulo: "Neto", derecha: true, celda: (f) => formatearPesos(f.neto) },
    { clave: "iva", titulo: "IVA", derecha: true, celda: (f) => formatearPesos(f.iva) },
    { clave: "acciones", titulo: "Acciones", celda: (f) => <div className="flex gap-3 whitespace-nowrap">{editar && <button type="button" onClick={() => editar(f)} className="font-semibold text-cyan-deep hover:underline">Editar</button>}<button type="button" onClick={() => verHistorial(f)} className="text-ink-soft hover:underline">Historial</button></div> },
  ];
}

function FormularioOficina({ registro, categoriaInicial, centroInicial, catalogo, alCerrar, alGuardado }: {
  registro: EgresoOficina | null;
  categoriaInicial: string;
  centroInicial: string;
  catalogo: Catalogo;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const inicial: DatosEgresoOficina = registro ? {
    categoria: registro.categoria, centro_costo: registro.centro_costo, fecha: registro.fecha, proveedor: registro.proveedor,
    descripcion: registro.descripcion, documento: registro.documento, neto: registro.neto,
    iva: registro.iva, estado: registro.estado, observaciones: registro.observaciones,
  } : borradorNuevo(categoriaInicial, centroInicial);
  // Solo se ofrece lo encendido; si el egreso ya tenía una categoría o centro apagado, ese sigue disponible.
  const opcionesCategoria = catalogo.categorias.filter((c) => c.activa || c.id === inicial.categoria).map((c) => ({ id: c.id, titulo: c.titulo }));
  const opcionesCentro = catalogo.centros.filter((c) => c.activo || c.id === inicial.centro_costo).map((c) => ({ id: c.id, titulo: c.nombre }));
  const formulario = useFormulario(inicial);
  // El IVA es el 19% del neto. Un egreso guardado con neto y sin IVA se abre como exento.
  const [exento, setExento] = useState(registro !== null && registro.neto > 0 && registro.iva === 0);
  /* Lo que se le informó a Pagnol se deshace primero: si Pagnol no lo acepta (p. ej.
     ya se entregaron esas unidades), el egreso no se borra. Solo se le habla a
     Pagnol si el egreso realmente le informó algo. */
  const borrado = useBorrado("egresos_oficina_central", registro?.id, () => { alGuardado(); alCerrar(); }, async (id) => {
    const { count } = await supabase.from("pagnol_envios").select("id", { count: "exact", head: true }).eq("egreso_oficina_id", id);
    if (count) {
      const enPagnol = await deshacerCompraConPagnol(id, "oficina");
      if (!enPagnol.ok) throw new Error(enPagnol.error);
    }
    await eliminar("egresos_oficina_central", id);
  });

  const respaldos = useRespaldos("egresos_oficina_central", registro ? registro.id : null);
  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const d = formulario.datos;
    if (!d.fecha || !d.proveedor.trim() || !d.descripcion.trim() || !Number.isFinite(d.neto) || d.neto <= 0) {
      formulario.setError("Completa fecha, proveedor, detalle y un monto neto mayor que cero.");
      return;
    }
    const datos = { ...d, iva: ivaDe(d.neto, !exento), proveedor: d.proveedor.trim(), descripcion: d.descripcion.trim(), documento: d.documento?.trim() || null, observaciones: d.observaciones?.trim() || null };
    void formulario.enviar(
      async () => {
        if (registro) await actualizar("egresos_oficina_central", registro.id, datos);
        else void respaldos.subirA(await crearConId("egresos_oficina_central", datos));
      },
      () => { alGuardado(); alCerrar(); },
    );
  }

  return <>
    <Dialogo titulo={registro ? "Editar egreso de Oficina Central" : "Nuevo egreso de Oficina Central"} abierto alCerrar={alCerrar}
      descripcion="Basta con el monto neto: el IVA (19%) y el total se calculan solos.">
      <form onSubmit={guardar}>
        <Campos>
          <CampoSeleccion etiqueta="Categoría" ayuda="Qué tipo de gasto es." opciones={opcionesCategoria} requerido {...formulario.campo("categoria")} />
          <CampoSeleccion etiqueta="Centro de costo" ayuda="Para quién o para qué se gastó." opciones={opcionesCentro} requerido {...formulario.campo("centro_costo")} />
          <CampoFecha etiqueta="Fecha del egreso" requerido {...formulario.campo("fecha")} />
          <CampoTexto etiqueta={formulario.datos.categoria === "reembolsos" ? "Quién rindió (a quién se le devuelve)" : "Proveedor o beneficiario"} requerido {...formulario.campo("proveedor")} />
          <CampoTexto etiqueta="Nº de documento" valor={formulario.datos.documento ?? ""} alCambiar={(v) => formulario.cambiar("documento", v)} ayuda="Factura, boleta o comprobante, si existe." />
          <Ancho><CampoTexto etiqueta="Detalle" requerido {...formulario.campo("descripcion")} /></Ancho>
          <CampoDinero etiqueta="Neto" requerido {...formulario.campo("neto")} />
          <CampoSeleccion etiqueta="Estado de pago" opciones={[{ id: "pendiente", titulo: "Pendiente" }, { id: "pagado", titulo: "Pagado" }]} {...formulario.campo("estado")} />
          <ResumenIva neto={formulario.datos.neto} afecto={!exento} alCambiarAfecto={(v) => setExento(!v)} />
          <Ancho><CampoTexto etiqueta="Observaciones" valor={formulario.datos.observaciones ?? ""} alCambiar={(v) => formulario.cambiar("observaciones", v)} /></Ancho>
        </Campos>
        {registro && !categoriasSinIngresoAPagnol.includes(formulario.datos.categoria) && (
          <div className="px-6 pb-6">
            <IngresoAPagnol
              compraId={registro.id}
              origen="oficina"
              panolPorNombre="Oficina Central"
              lineas={[{ descripcion: registro.descripcion, cantidad: 1, precio_unitario: registro.neto }]}
            />
          </div>
        )}
        <Pie extra={<SeccionRespaldos respaldos={respaldos} />} error={formulario.error} guardando={formulario.guardando} alCancelar={alCerrar} alEliminar={registro ? borrado.abrir : undefined} />
      </form>
    </Dialogo>
    {registro && <Confirmacion abierto={borrado.confirmando} titulo="Eliminar egreso de Oficina Central"
      detalle={`Se eliminará ${registro.descripcion} por ${formatearPesos(registro.neto)} netos.`}
      error={borrado.error} procesando={borrado.borrando} alCancelar={borrado.cerrar} alConfirmar={borrado.confirmar} />}
  </>;
}
