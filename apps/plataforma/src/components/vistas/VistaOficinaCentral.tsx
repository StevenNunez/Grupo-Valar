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
  cargarEgresosOficina,
  categoriasOficina,
  totalOficina,
  type CategoriaOficina,
  type DatosEgresoOficina,
  type EgresoOficina,
} from "@/lib/oficina-central";
import {
  Ancho, CampoDinero, CampoFecha, CampoSeleccion, CampoTexto,
  Campos, Confirmacion, Dialogo, Pie, ResumenIva, ivaDe, useBorrado, useFormulario,
} from "../ui/Formulario";
import { DialogoHistorial } from "../ui/Historial";
import { Buscador, coincide } from "../ui/Buscador";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";

type FiltroCategoria = "todos" | CategoriaOficina;
type Estatus = "todos" | "porPagar" | "pagados" | "sinDocumento";

const estatusGasto: { id: Estatus; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "porPagar", titulo: "Por pagar" },
  { id: "pagados", titulo: "Pagados" },
  { id: "sinDocumento", titulo: "Sin documento" },
];

const nombreCategoria = Object.fromEntries(
  categoriasOficina.map((categoria) => [categoria.id, categoria.titulo]),
) as Record<CategoriaOficina, string>;

function fechaHoy() {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function borradorNuevo(categoria: CategoriaOficina): DatosEgresoOficina {
  return {
    categoria,
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
  const { estado, recargar } = useConsulta(cargarEgresosOficina);
  const [categoria, setCategoria] = useFiltro<FiltroCategoria>("oficina-central:categoria", "todos");
  const [mes, setMes] = useFiltro("oficina-central:mes", "todos");
  const [estatus, setEstatus] = useFiltro<Estatus>("oficina-central:estatus", "todos");
  const [texto, setTexto] = useState("");
  const [formulario, setFormulario] = useState<{ registro: EgresoOficina | null; categoria: CategoriaOficina } | null>(null);
  const [historial, setHistorial] = useState<EgresoOficina | null>(null);
  const puedeCargar = usePuede("gestion.editar");

  return (
    <>
      <Encabezado
        titulo="Oficina Central"
        descripcion="Egresos generales de la empresa, separados de los contratos. Registra compras, arriendos, insumos y adquisición de activos. Los montos del resumen son netos de IVA."
        acciones={
          puedeCargar && (
            <button type="button" onClick={() => setFormulario({ registro: null, categoria: categoria === "todos" ? "compras" : categoria })}
              className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-deep">
              Nuevo egreso
            </button>
          )
        }
      />
      <Contenido consulta={estado}>
        {(filas) => {
          const meses = [...new Set(filas.map((fila) => fila.fecha.slice(0, 7)))].sort().reverse();
          const delMes = mes === "todos" ? filas : filas.filter((fila) => fila.fecha.startsWith(mes));
          // Período y estatus recortan todo; la categoría, además, la lista y las tarjetas de arriba.
          const delEstatus = delMes.filter((fila) =>
            estatus === "porPagar" ? fila.estado === "pendiente"
              : estatus === "pagados" ? fila.estado === "pagado"
              : estatus === "sinDocumento" ? !fila.documento
              : true);
          const delTexto = (categoria === "todos" ? delEstatus : delEstatus.filter((fila) => fila.categoria === categoria));
          const visibles = delTexto.filter((fila) =>
            coincide(texto, [fila.proveedor, fila.descripcion, fila.documento, fila.observaciones]),
          );
          const porCategoria = Object.fromEntries(
            categoriasOficina.map(({ id }) => [id, totalOficina(delEstatus.filter((fila) => fila.categoria === id))]),
          ) as Record<CategoriaOficina, number>;
          const porPagar = visibles.filter((fila) => fila.estado === "pendiente");
          const sinDocumento = visibles.filter((fila) => !fila.documento);
          const activos = visibles.filter((fila) => fila.categoria === "activos");
          return (
            <>
              <Resumen datos={[
                { etiqueta: "Egresos netos", valor: formatearMonto(totalOficina(visibles)), nota: `${visibles.length} ${visibles.length === 1 ? "movimiento" : "movimientos"} · incluye compra de activos` },
                { etiqueta: "Gastos operativos", valor: formatearMonto(totalOficina(visibles.filter((fila) => fila.categoria !== "activos"))), nota: "Compras, arriendos, insumos y reembolsos" },
                { etiqueta: "Compra de activos", valor: formatearMonto(totalOficina(activos)), nota: `${activos.length} ${activos.length === 1 ? "activo" : "activos"} · inversión identificada aparte` },
                { etiqueta: "Pendiente de pago", valor: formatearMonto(totalOficina(porPagar)), nota: `${porPagar.length} por pagar${sinDocumento.length > 0 ? ` · ${sinDocumento.length} sin documento` : ""} · neto`,
                  acento: porPagar.length > 0 ? "aviso" : undefined },
              ]} />
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {categoriasOficina.map(({ id, titulo }) => (
                  <button key={id} type="button" onClick={() => setCategoria(categoria === id ? "todos" : id)}
                    aria-pressed={categoria === id}
                    className={`rounded-2xl border p-5 text-left transition-colors ${categoria === id ? "border-cyan bg-cyan/5" : "border-mist-deep bg-white hover:border-cyan"}`}>
                    <span className="block text-sm font-semibold text-ink">{titulo}</span>
                    <span className="mt-2 block font-display text-xl font-semibold text-ink">{formatearMonto(porCategoria[id])}</span>
                    <span className="mt-2 block text-xs text-cyan-deep">{categoria === id ? "Ver todos" : `Ver ${titulo.toLowerCase()}`}</span>
                  </button>
                ))}
              </div>
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
                    <Filtro etiqueta="Categoría" opciones={[{ id: "todos", titulo: "Todos" }, ...categoriasOficina]} valor={categoria} alCambiar={setCategoria} />
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Estatus">
                    <Filtro etiqueta="Estatus" opciones={estatusGasto} valor={estatus} alCambiar={setEstatus} />
                  </CampoFiltro>
                </>}>
                <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar egresos" placeholder="Buscar por proveedor, descripción o documento…" />
                <Tabla filas={visibles} claveDe={(fila) => fila.id} vacio={texto.trim() ? "Ningún egreso coincide con la búsqueda." : "Aún no hay egresos de oficina central para este filtro."}
                  columnas={columnas(puedeCargar ? (fila) => setFormulario({ registro: fila, categoria: fila.categoria }) : null, setHistorial)}
                  pie={<><Total colSpan={4}>Total neto</Total><Total derecha>{formatearPesos(totalOficina(visibles))}</Total><Total colSpan={2} /></>} />
              </Panel>
            </>
          );
        }}
      </Contenido>
      {formulario && (
        <FormularioOficina key={formulario.registro?.id ?? formulario.categoria}
          registro={formulario.registro} categoriaInicial={formulario.categoria}
          alCerrar={() => setFormulario(null)} alGuardado={recargar} />
      )}
      {historial && <DialogoHistorial tabla="egresos_oficina_central" registroId={historial.id}
        titulo={historial.descripcion} abierto alCerrar={() => setHistorial(null)} />}
    </>
  );
}

function columnas(editar: ((fila: EgresoOficina) => void) | null, verHistorial: (fila: EgresoOficina) => void): Columna<EgresoOficina>[] {
  return [
    { clave: "fecha", titulo: "Fecha", encabezado: true, celda: (f) => formatearFecha(f.fecha) },
    { clave: "categoria", titulo: "Categoría", celda: (f) => nombreCategoria[f.categoria] },
    { clave: "detalle", titulo: "Detalle", celda: (f) => <><span className="block font-semibold text-ink">{f.descripcion}</span><span className="text-xs text-ink-soft">{f.proveedor}{f.documento ? ` · ${f.documento}` : ""}</span></> },
    { clave: "estado", titulo: "Pago", celda: (f) => <span className={f.estado === "pagado" ? "text-[#0e7a4f]" : "text-[#8a5a09]"}>{f.estado === "pagado" ? "Pagado" : "Pendiente"}</span> },
    { clave: "neto", titulo: "Neto", derecha: true, celda: (f) => formatearPesos(f.neto) },
    { clave: "iva", titulo: "IVA", derecha: true, celda: (f) => formatearPesos(f.iva) },
    { clave: "acciones", titulo: "Acciones", celda: (f) => <div className="flex gap-3 whitespace-nowrap">{editar && <button type="button" onClick={() => editar(f)} className="font-semibold text-cyan-deep hover:underline">Editar</button>}<button type="button" onClick={() => verHistorial(f)} className="text-ink-soft hover:underline">Historial</button></div> },
  ];
}

function FormularioOficina({ registro, categoriaInicial, alCerrar, alGuardado }: {
  registro: EgresoOficina | null;
  categoriaInicial: CategoriaOficina;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const inicial: DatosEgresoOficina = registro ? {
    categoria: registro.categoria, fecha: registro.fecha, proveedor: registro.proveedor,
    descripcion: registro.descripcion, documento: registro.documento, neto: registro.neto,
    iva: registro.iva, estado: registro.estado, observaciones: registro.observaciones,
  } : borradorNuevo(categoriaInicial);
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
          <CampoSeleccion etiqueta="Categoría" opciones={[...categoriasOficina]} requerido {...formulario.campo("categoria")} />
          <CampoFecha etiqueta="Fecha del egreso" requerido {...formulario.campo("fecha")} />
          <CampoTexto etiqueta={formulario.datos.categoria === "reembolsos" ? "Quién rindió (a quién se le devuelve)" : "Proveedor o beneficiario"} requerido {...formulario.campo("proveedor")} />
          <CampoTexto etiqueta="Nº de documento" valor={formulario.datos.documento ?? ""} alCambiar={(v) => formulario.cambiar("documento", v)} ayuda="Factura, boleta o comprobante, si existe." />
          <Ancho><CampoTexto etiqueta="Detalle" requerido {...formulario.campo("descripcion")} /></Ancho>
          <CampoDinero etiqueta="Neto" requerido {...formulario.campo("neto")} />
          <CampoSeleccion etiqueta="Estado de pago" opciones={[{ id: "pendiente", titulo: "Pendiente" }, { id: "pagado", titulo: "Pagado" }]} {...formulario.campo("estado")} />
          <ResumenIva neto={formulario.datos.neto} afecto={!exento} alCambiarAfecto={(v) => setExento(!v)} />
          <Ancho><CampoTexto etiqueta="Observaciones" valor={formulario.datos.observaciones ?? ""} alCambiar={(v) => formulario.cambiar("observaciones", v)} /></Ancho>
        </Campos>
        {registro && formulario.datos.categoria !== "arriendos" && (
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
