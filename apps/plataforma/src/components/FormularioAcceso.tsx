"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { empresa } from "@/lib/empresa";
import { mensajeDeError, useSesion } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

const DESTINO = "/modulos/";

export function FormularioAcceso() {
  const router = useRouter();
  const sesion = useSesion();
  const idCorreo = useId();
  const idPassword = useId();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Si ya hay sesión válida, no tiene sentido volver a pedir la clave.
  useEffect(() => {
    if (sesion.estado === "con-sesion") router.replace(DESTINO);
  }, [sesion.estado, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password,
    });

    if (fallo) {
      setEnviando(false);
      setError(mensajeDeError(fallo.message));
      return;
    }

    // El redirect lo hace el efecto de arriba en cuanto `useSesion` se entera;
    // dejamos el botón ocupado para que no se pueda enviar dos veces.
    router.replace(DESTINO);
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-5" noValidate>
      <div>
        <label
          htmlFor={idCorreo}
          className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft"
        >
          Correo corporativo
        </label>
        <input
          id={idCorreo}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@grupovalar.cl"
          className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3.5 text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
        />
      </div>

      <div>
        <label
          htmlFor={idPassword}
          className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft"
        >
          Contraseña
        </label>
        <div className="relative mt-2">
          <input
            id={idPassword}
            type={verPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-mist-deep bg-white px-4 py-3.5 pr-12 text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
          <button
            type="button"
            onClick={() => setVerPassword((v) => !v)}
            aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-soft transition-colors hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path
                d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="2.8" />
              {!verPassword && <path d="M4 20 20 4" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-cyan px-7 py-4 font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70"
      >
        {enviando ? "Ingresando…" : "Ingresar"}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <p className="text-center text-sm text-ink-soft">
        ¿Problemas para entrar?{" "}
        <a
          href={`mailto:${empresa.email}?subject=Acceso%20Plataforma%20Valar`}
          className="font-semibold text-cyan-deep underline underline-offset-2"
        >
          Escríbenos
        </a>
      </p>

      {/* El sitio público vive en otro dominio: enlace normal, no `next/link`. */}
      <p className="text-center text-sm">
        <a
          href={empresa.sitioUrl}
          className="text-ink-soft transition-colors hover:text-ink"
        >
          ← Volver al sitio
        </a>
      </p>
    </form>
  );
}
