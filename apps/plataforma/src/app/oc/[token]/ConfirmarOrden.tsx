"use client";

import { useState } from "react";

/**
 * El botón que le sirve a Valar: el proveedor dice "la recibí y la entrego
 * tal día". Esa fecha queda en la orden y quien la emitió la ve en la
 * plataforma, sin tener que llamar a preguntar.
 */
export function ConfirmarOrden({
  token,
  fechaEmision,
  fechaRequerida,
  confirmada,
}: {
  token: string;
  fechaEmision: string;
  fechaRequerida: string | null;
  confirmada: { en: string; por: string; fechaEntrega: string; comentario: string | null } | null;
}) {
  const [hecha, setHecha] = useState(confirmada);
  const [editando, setEditando] = useState(!confirmada);
  const [nombre, setNombre] = useState(confirmada?.por ?? "");
  const [fecha, setFecha] = useState(confirmada?.fechaEntrega || fechaRequerida || "");
  const [comentario, setComentario] = useState(confirmada?.comentario ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await fetch(`/oc/${token}/confirmar/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, fechaEntrega: fecha, comentario }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "No se pudo confirmar.");
      setHecha({ en: new Date().toISOString(), por: nombre, fechaEntrega: fecha, comentario: comentario || null });
      setEditando(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar. Revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("-");

  if (hecha && !editando) {
    return (
      <div className="rounded-xl bg-[#e6f4ee] px-5 py-4">
        <p className="font-semibold text-[#0e7a4f]">Orden confirmada</p>
        <p className="mt-1 text-sm text-ink">
          Entrega comprometida para el <strong>{fechaCorta(hecha.fechaEntrega)}</strong>
          {hecha.por ? `, confirmada por ${hecha.por}` : ""}.
        </p>
        {hecha.comentario && <p className="mt-1 text-sm text-ink-soft">“{hecha.comentario}”</p>}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="mt-3 text-sm font-semibold text-cyan-deep hover:underline"
        >
          Cambiar la fecha de entrega
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirmar}>
      <h2 className="font-display text-lg font-semibold text-ink">Confirmar la orden</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Indica la fecha en que entregas. Valar la recibe al instante.
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
          <span className="font-semibold text-ink">Fecha de entrega</span>
          <input
            required
            type="date"
            min={fechaEmision}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-ink">Comentario <span className="font-normal text-ink-soft">(opcional)</span></span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Ej.: el ítem 3 llega en una segunda entrega."
            className="mt-1.5 w-full rounded-xl border border-mist-deep bg-white px-4 py-3 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm text-[#a52f24]">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-full bg-cyan px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:opacity-60"
        >
          {enviando ? "Confirmando…" : "Confirmo la orden"}
        </button>
        {hecha && (
          <button type="button" onClick={() => setEditando(false)} className="text-sm font-semibold text-ink-soft hover:text-ink">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
