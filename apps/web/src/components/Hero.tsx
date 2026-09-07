import Image from "next/image";
import { LogoMark } from "./Logo";

export function Hero() {
  return (
    // La altura descuenta el header (h-17 = 4.25rem), que ahora va antes en el
    // flujo: entre los dos siguen llenando exactamente una pantalla. Si cambia
    // el alto del header, este número cambia con él.
    <section
      id="top"
      className="relative isolate flex min-h-[calc(100svh-4.25rem)] flex-col justify-end overflow-hidden"
    >
      <Image
        src="/proyectos/hero.webp"
        alt="Faena de movimiento de tierra ejecutada por Valar en el norte de Chile"
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/25" />

      {/* Marca de agua: el isotipo como elemento gráfico, igual que la portada */}
      <LogoMark className="pointer-events-none absolute -right-24 top-[14%] -z-10 hidden h-[30vh] w-auto text-white/[0.06] lg:block" />

      <div className="mx-auto w-full max-w-7xl px-6 pb-20 pt-32 lg:px-10 lg:pb-28">
        <p className="animate-rise text-xs font-medium tracking-brand text-cyan uppercase">
          Antofagasta · Chile
        </p>

        <h1
          className="mt-6 max-w-4xl font-display text-[clamp(2.5rem,7vw,5.25rem)] font-semibold leading-[0.98] text-white animate-rise"
          style={{ animationDelay: "80ms" }}
        >
          Valor sostenible
          <br />
          <span className="text-white/55">para el futuro.</span>
        </h1>

        <p
          className="mt-8 max-w-xl text-lg leading-relaxed text-white/75 animate-rise"
          style={{ animationDelay: "180ms" }}
        >
          Ingeniería, obras civiles y mantenimiento industrial para minería, energía y
          retail. Ejecutamos proyectos de alta calidad con foco en el resultado y en el
          impacto que dejamos.
        </p>

        <div
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center animate-rise"
          style={{ animationDelay: "260ms" }}
        >
          <a
            href="#contacto"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan px-7 py-4 font-semibold text-white transition-colors hover:bg-cyan-deep"
          >
            Conversemos tu proyecto
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a
            href="#proyectos"
            className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-4 font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/5"
          >
            Ver proyectos ejecutados
          </a>
        </div>
      </div>
    </section>
  );
}
