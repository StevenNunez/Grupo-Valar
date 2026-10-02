"use client";

import { useState } from "react";
import { useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

const campo = "mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3.5 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";
const etiqueta = "text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft";
const boton = "rounded-full bg-cyan px-7 py-3 font-semibold text-white hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70";

export function FormularioPerfil() {
  const usuario = useUsuario();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");
  const [claveRepetida, setClaveRepetida] = useState("");
  const [mensajePerfil, setMensajePerfil] = useState("");
  const [mensajeClave, setMensajeClave] = useState("");
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);

  async function guardarPerfil(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return setMensajePerfil("Escribe tu nombre.");
    setMensajePerfil("");
    setGuardandoPerfil(true);
    try {
      const { data, error } = await supabase.from("perfiles")
        .update({ nombre: limpio })
        .eq("id", usuario.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("No se encontró tu perfil.");
      setMensajePerfil("Datos guardados.");
      // El encabezado escucha los cambios de sesión y vuelve a leer el perfil.
      void supabase.auth.refreshSession();
    } catch (fallo) {
      setMensajePerfil(fallo instanceof Error ? fallo.message : "No se pudo guardar el perfil.");
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function guardarClave(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensajeClave("");
    if (claveNueva.length < 10) return setMensajeClave("Usa al menos 10 caracteres.");
    if (claveNueva !== claveRepetida) return setMensajeClave("Las contraseñas nuevas no coinciden.");
    setGuardandoClave(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: claveNueva,
        current_password: claveActual,
      });
      if (error) throw error;
      setClaveActual("");
      setClaveNueva("");
      setClaveRepetida("");
      setMensajeClave("Contraseña cambiada.");
    } catch (fallo) {
      setMensajeClave(fallo instanceof Error ? fallo.message : "No se pudo cambiar la contraseña.");
    } finally {
      setGuardandoClave(false);
    }
  }

  return (
    <div className="mt-9 grid gap-6">
      <form onSubmit={guardarPerfil} className="rounded-2xl border border-mist-deep bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold">Datos personales</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="perfil-nombre" className={etiqueta}>Nombre</label>
            <input id="perfil-nombre" autoComplete="name" required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="perfil-cargo" className={etiqueta}>Cargo</label>
            <input id="perfil-cargo" value={usuario.cargo} readOnly className={`${campo} bg-mist/40 text-ink-soft`} />
            <p className="mt-1.5 text-xs text-ink-soft">Lo asigna el administrador.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Correo:</span> {usuario.correo}</p>
          <p><span className="font-semibold">Acceso:</span> {usuario.general === "soporte" ? "Soporte" : usuario.general ? "Administrador general" : Object.keys(usuario.accesos).length ? `${Object.keys(usuario.accesos).length} módulo(s)` : "Sin módulos"}</p>
        </div>
        {mensajePerfil && <p role="status" className="mt-5 text-sm text-ink-soft">{mensajePerfil}</p>}
        <button type="submit" disabled={guardandoPerfil} className={`${boton} mt-6`}>
          {guardandoPerfil ? "Guardando…" : "Guardar datos"}
        </button>
      </form>

      <form onSubmit={guardarClave} className="rounded-2xl border border-mist-deep bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold">Cambiar contraseña</h2>
        <p className="mt-2 text-sm text-ink-soft">Si no recuerdas la actual, sal y usa “¿Olvidaste tu contraseña?” en el ingreso.</p>
        <div className="mt-6 grid gap-5">
          <div>
            <label htmlFor="perfil-clave-actual" className={etiqueta}>Contraseña actual</label>
            <input id="perfil-clave-actual" type="password" autoComplete="current-password" required value={claveActual} onChange={(e) => setClaveActual(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="perfil-clave-nueva" className={etiqueta}>Nueva contraseña</label>
            <input id="perfil-clave-nueva" type="password" autoComplete="new-password" required minLength={10} value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="perfil-clave-repetida" className={etiqueta}>Repite la nueva contraseña</label>
            <input id="perfil-clave-repetida" type="password" autoComplete="new-password" required minLength={10} value={claveRepetida} onChange={(e) => setClaveRepetida(e.target.value)} className={campo} />
          </div>
        </div>
        {mensajeClave && <p role="status" className="mt-5 text-sm text-ink-soft">{mensajeClave}</p>}
        <button type="submit" disabled={guardandoClave} className={`${boton} mt-6`}>
          {guardandoClave ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}
