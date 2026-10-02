"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CLAVE_ENLACE_ACCESO, supabase } from "@/lib/supabase";

type Enlace = { tipo: "recovery" | "invite"; sujeto: string };

function leerEnlace(): Enlace | null {
  try {
    const dato = JSON.parse(window.sessionStorage.getItem(CLAVE_ENLACE_ACCESO) ?? "null");
    return (dato?.tipo === "recovery" || dato?.tipo === "invite") && typeof dato.sujeto === "string" ? dato : null;
  } catch {
    return null;
  }
}

export function FormularioNuevaClave() {
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [estado, setEstado] = useState<"comprobando" | "listo" | "invalido" | "guardado">("comprobando");
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    const dato = leerEnlace();
    void supabase.auth.getSession().then(
      ({ data, error: fallo }) => {
        if (!vigente) return;
        const valido = !!dato && !fallo && data.session?.user.id === dato.sujeto;
        if (!valido) window.sessionStorage.removeItem(CLAVE_ENLACE_ACCESO);
        if (valido) setEnlace(dato);
        setEstado(valido ? "listo" : "invalido");
      },
      () => {
        if (vigente) setEstado("invalido");
      },
    );
    return () => { vigente = false; };
  }, []);

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    if (clave.length < 10) return setError("Usa al menos 10 caracteres.");
    if (clave !== repetida) return setError("Las contraseñas no coinciden.");
    if (!enlace || estado !== "listo" || guardando) return;
    setGuardando(true);
    try {
      const { data: sesion, error: falloSesion } = await supabase.auth.getSession();
      if (falloSesion || sesion.session?.user.id !== enlace.sujeto) throw new Error("El enlace ya no es válido. Solicita uno nuevo.");
      const { error: fallo } = await supabase.auth.updateUser({ password: clave });
      if (fallo) throw fallo;
      window.sessionStorage.removeItem(CLAVE_ENLACE_ACCESO);
      if (enlace.tipo === "recovery") await supabase.auth.signOut({ scope: "local" });
      setClave("");
      setRepetida("");
      setEstado("guardado");
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo guardar la contraseña.");
    } finally {
      setGuardando(false);
    }
  }

  if (estado === "comprobando") return <p role="status" className="mt-8 text-sm text-ink-soft">Comprobando el enlace…</p>;
  if (estado === "invalido") {
    return (
      <div className="mt-8 rounded-xl bg-[#fdeeec] p-5 text-sm text-[#a52f24]">
        <p>El enlace venció o no es válido.</p>
        <Link href="/recuperar/" className="mt-3 inline-block font-semibold underline">Solicitar otro enlace</Link>
      </div>
    );
  }
  if (estado === "guardado") {
    return (
      <div role="status" className="mt-8 rounded-xl bg-cyan/10 p-5 text-sm text-ink">
        <p>Tu contraseña quedó guardada.</p>
        <Link href={enlace?.tipo === "invite" ? "/modulos/" : "/"} className="mt-3 inline-block font-semibold text-cyan-deep underline">
          {enlace?.tipo === "invite" ? "Entrar a la plataforma" : "Iniciar sesión"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="mt-10 flex flex-col gap-5">
      <p className="text-sm text-ink-soft">{enlace?.tipo === "invite" ? "Crea la contraseña de tu cuenta invitada." : "El enlace fue validado. Crea tu nueva contraseña."}</p>
      <div>
        <label htmlFor="nueva-clave" className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Nueva contraseña</label>
        <input id="nueva-clave" type="password" autoComplete="new-password" required minLength={10} value={clave} onChange={(e) => setClave(e.target.value)} className="mt-2 w-full rounded-xl border border-mist-deep px-4 py-3.5 outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20" />
      </div>
      <div>
        <label htmlFor="confirmar-clave" className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Repite la contraseña</label>
        <input id="confirmar-clave" type="password" autoComplete="new-password" required minLength={10} value={repetida} onChange={(e) => setRepetida(e.target.value)} className="mt-2 w-full rounded-xl border border-mist-deep px-4 py-3.5 outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20" />
      </div>
      {error && <p role="alert" className="rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">{error}</p>}
      <button type="submit" disabled={guardando} className="rounded-full bg-cyan px-7 py-4 font-semibold text-white hover:bg-cyan-deep disabled:opacity-70">
        {guardando ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
