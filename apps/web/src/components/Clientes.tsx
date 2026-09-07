import Image from "next/image";
import { clientes } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Clientes() {
  return (
    <section aria-label="Nuestros principales clientes" className="border-b border-mist bg-white">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
        <Reveal className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16">
          <p className="shrink-0 text-center text-sm font-medium leading-relaxed text-ink-soft lg:max-w-[13rem] lg:text-left">
            Nuestros principales
            <br className="hidden lg:block" /> clientes
            <span className="mt-3 hidden h-px w-16 bg-ink lg:block" />
          </p>

          <ul className="flex flex-1 flex-wrap items-center justify-center gap-x-14 gap-y-10 lg:justify-end">
            {clientes.map((c) => (
              <li key={c.nombre} className={`relative ${c.ratio} w-auto`}>
                <Image
                  src={c.logo}
                  alt={c.nombre}
                  width={700}
                  height={300}
                  className="h-full w-auto object-contain opacity-80 grayscale transition duration-500 hover:opacity-100 hover:grayscale-0"
                />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
