import { Reveal } from "./Reveal";

const cifras = [
  { valor: "+40", sufijo: "años", texto: "de experiencia agregada en la industria" },
  { valor: "4", sufijo: "industrias", texto: "minería, energía, retail y portuaria" },
  { valor: "20+", sufijo: "contratos", texto: "ejecutados en faenas del norte de Chile" },
];

export function Proposito() {
  return (
    <section id="nosotros" className="bg-mist">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
        <div className="grid gap-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <Reveal>
            <p className="text-xs font-medium tracking-brand uppercase text-cyan">Propósito</p>
            <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] text-ink">
              Lo que nos mueve
            </h2>
            <span className="mt-8 block h-px w-20 bg-ink" />
          </Reveal>

          <div className="space-y-12">
            <Reveal delay={80}>
              <div className="flex gap-6">
                <span className="font-display text-sm font-semibold text-cyan">01</span>
                <p className="text-xl leading-relaxed text-ink sm:text-2xl">
                  La creación y ejecución de{" "}
                  <span className="font-medium">proyectos de alta calidad</span>. Con nuestros
                  talentos y excelencia al servicio de nuestros clientes hacemos crecer a Chile
                  de manera responsable.
                </p>
              </div>
            </Reveal>

            <Reveal delay={160}>
              <div className="flex gap-6">
                <span className="font-display text-sm font-semibold text-cyan">02</span>
                <p className="text-xl leading-relaxed text-ink sm:text-2xl">
                  Generar <span className="font-medium">valor sostenible</span> para nuestros
                  clientes, el medio ambiente y las futuras generaciones.
                </p>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <div className="grid gap-8 border-t border-mist-deep pt-10 sm:grid-cols-3">
                {cifras.map((c) => (
                  <div key={c.valor}>
                    <p className="font-display text-4xl font-semibold text-ink">
                      {c.valor}
                      <span className="ml-1.5 text-base font-medium text-ink-soft">{c.sufijo}</span>
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.texto}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
