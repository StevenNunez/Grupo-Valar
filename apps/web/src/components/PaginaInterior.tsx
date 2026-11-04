import { Footer } from "./Footer";
import { Logo } from "./Logo";

/**
 * Marco de las páginas que no son la portada (legales, «Trabaja con nosotros»):
 * cabecera mínima con la marca y el regreso al inicio, contenido y el mismo
 * footer del sitio. El menú de la portada usa anclas (`#servicios`) que fuera
 * de ella no existen, por eso no se reutiliza.
 */
export function PaginaInterior({
  etiqueta,
  titulo,
  bajada,
  ancho = "max-w-3xl",
  children,
}: {
  etiqueta: string;
  titulo: string;
  bajada?: string;
  ancho?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-50 bg-white shadow-[0_1px_0_rgba(31,33,36,0.08)]">
        <div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-6 lg:px-10">
          <a href="/" aria-label="Valar — inicio" className="text-[23px] text-ink">
            <Logo />
          </a>
          <a href="/" className="text-sm font-medium text-ink-soft transition-colors hover:text-ink">
            ← Volver al inicio
          </a>
        </div>
      </header>

      <main>
        <section className="bg-mist">
          <div className={`mx-auto ${ancho} px-6 py-16 lg:px-10 lg:py-20`}>
            <p className="text-xs font-medium tracking-brand uppercase text-cyan">{etiqueta}</p>
            <h1 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] text-ink">{titulo}</h1>
            {bajada && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{bajada}</p>}
          </div>
        </section>
        <div className={`mx-auto ${ancho} px-6 py-14 lg:px-10 lg:py-20`}>{children}</div>
      </main>

      <Footer />
    </>
  );
}

/** Estilo común de los textos legales. */
export function Texto({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-cyan-deep [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-ink">
      {children}
    </div>
  );
}
