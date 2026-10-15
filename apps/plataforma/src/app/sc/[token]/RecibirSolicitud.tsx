"use client";

import { useState } from "react";

/**
 * El botón que le sirve a Valar: el proveedor dice «la recibí». Quien la envió
 * lo ve en la plataforma, sin tener que llamar a preguntar si llegó.
 */
export function RecibirSolicitud({
  token,
  recibida,
}: {
  token: string;
  recibida: { en: string; por: string; comentario: string | null } | null;
}) {
  const [hecha, setHecha] = useState(recibida);
  const [nombre, setNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await fetch(`/sc/${token}/recibida/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, comentario }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "No se pudo registrar.");
      setHecha({ en: new Date().toISOString(), por: nombre, comentario: comentario || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar. Revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  if (hecha) {
    return (
      <div className="rounded-xl bg-[#e6f4ee] px-5 py-4">
        <p className="font-semibold text-[#0e7a4f]">Solicitud recibida</p>
        <p className="mt-1 text-sm text-ink">
          Quedó registrado{hecha.por ? ` por ${hecha.por}` : ""}.
        </p>
        {hecha.comentario && <p className="mt-1 text-sm text-ink-soft">“{hecha.comentario}”</p>}
      </div>
    );
  }

  return (
    <form onSubmit={confirmar}>
      <h2 className="font-display text-lg font-semibold text-ink">¿La recibiste?</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Avísale a Valar con un clic. Después responde el correo con tu cotización.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold text-ink">Tu nombre</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            autoComplete="name"
            className="mt-1.5 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-ink">
            Comentario <span className="font-normal text-ink-soft">(opcional)</span>
          </span>
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={1000}
            placeholder="Ej.: te cotizo mañana."
            className="mt-1.5 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">
          {error}
        </p>
      )}
      <div className="mt-5">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-full bg-cyan px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-60"
        >
          {enviando ? "Registrando…" : "Recibí la solicitud"}
        </button>
      </div>
    </form>
  );
}
