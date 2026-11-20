"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Boton } from "../ui/Boton";
import { Chip } from "../ui/Chip";
import { avisar } from "@/lib/avisos";
import { mensajeParaPersona } from "@/lib/errores";
import { formatearPesos } from "@/lib/formato";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { puede, useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";
import {
  borrarReglaCompra,
  cargarReglasCompra,
  guardarReglaCompra,
  type ReglaCompra,
} from "@/lib/abastecimiento/autorizacion";

/**
 * Quién autoriza las compras, cuánto y de qué contratos (0127).
 *
 * Cada fila es una FIRMA que se le exige a una OC según su neto. Si dos firmas
 * alcanzan el mismo monto, se piden las dos; dentro de una firma basta con que
 * firme una de sus personas. Mientras no haya ninguna firma activa, las
 * órdenes se emiten como siempre, sin autorización.
 *
 * La edita quien tiene «Cambiar parámetros». La base vuelve a revisarlo todo.
 */

type Persona = { id: string; nombre: string; cargo: string | null };
type Borrador = Omit<ReglaCompra, "id"> & { id?: string; clave: string };

const nueva = (orden: number): Borrador => ({
  clave: `nueva-${Date.now()}`,
  titulo: "",
  desde: 0,
  hasta: null,
  contratos: null,
  firmantes: [],
  activa: true,
  orden,
});

const soloDigitos = (t: string) => Number(t.replace(/\D/g, "") || 0);

export function VistaAprobaciones() {
  const usuario = useUsuario();
  const edita = puede(usuario, "parametros.editar");
  const [reglas, setReglas] = useState<Borrador[] | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [contratos, setContratos] = useState<ContratoBreve[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function traer() {
    const [r, c, p] = await Promise.all([
      cargarReglasCompra(),
      cargarContratosBreve({ conOficina: true }),
      supabase.from("perfiles").select("id, nombre, cargo").eq("empresa_id", usuario.empresa ?? "").order("nombre"),
    ]);
    return { reglas: r.map((x) => ({ ...x, clave: x.id })), contratos: c, personas: (p.data ?? []) as Persona[] };
  }

  function aplicar(d: Awaited<ReturnType<typeof traer>>) {
    setReglas(d.reglas);
    setContratos(d.contratos);
    setPersonas(d.personas);
  }

  const cargar = () => traer().then(aplicar);

  useEffect(() => {
    if (!usuario.empresa) return;
    let vigente = true;
    traer()
      .then((d) => vigente && aplicar(d))
      .catch((e) => vigente && setError(mensajeParaPersona(e, "VistaAprobaciones")));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario.empresa]);

  const cambiar = (clave: string, cambio: Partial<Borrador>) =>
    setReglas((rs) => rs?.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)) ?? rs);

  async function guardar(r: Borrador) {
    setError(null);
    try {
      await guardarReglaCompra(r);
      avisar("Firma guardada");
      await cargar();
    } catch (e) {
      setError(mensajeParaPersona(e, "VistaAprobaciones"));
    }
  }

  async function borrar(r: Borrador) {
    setError(null);
    if (!r.id) return setReglas((rs) => rs?.filter((x) => x.clave !== r.clave) ?? rs);
    try {
      await borrarReglaCompra(r.id);
      avisar("Firma eliminada");
      await cargar();
    } catch (e) {
      setError(mensajeParaPersona(e, "VistaAprobaciones"));
    }
  }

  const activas = (reglas ?? []).filter((r) => r.activa && r.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-ink">Aprobaciones</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Quién autoriza cada compra antes de que la orden se emita, según su monto neto y su contrato. Si una orden
        cae en dos tramos, necesita las dos firmas; dentro de cada tramo basta con que firme una de las personas.
        Quien crea la orden no puede autorizarla.
      </p>

      <section className="mt-8 rounded-2xl border border-mist-deep bg-white px-6 py-5 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Solicitudes</h2>
        <p className="mt-2 text-ink">
          Las solicitudes de compra no tienen monto: las aprueba quien tenga el switch <strong>«Aprobar solicitudes»</strong>{" "}
          para ese contrato, en{" "}
          <Link href="/usuarios/" className="font-semibold text-cyan-deep underline-offset-2 hover:underline">
            Usuarios y accesos
          </Link>
          .
        </p>
      </section>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Compras (órdenes de compra)</h2>
        {activas.length === 0 && reglas && <Chip tono="neutro">Sin firmas: las órdenes se emiten sin autorización</Chip>}
      </div>

      {!reglas ? (
        <p className="mt-6 text-sm text-ink-soft">{error ?? "Cargando…"}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {reglas.length === 0 && (
            <p className="rounded-2xl border border-dashed border-mist-deep px-6 py-8 text-center text-sm text-ink-soft">
              Todavía no hay firmas. Agrega, por ejemplo, «Administrador de contrato» para cualquier monto y
              «Gerencia» desde $500.001.
            </p>
          )}

          {reglas.map((r) => (
            <section key={r.clave} className={`rounded-2xl border bg-white ${r.activa ? "border-mist-deep" : "border-dashed border-mist-deep opacity-75"}`}>
              <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-semibold text-ink">Nombre de la firma</span>
                  <input
                    value={r.titulo}
                    disabled={!edita}
                    placeholder="Administrador de contrato"
                    onChange={(e) => cambiar(r.clave, { titulo: e.target.value })}
                    className="rounded-xl border border-mist-deep px-3.5 py-2.5 text-sm disabled:bg-mist/40"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-ink">Desde (neto)</span>
                  <input
                    inputMode="numeric"
                    value={r.desde ? formatearPesos(r.desde) : "$0"}
                    disabled={!edita}
                    onChange={(e) => cambiar(r.clave, { desde: soloDigitos(e.target.value) })}
                    className="rounded-xl border border-mist-deep px-3.5 py-2.5 text-sm tabular-nums disabled:bg-mist/40"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-ink">Hasta (neto)</span>
                  <input
                    inputMode="numeric"
                    value={r.hasta === null ? "" : formatearPesos(r.hasta)}
                    placeholder="Sin tope"
                    disabled={!edita}
                    onChange={(e) => cambiar(r.clave, { hasta: e.target.value.replace(/\D/g, "") ? soloDigitos(e.target.value) : null })}
                    className="rounded-xl border border-mist-deep px-3.5 py-2.5 text-sm tabular-nums disabled:bg-mist/40"
                  />
                  <span className="text-xs text-ink-soft">Vacío = sin tope.</span>
                </label>

                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-semibold text-ink">Quiénes pueden firmar (basta uno)</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {personas.map((p) => {
                      const marcado = r.firmantes.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${marcado ? "border-cyan bg-cyan/10 text-cyan-deep" : "border-mist-deep text-ink-soft"}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-cyan-deep"
                            checked={marcado}
                            disabled={!edita}
                            onChange={(e) =>
                              cambiar(r.clave, {
                                firmantes: e.target.checked ? [...r.firmantes, p.id] : r.firmantes.filter((x) => x !== p.id),
                              })
                            }
                          />
                          {p.nombre}
                          {p.cargo && <span className="text-xs opacity-70">· {p.cargo}</span>}
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-soft">
                    Para abrir la orden, la persona tiene que tener acceso a Abastecimiento y a ese contrato.
                  </p>
                </fieldset>

                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-semibold text-ink">Contratos</legend>
                  <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="accent-cyan-deep"
                      checked={r.contratos === null}
                      disabled={!edita}
                      onChange={(e) => cambiar(r.clave, { contratos: e.target.checked ? null : [] })}
                    />
                    Todos (también Oficina Central y los que se creen después)
                  </label>
                  {r.contratos !== null && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {contratos.map((c) => {
                        const marcado = r.contratos!.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${marcado ? "border-cyan bg-cyan/10 text-cyan-deep" : "border-mist-deep text-ink-soft"}`}
                          >
                            <input
                              type="checkbox"
                              className="accent-cyan-deep"
                              checked={marcado}
                              disabled={!edita}
                              onChange={(e) =>
                                cambiar(r.clave, {
                                  contratos: e.target.checked ? [...r.contratos!, c.id] : r.contratos!.filter((x) => x !== c.id),
                                })
                              }
                            />
                            {c.nombreCorto || c.nombre}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>

                <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                  <input
                    type="checkbox"
                    className="accent-cyan-deep"
                    checked={r.activa}
                    disabled={!edita}
                    onChange={(e) => cambiar(r.clave, { activa: e.target.checked })}
                  />
                  Activa (apagada no se le pide a ninguna orden)
                </label>
              </div>

              {edita && (
                <div className="flex flex-wrap justify-end gap-2 border-t border-mist px-6 py-4">
                  <Boton variante="secundario" onClick={() => borrar(r)}>
                    {r.id ? "Eliminar" : "Descartar"}
                  </Boton>
                  <Boton onClick={() => guardar(r)}>Guardar</Boton>
                </div>
              )}
            </section>
          ))}

          {error && <p role="alert" className="rounded-xl bg-peligro-suave px-4 py-3 text-sm text-peligro">{error}</p>}

          {edita ? (
            <div>
              <Boton variante="secundario" onClick={() => setReglas((rs) => [...(rs ?? []), nueva((rs?.length ?? 0) + 1)])}>
                Agregar firma
              </Boton>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Solo quien puede cambiar parámetros edita las aprobaciones.</p>
          )}
        </div>
      )}
    </div>
  );
}
