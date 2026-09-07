import { servicios } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Servicios() {
  return (
    <section id="servicios" className="bg-white">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-medium tracking-brand uppercase text-cyan">Servicios</p>
          <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] text-ink">
            Qué hacemos
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">
            Un solo interlocutor para el ciclo completo: proyectamos, construimos y mantenemos.
            Con eficiencia maximizamos resultados y minimizamos el impacto.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-mist-deep sm:grid-cols-2 lg:grid-cols-3">
          {servicios.map((s, i) => (
            <Reveal
              key={s.id}
              delay={(i % 3) * 70}
              className="group relative flex flex-col bg-white p-8 transition-colors duration-300 hover:bg-ink lg:p-10"
            >
              <span className="font-display text-xs font-semibold text-cyan">
                {String(i + 1).padStart(2, "0")}
              </span>

              <h3 className="mt-6 font-display text-xl font-semibold leading-snug text-ink transition-colors duration-300 group-hover:text-white">
                {s.titulo}
              </h3>

              <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-soft transition-colors duration-300 group-hover:text-white/70">
                {s.resumen}
              </p>

              <ul className="mt-7 space-y-2 border-t border-mist pt-6 transition-colors duration-300 group-hover:border-white/15">
                {s.detalles.map((d) => (
                  <li
                    key={d}
                    className="flex items-center gap-2.5 text-sm text-ink-soft transition-colors duration-300 group-hover:text-white/70"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-cyan" />
                    {d}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
