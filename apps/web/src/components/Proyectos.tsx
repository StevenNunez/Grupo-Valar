"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { proyectos, type Proyecto } from "@/lib/content";
import { Reveal } from "./Reveal";

const areas = ["Todos", "Obras civiles", "Movimiento de tierra", "Mantenimiento", "Ingeniería 3D"] as const;

export function Proyectos() {
  const [area, setArea] = useState<(typeof areas)[number]>("Todos");

  const visibles = useMemo(
    () => (area === "Todos" ? proyectos : proyectos.filter((p) => p.area === area)),
    [area],
  );

  return (
    <section id="proyectos" className="bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
        <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-brand uppercase text-cyan">Proyectos</p>
            <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] text-white">
              Descubre nuestros
              <br />
              últimos proyectos
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setArea(a)}
                aria-pressed={area === a}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  area === a
                    ? "border-cyan bg-cyan text-white"
                    : "border-white/20 text-white/65 hover:border-white/50 hover:text-white"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((p, i) => (
            <Card key={p.titulo} proyecto={p} delay={(i % 3) * 70} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({ proyecto, delay }: { proyecto: Proyecto; delay: number }) {
  return (
    <Reveal
      delay={delay}
      className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink-soft"
    >
      <div className="absolute inset-0">
        <Image
          src={proyecto.imagen}
          alt={`${proyecto.titulo} — ${proyecto.cliente}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/5" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 lg:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">
          {proyecto.cliente}
        </p>
        <h3 className="mt-2 font-display text-xl font-semibold leading-snug text-white">
          {proyecto.titulo}
        </h3>
        {/* En táctil (sin hover) la descripción se muestra siempre; en desktop aparece al pasar el cursor. */}
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70 transition-all duration-500 sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
          {proyecto.descripcion}
        </p>
      </div>
    </Reveal>
  );
}
