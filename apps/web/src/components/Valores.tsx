import Image from "next/image";
import { valores } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Valores() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
        <div className="grid items-start gap-16 lg:grid-cols-2 lg:gap-20">
          <Reveal className="lg:sticky lg:top-28">
            <p className="text-xs font-medium tracking-brand uppercase text-cyan">Quiénes somos</p>
            <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] text-ink">
              Con eficiencia
              <br />
              maximizamos resultados
              <br />
              <span className="text-mist-deep">y minimizamos el impacto</span>
            </h2>
            <p className="mt-8 max-w-lg text-lg leading-relaxed text-ink-soft">
              Un equipo multidisciplinario de profesionales y técnicos que provienen de la
              minería, el retail y la energía. Jóvenes talentosos junto a trayectorias sólidas:
              así logramos el valor que buscan nuestros clientes.
            </p>

            <div className="relative mt-10 aspect-[16/10] overflow-hidden rounded-2xl">
              <Image
                src="/proyectos/mantenimiento-electrico.webp"
                alt="Equipo Valar ejecutando mantenimiento eléctrico en planta"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </Reveal>

          <div>
            {valores.map((v, i) => (
              <Reveal
                key={v.titulo}
                delay={i * 60}
                className="border-t border-mist py-9 first:border-t-0 first:pt-0"
              >
                <h3 className="font-display text-xl font-semibold text-ink">{v.titulo}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{v.texto}</p>
              </Reveal>
            ))}

            <Reveal delay={240} className="mt-4 rounded-2xl bg-mist p-8">
              <p className="font-display text-lg font-medium leading-relaxed text-ink">
                “Con más de 40 años de experiencia agregada, declaramos con propiedad que
                conocemos el dolor, las necesidades y las preocupaciones de nuestros clientes.”
              </p>
              <p className="mt-5 text-sm text-ink-soft">Somos un aliado estratégico, no un proveedor más.</p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
