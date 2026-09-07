import { Reveal } from "./Reveal";

export function Sostenibilidad() {
  return (
    <section className="relative overflow-hidden bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-24">
          <Reveal>
            <p className="text-xs font-medium tracking-brand uppercase text-cyan">
              Sostenibilidad
            </p>
            <p className="mt-8 font-display text-[clamp(1.6rem,3.2vw,2.6rem)] font-medium leading-[1.2] text-white">
              Los escombros de la construcción llenarían{" "}
              <span className="text-cyan">15 veces</span> el Estadio Nacional.
            </p>
            <p className="mt-5 text-sm text-white/40">Fuente: Construye2025</p>
          </Reveal>

          <Reveal delay={120}>
            <h2 className="font-display text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-[1.05] text-white/90">
              ¿Qué hacemos cuando ya sabemos esto?
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white/60">
              Planificamos para generar menos residuo, reutilizamos lo que sirve y operamos con
              equipos solares donde antes solo había diésel. La sustentabilidad no es un anexo
              del proyecto: es cómo decidimos ejecutarlo.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
