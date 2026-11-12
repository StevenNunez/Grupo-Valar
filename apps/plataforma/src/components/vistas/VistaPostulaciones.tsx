"use client";

import { mensajeParaPersona } from "@/lib/errores";

import { useMemo, useState } from "react";
import { Buscador } from "../ui/Buscador";
import { Chip, type Tono } from "../ui/Chip";
import { Campos, CampoSeleccion, Dialogo, Pie, useFormulario, Ancho } from "../ui/Formulario";
import { Tabla, type Columna } from "../ui/Tabla";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha } from "@/lib/formato";
import { useListaServidor, useRetardado } from "@/lib/lista-servidor";
import {
  areasPostulacion, cargarPaginaPostulaciones, cargarResumenPostulaciones, eliminarPostulacion, enlaceDelCV,
  estadosPostulacion, guardarGestion, MESES_DE_CONSERVACION,
  type EstadoPostulacion, type FiltrosPostulaciones, type Postulacion,
} from "@/lib/postulaciones";

/**
 * La base de postulantes de «Trabaja con nosotros»: llegan solas desde el sitio
 * público. Acá se buscan por nombre, ciudad o área, se abre el CV, se anota qué
 * pasó con cada persona y, si lo pide o vence la conservación, se elimina.
 */

const tonoDe: Record<EstadoPostulacion, Tono> = {
  nueva: "info",
  en_revision: "aviso",
  contactada: "bueno",
  contratada: "bueno",
  descartada: "neutro",
};

const tituloDe = (e: string) => estadosPostulacion.find((x) => x.id === e)?.titulo ?? e;

function vencida(creadoEn: string) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_DE_CONSERVACION);
  return new Date(creadoEn) < limite;
}

