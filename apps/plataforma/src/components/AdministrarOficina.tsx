"use client";

import { mensajeParaPersona } from "@/lib/errores";

import { useState, type FormEvent } from "react";
import { Chip } from "./ui/Chip";
import { Dialogo } from "./ui/Formulario";
import { useConsulta } from "@/lib/consulta";
import { CENTRO_GENERAL, cargarCatalogoOficina, idDesdeNombre } from "@/lib/oficina-central";
import { supabase } from "@/lib/supabase";
import { usePuede } from "@/lib/sesion";

/**
 * Las dos listas que ordenan los egresos de Oficina Central:
 *
 *   · CATEGORÍAS     → qué tipo de gasto es (compras, internet, mantención…).
 *   · CENTROS DE COSTO → para quién o para qué se gastó (Pagnol, Tokio, general…).
 *
 * Nada se borra: una categoría o un centro con movimientos no puede
 * desaparecer sin dejar huérfanos. Se APAGA, y deja de ofrecerse al cargar un
 * egreso nuevo; los movimientos viejos siguen mostrándola.
 */

const claseInput = "min-w-0 flex-1 rounded-xl border border-mist-deep bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-cyan";
const claseBoton = "shrink-0 rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink";

export function AdministrarOficina({ alCerrar, alCambiar }: { alCerrar: () => void; alCambiar: () => void }) {
  const { estado, recargar } = useConsulta(cargarCatalogoOficina);
  const puedeEditar = usePuede("gestion.editar");
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(accion: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error: fallo } = await accion();
    if (fallo) {
      setError(/duplicate key/i.test(fallo.message) ? "Ya existe uno con ese nombre." : /row-level security|permission denied/i.test(fallo.message) ? "Tu acceso no permite este cambio." : mensajeParaPersona(fallo, "AdministrarOficina"));
      return false;
    }
    recargar();
    alCambiar();
    return true;
  }

  return (
    <Dialogo titulo="Categorías y centros de costo" abierto alCerrar={alCerrar} ancho="max-w-3xl"
      descripcion="Oficina Central · lo que se defina acá es lo que aparece al cargar un egreso">
      {estado.estado === "cargando" && <p className="px-6 py-12 text-center text-sm text-ink-soft">Cargando…</p>}
      {estado.estado === "error" && <p role="alert" className="px-6 py-12 text-center text-sm text-peligro">{estado.mensaje}</p>}
      {estado.estado === "listo" && (
        <div className="flex flex-col gap-8 px-6 py-6">
          {error && <p role="alert" className="rounded-xl bg-peligro-suave px-4 py-3 text-sm text-peligro">{error}</p>}

          <Lista
            titulo="Centros de costo"
            ayuda="Para quién o para qué se gastó: un proyecto, una empresa hermana, la propia oficina. Cada egreso va a un solo centro."
            vacioNuevo="Ej.: Pagnol, Tokio"
            puedeEditar={puedeEditar}
            filas={estado.datos.centros.map((c) => ({ id: c.id, nombre: c.nombre, activa: c.activo, fija: c.id === CENTRO_GENERAL, etiquetas: [] }))}
            alAgregar={(nombre) => ejecutar(() => supabase.from("centros_costo_oficina").insert({
              id: idDesdeNombre(nombre), nombre, orden: estado.datos.centros.length + 1,
            }))}
            alRenombrar={(id, nombre) => ejecutar(() => supabase.from("centros_costo_oficina").update({ nombre }).eq("id", id))}
            alActivar={(id, activa) => ejecutar(() => supabase.from("centros_costo_oficina").update({ activo: activa }).eq("id", id))}
          />

          <Lista
            titulo="Categorías"
            ayuda="Qué tipo de gasto es. «Inversión» marca lo que se compra para quedarse (equipos, herramientas): se informa aparte del gasto operativo."
            vacioNuevo="Ej.: Combustible, Honorarios"
            puedeEditar={puedeEditar}
            conInversion
            filas={estado.datos.categorias.map((c) => ({ id: c.id, nombre: c.titulo, activa: c.activa, fija: false, etiquetas: c.esActivo ? ["Inversión"] : [] }))}
            alAgregar={(nombre, inversion) => ejecutar(() => supabase.from("categorias_oficina").insert({
              id: idDesdeNombre(nombre), titulo: nombre, es_activo: inversion === true, orden: estado.datos.categorias.length + 1,
            }))}
            alRenombrar={(id, nombre) => ejecutar(() => supabase.from("categorias_oficina").update({ titulo: nombre }).eq("id", id))}
            alActivar={(id, activa) => ejecutar(() => supabase.from("categorias_oficina").update({ activa }).eq("id", id))}
          />

          <div className="flex justify-end border-t border-mist pt-4">
            <button type="button" onClick={alCerrar} className="rounded-full bg-cyan-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-hondo">Listo</button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

type Fila = { id: string; nombre: string; activa: boolean; fija: boolean; etiquetas: string[] };

function Lista({ titulo, ayuda, vacioNuevo, puedeEditar, conInversion, filas, alAgregar, alRenombrar, alActivar }: {
  titulo: string;
  ayuda: string;
  vacioNuevo: string;
  puedeEditar: boolean;
  conInversion?: boolean;
  filas: Fila[];
  alAgregar: (nombre: string, inversion?: boolean) => Promise<boolean>;
  alRenombrar: (id: string, nombre: string) => Promise<boolean>;
  alActivar: (id: string, activa: boolean) => Promise<boolean>;
}) {
  const [nuevo, setNuevo] = useState("");
  const [inversion, setInversion] = useState(false);
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function agregar(evento: FormEvent) {
    evento.preventDefault();
    const nombre = nuevo.trim();
    if (!nombre || idDesdeNombre(nombre) === "") return;
    if (filas.some((f) => f.id === idDesdeNombre(nombre))) return;
    setOcupado(true);
    if (await alAgregar(nombre, conInversion ? inversion : undefined)) { setNuevo(""); setInversion(false); }
    setOcupado(false);
  }

  async function guardarNombre() {
    if (!editando || !editando.nombre.trim()) return;
    setOcupado(true);
    if (await alRenombrar(editando.id, editando.nombre.trim())) setEditando(null);
    setOcupado(false);
  }

  const repetido = nuevo.trim() !== "" && filas.some((f) => f.id === idDesdeNombre(nuevo));

  return (
    <section>
      <h3 className="border-b border-mist pb-2 font-display text-sm font-semibold text-ink">{titulo}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{ayuda}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {filas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mist px-3.5 py-2.5">
            {editando?.id === f.id ? (
              <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void guardarNombre(); }}>
                <input autoFocus aria-label={`Nombre de ${f.nombre}`} value={editando.nombre} onChange={(e) => setEditando({ id: f.id, nombre: e.target.value })} className={claseInput} />
                <button type="submit" disabled={ocupado} className={claseBoton}>Guardar</button>
                <button type="button" onClick={() => setEditando(null)} className={claseBoton}>Cancelar</button>
              </form>
            ) : (
              <>
                <span className={`min-w-0 text-sm font-semibold ${f.activa ? "text-ink" : "text-ink-soft line-through"}`}>{f.nombre}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {f.etiquetas.map((e) => <Chip key={e} tono="info">{e}</Chip>)}
                  {!f.activa && <Chip tono="neutro">Apagada</Chip>}
                  {puedeEditar && (
                    <>
                      <button type="button" onClick={() => setEditando({ id: f.id, nombre: f.nombre })} className={claseBoton}>Renombrar</button>
                      {!f.fija && (
                        <button type="button" disabled={ocupado} className={claseBoton}
                          onClick={async () => { setOcupado(true); await alActivar(f.id, !f.activa); setOcupado(false); }}>
                          {f.activa ? "Apagar" : "Encender"}
                        </button>
                      )}
                    </>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      {puedeEditar && (
        <form onSubmit={agregar} className="mt-3 flex flex-wrap items-center gap-2">
          <input aria-label={`Nuevo en ${titulo}`} value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder={vacioNuevo} maxLength={60} className={claseInput} />
          {conInversion && (
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <input type="checkbox" checked={inversion} onChange={(e) => setInversion(e.target.checked)} />
              Es inversión
            </label>
          )}
          <button type="submit" disabled={ocupado || !nuevo.trim() || repetido}
            className="shrink-0 rounded-full bg-cyan-deep px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-hondo disabled:opacity-50">
            Agregar
          </button>
          {repetido && <span role="alert" className="w-full text-xs text-peligro">Ya existe uno con ese nombre.</span>}
        </form>
      )}
    </section>
  );
}
