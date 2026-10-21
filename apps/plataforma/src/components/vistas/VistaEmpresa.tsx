"use client";

import { useEffect, useState } from "react";
import { avisar } from "@/lib/avisos";
import { useEmpresa, useRecargarEmpresa } from "@/lib/empresa-cliente";
import { puede, useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

/**
 * Los datos de la empresa activa: cómo se llama en pantalla y lo que sale
 * impreso en las órdenes de compra, los PDF, los correos y los informes.
 *
 * Edita quien tiene el permiso «Cambiar parámetros» (el RLS de `empresas`
 * decide de verdad; acá solo se esconde el formulario). Cambiar un dato no toca
 * lo ya enviado: las solicitudes de cotización guardan la foto de cuando salieron.
 */

type Campos = {
  nombre: string;
  razon_social: string;
  nombre_en_ordenes: string;
  rut: string;
  direccion: string;
  ciudad: string;
  region: string;
  email_contacto: string;
  representante: string;
};

const GRUPOS: { titulo: string; nota?: string; campos: { clave: keyof Campos; etiqueta: string; ayuda?: string; tipo?: string }[] }[] = [
  {
    titulo: "Nombre",
    campos: [
      { clave: "nombre", etiqueta: "Nombre en pantalla", ayuda: "Como se ve en el selector de empresa y en los encabezados. Ej.: Valar SpA." },
      { clave: "razon_social", etiqueta: "Razón social", ayuda: "La legal. Sale en los correos, los informes y el pie de página." },
      { clave: "nombre_en_ordenes", etiqueta: "Nombre en las órdenes de compra", ayuda: "Como te conoce el proveedor: va impreso en la OC y en la solicitud de cotización." },
    ],
  },
  {
    titulo: "Datos legales",
    campos: [
      { clave: "rut", etiqueta: "RUT" },
      { clave: "representante", etiqueta: "Representante legal", ayuda: "Autoriza las órdenes de compra y firma los informes." },
    ],
  },
  {
    titulo: "Dirección y contacto",
    campos: [
      { clave: "direccion", etiqueta: "Dirección", ayuda: "Calle y número." },
      { clave: "ciudad", etiqueta: "Ciudad" },
      { clave: "region", etiqueta: "Región" },
      { clave: "email_contacto", etiqueta: "Correo de contacto", tipo: "email" },
    ],
  },
];

export function VistaEmpresa() {
  const usuario = useUsuario();
  const datos = useEmpresa();
  const recargar = useRecargarEmpresa();
  const edita = puede(usuario, "parametros.editar");
  const [valores, setValores] = useState<Campos | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los valores se leen una vez de la base, tal como están (sin los de por defecto
  // que completan lo vacío), para que lo que se ve en el formulario sea lo guardado.
  useEffect(() => {
    if (!usuario.empresa) return;
    let vigente = true;
    supabase
      .from("empresas")
      .select("nombre, razon_social, nombre_en_ordenes, rut, direccion, ciudad, region, email_contacto, representante")
      .eq("id", usuario.empresa)
      .maybeSingle()
      .then(({ data, error: falla }) => {
        if (!vigente) return;
        if (falla) return setError(falla.message);
        const f = (data ?? {}) as Partial<Record<keyof Campos, string | null>>;
        setValores({
          nombre: f.nombre ?? "",
          razon_social: f.razon_social ?? "",
          nombre_en_ordenes: f.nombre_en_ordenes ?? "",
          rut: f.rut ?? "",
          direccion: f.direccion ?? "",
          ciudad: f.ciudad ?? "",
          region: f.region ?? "",
          email_contacto: f.email_contacto ?? "",
          representante: f.representante ?? "",
        });
      });
    return () => {
      vigente = false;
    };
  }, [usuario.empresa]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valores || !usuario.empresa) return;
    if (!valores.nombre.trim()) return setError("El nombre en pantalla no puede quedar vacío.");
    setGuardando(true);
    setError(null);
    const limpio = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.trim() || null]));
    const { data, error: falla } = await supabase.from("empresas").update(limpio).eq("id", usuario.empresa).select("id");
    setGuardando(false);
    if (falla) return setError(falla.message);
    // El RLS no avisa cuando no deja escribir: simplemente no cambia ninguna fila.
    if (!data?.length) return setError("Tu acceso no permite cambiar los datos de la empresa.");
    recargar();
    avisar("Cambios guardados");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-ink">Datos de la empresa</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Lo que sale escrito en las órdenes de compra, los PDF, los correos y los informes. Cada empresa tiene los suyos.
        Lo ya enviado a proveedores no cambia.
      </p>

      {!valores ? (
        <p className="mt-8 text-sm text-ink-soft">{error ?? "Cargando…"}</p>
      ) : (
        <form onSubmit={guardar} className="mt-8 flex flex-col gap-6">
          {GRUPOS.map((g) => (
            <section key={g.titulo} className="rounded-2xl border border-mist-deep bg-white">
              <h2 className="border-b border-mist px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{g.titulo}</h2>
              <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
                {g.campos.map((c) => (
                  <label key={c.clave} className={`flex flex-col gap-1.5 ${c.ayuda && c.ayuda.length > 60 ? "sm:col-span-2" : ""}`}>
                    <span className="text-sm font-semibold text-ink">{c.etiqueta}</span>
                    <input
                      type={c.tipo ?? "text"}
                      value={valores[c.clave]}
                      disabled={!edita}
                      onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })}
                      className="rounded-xl border border-mist-deep bg-white px-3.5 py-2.5 text-sm text-ink disabled:bg-mist/40 disabled:text-ink-soft"
                    />
                    {c.ayuda && <span className="text-xs text-ink-soft">{c.ayuda}</span>}
                  </label>
                ))}
              </div>
            </section>
          ))}

          <p className="text-xs text-ink-soft">
            Así se ve hoy en una orden de compra: <strong className="text-ink">{datos.nombreEnOrdenes}</strong> · RUT {datos.rut} · {datos.direccion}, {datos.ciudad}
          </p>

          {error && <p role="alert" className="rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">{error}</p>}

          {edita ? (
            <div>
              <button
                type="submit"
                disabled={guardando}
                className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Solo quien puede cambiar parámetros edita estos datos.</p>
          )}
        </form>
      )}
    </div>
  );
}