const peso = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function VistaPostulaciones() {
  const resumen = useConsulta(cargarResumenPostulaciones);
  const [estado, setEstado] = useState<FiltrosPostulaciones["estado"]>("todos");
  const [area, setArea] = useState("todas");
  const [texto, setTexto] = useState("");
  const textoBuscado = useRetardado(texto);
  const [abierta, setAbierta] = useState<Postulacion | null>(null);

  const filtros = useMemo<FiltrosPostulaciones>(() => ({ texto: textoBuscado, estado, area }), [textoBuscado, estado, area]);
  const lista = useListaServidor<Postulacion, FiltrosPostulaciones>({ traer: cargarPaginaPostulaciones, filtros });

  const recargar = () => {
    resumen.recargar();
    lista.recargar();
  };

  const columnas: Columna<Postulacion>[] = [
    {
      clave: "nombre", titulo: "Postulante", encabezado: true,
      celda: (p) => (
        <div>
          <span className="block font-semibold text-ink">{p.nombre}</span>
          <a href={`mailto:${p.correo}`} className="text-xs text-cyan-deep hover:underline">{p.correo}</a>
        </div>
      ),
    },
    { clave: "area", titulo: "Área", celda: (p) => <span>{p.area}<span className="block text-xs text-ink-soft">{p.experiencia}</span></span> },
    { clave: "ciudad", titulo: "Ciudad", celda: (p) => p.ciudad },
    { clave: "tel", titulo: "Teléfono", celda: (p) => <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className="hover:underline">{p.telefono}</a> },
    {
      clave: "fecha", titulo: "Recibida",
      celda: (p) => (
        <span>
          {formatearFecha(p.creadoEn.slice(0, 10))}
          {vencida(p.creadoEn) && <span className="mt-1 block"><Chip tono="aviso">Pasó los {MESES_DE_CONSERVACION} meses</Chip></span>}
        </span>
      ),
    },
    { clave: "estado", titulo: "Estado", celda: (p) => <Chip tono={tonoDe[p.estado] ?? "neutro"}>{tituloDe(p.estado)}</Chip> },
    {
      clave: "acciones", titulo: "Acciones", fija: true,
      celda: (p) => (
        <button type="button" onClick={() => setAbierta(p)} className="font-semibold text-cyan-deep hover:underline">
          Ver y gestionar
        </button>
      ),
    },
  ];

  return (
    <>
      <Encabezado
        titulo="Postulaciones"
        descripcion="Currículums que llegan desde «Trabaja con nosotros» en el sitio de Valar. Es la base de postulantes para cuando haga falta personal: búscalos por área o ciudad, abre su CV y anota qué pasó con cada uno."
      />

      <Contenido consulta={resumen.estado}>
        {(r) => (
          <Resumen
            datos={[
              { etiqueta: "Postulaciones", valor: String(r.total), nota: "En la base" },
              { etiqueta: "Nuevas", valor: String(r.nuevas), nota: r.nuevas ? "Sin revisar" : "Todo revisado", acento: r.nuevas ? "aviso" : "bueno" },
              { etiqueta: "En revisión", valor: String(r.enRevision) },
              { etiqueta: "Contactadas", valor: String(r.contactadas) },
              {
                etiqueta: `Pasaron ${MESES_DE_CONSERVACION} meses`, valor: String(r.vencidas),
                nota: r.vencidas ? "La política de privacidad promete eliminarlas" : "Nada por eliminar",
                acento: r.vencidas ? "aviso" : "bueno",
              },
            ]}
          />
        )}
      </Contenido>

      <Panel
        titulo="Postulantes"
        nota={`${lista.filas.length}${lista.hayMas ? "+" : ""} mostrados`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Estado">
              <Filtro
                etiqueta="Estado"
                opciones={[{ id: "todos" as FiltrosPostulaciones["estado"], titulo: "Todos" }, ...estadosPostulacion.map((e) => ({ id: e.id as FiltrosPostulaciones["estado"], titulo: e.titulo }))]}
                valor={estado}
                alCambiar={setEstado}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Área">
              <Desplegable
                etiqueta="Área"
                valor={area}
                alCambiar={setArea}
                grupos={[{ opciones: [{ id: "todas", titulo: "Todas las áreas" }, ...areasPostulacion.map((a) => ({ id: a, titulo: a }))] }]}
              />
            </CampoFiltro>
          </>
        }
      >
        <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar postulantes" placeholder="Buscar por nombre, correo, ciudad o teléfono…" />
        {lista.error ? (
          <p role="alert" className="px-6 py-10 text-center text-sm text-peligro lg:px-8">
            No se pudo cargar la lista: {lista.error}{" "}
            <button type="button" onClick={lista.recargar} className="font-semibold underline">Reintentar</button>
          </p>
        ) : lista.cargando && lista.filas.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-ink-soft lg:px-8">Cargando postulaciones…</p>
        ) : (
          <Tabla
            filas={lista.filas}
            claveDe={(p) => p.id}
            columnas={columnas}
            vacio={texto.trim() ? "Ninguna postulación coincide con la búsqueda." : "Todavía no hay postulaciones. Llegan solas cuando alguien envía su CV desde el sitio."}
          />
        )}
        {lista.hayMas && !lista.error && (
          <div className="flex justify-center border-t border-mist px-6 py-4">
            <button
              type="button"
              onClick={lista.cargarMas}
              disabled={lista.cargandoMas}
              className="rounded-full border border-mist-deep px-5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
            >
              {lista.cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </Panel>

      {abierta && <DetallePostulacion key={abierta.id} p={abierta} alCerrar={() => setAbierta(null)} alCambiar={recargar} />}
    </>
  );
}

function DetallePostulacion({ p, alCerrar, alCambiar }: { p: Postulacion; alCerrar: () => void; alCambiar: () => void }) {
  const f = useFormulario<{ estado: EstadoPostulacion; notas: string }>({ estado: p.estado, notas: p.notas ?? "" });
  const [abriendo, setAbriendo] = useState(false);
  const [errorCV, setErrorCV] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<"no" | "confirmar" | "trabajando">("no");
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  async function verCV() {
    setAbriendo(true);
    setErrorCV(null);
    try {
      window.open(await enlaceDelCV(p.cvRuta), "_blank", "noopener");
    } catch (e) {
      setErrorCV(mensajeParaPersona(e, "VistaPostulaciones"));
    } finally {
      setAbriendo(false);
    }
  }

  async function borrar() {
    setBorrando("trabajando");
    setErrorBorrado(null);
    try {
      await eliminarPostulacion(p);
      alCambiar();
      alCerrar();
    } catch (e) {
      setErrorBorrado(mensajeParaPersona(e, "VistaPostulaciones"));
      setBorrando("confirmar");
    }
  }

  const dato = (etiqueta: string, valor: React.ReactNode) => (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{etiqueta}</dt>
      <dd className="mt-1 text-sm text-ink">{valor}</dd>
    </div>
  );

  return (
    <Dialogo titulo={p.nombre} descripcion={`Postuló el ${formatearFecha(p.creadoEn.slice(0, 10))} · ${p.area}`} abierto alCerrar={alCerrar} ancho="max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void f.enviar(() => guardarGestion(p.id, f.datos.estado, f.datos.notas), () => {
            alCambiar();
            alCerrar();
          });
        }}
      >
        <dl className="grid gap-5 px-6 pt-6 sm:grid-cols-2">
          {dato("Correo", <a href={`mailto:${p.correo}`} className="text-cyan-deep hover:underline">{p.correo}</a>)}
          {dato("Teléfono", <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className="hover:underline">{p.telefono}</a>)}
          {dato("Ciudad", p.ciudad)}
          {dato("Experiencia", p.experiencia)}
          {p.mensaje && <div className="sm:col-span-2">{dato("Mensaje", <span className="whitespace-pre-wrap">{p.mensaje}</span>)}</div>}
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Currículum</dt>
            <dd className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void verCV()}
                disabled={abriendo}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-soft disabled:opacity-60"
              >
                {abriendo ? "Abriendo…" : "Abrir CV"}
              </button>
              <span className="text-xs text-ink-soft">{p.cvNombre} · {peso(p.cvTamano)}</span>
            </dd>
            {errorCV && <p role="alert" className="mt-2 text-sm text-peligro">{errorCV}</p>}
          </div>
          {dato("Aceptó la política de privacidad", `versión ${p.versionPrivacidad.split("-").reverse().join("-")}`)}
        </dl>

        <Campos>
          <CampoSeleccion
            etiqueta="Estado"
            valor={f.datos.estado}
            opciones={estadosPostulacion.map((e) => ({ id: e.id, titulo: e.titulo }))}
            alCambiar={(v) => f.cambiar("estado", v)}
          />
          <Ancho>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Notas internas</span>
              <textarea
                value={f.datos.notas}
                onChange={(e) => f.cambiar("notas", e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Entrevista, referencias, disponibilidad, por qué se descartó…"
                className="w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-sm text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
              />
            </label>
          </Ancho>
        </Campos>

        <div className="mx-6 mb-2 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3 text-sm">
          {borrando === "no" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-ink-soft">
                {vencida(p.creadoEn)
                  ? `Pasó los ${MESES_DE_CONSERVACION} meses de conservación: corresponde eliminarla.`
                  : "A pedido de la persona, o al vencer la conservación, se elimina con su CV."}
              </span>
              <button type="button" onClick={() => setBorrando("confirmar")} className="font-semibold text-peligro hover:underline">
                Eliminar postulación…
              </button>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-peligro">¿Eliminar a {p.nombre} y su CV? No se puede deshacer.</p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => void borrar()}
                  disabled={borrando === "trabajando"}
                  className="rounded-full bg-peligro px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {borrando === "trabajando" ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button type="button" onClick={() => setBorrando("no")} disabled={borrando === "trabajando"} className="rounded-full border border-mist-deep px-5 py-2 text-sm font-semibold text-ink-soft">
                  No
                </button>
              </div>
              {errorBorrado && <p role="alert" className="mt-2 text-peligro">{errorBorrado}</p>}
            </div>
          )}
        </div>

        <Pie error={f.error} guardando={f.guardando} alCancelar={alCerrar} />
      </form>
    </Dialogo>
  );
}
