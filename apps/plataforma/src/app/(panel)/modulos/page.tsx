import type { Metadata } from "next";
import Link from "next/link";
import { IconoModulo } from "@/components/IconoModulo";
import { modulos } from "@/lib/modulos";

export const metadata: Metadata = { title: "Módulos" };

export default function ModulosPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium tracking-brand uppercase text-cyan-deep">
        Plataforma Valar
      </p>
      <h1 className="mt-4 font-display text-4xl font-semibold text-ink">Módulos</h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Control de Gestión ya está operativo. Los demás módulos se irán habilitando
        a medida que se incorporen sus datos.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {modulos.map((m) =>
          m.activo ? (
            <li key={m.id}>
              <Link
                href={m.href}
                className="group flex h-full flex-col rounded-2xl border border-mist-deep bg-white p-6 transition-colors hover:border-cyan"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan/10 text-cyan-deep">
                  <IconoModulo icono={m.icono} className="h-6 w-6" />
                </span>
                <h2 className="mt-5 font-display text-xl font-semibold text-ink">
                  {m.titulo}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                  {m.descripcion}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-deep">
                  Abrir módulo
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="transition-transform group-hover:translate-x-1"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </li>
          ) : (
            <li
              key={m.id}
              className="flex h-full flex-col rounded-2xl border border-dashed border-mist-deep bg-white/50 p-6"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-mist text-ink-soft/60">
                <IconoModulo icono={m.icono} className="h-6 w-6" />
              </span>
              <h2 className="mt-5 flex items-center gap-2 font-display text-xl font-semibold text-ink-soft/70">
                {m.titulo}
                <span className="rounded-full border border-mist-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft/70">
                  Pronto
                </span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft/70">
                {m.descripcion}
              </p>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
