"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function FormularioRecuperacion() {
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      const { error: fallo } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/restablecer/`,
      });
      if (fallo) throw fallo;
      // La respuesta es la misma exista o no la cuenta.
      setEnviado(true);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo pedir el enlace. Intenta nuevamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <p role="status" className="mt-8 rounded-xl bg-cyan/10 p-5 text-sm leading-relaxed text-ink">
        Si ese correo tiene una cuenta, recibirás un enlace para restablecer la contraseña. Revisa también la carpeta de spam.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-10 flex flex-col gap-5">
      <div>
        <label htmlFor="correo-recuperacion" className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Correo de tu cuenta</label>
        <input
          id="correo-recuperacion" type="email" autoComplete="email" required
          value={correo} onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@grupovalar.cl"
          className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3.5 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
        />
      </div>
      {error && <p role="alert" className="rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">{error}</p>}
      <button type="submit" disabled={enviando} className="rounded-full bg-cyan px-7 py-4 font-semibold text-white hover:bg-cyan-deep disabled:opacity-70">
        {enviando ? "Enviando…" : "Enviar enlace"}
      </button>
    </form>
  );
}
