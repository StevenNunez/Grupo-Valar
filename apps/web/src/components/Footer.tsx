import { empresa } from "@/lib/content";
import { plataformaUrl, redes } from "@/lib/site";
import { EnlaceCookies } from "./EnlaceCookies";
import InteractiveLogo from "./InteractiveLogo";
import { Logo, LogoMark } from "./Logo";

/** Las redes que tienen URL en `lib/site.ts`; las vacías no se muestran. */
const redesActivas = [
  {
    nombre: "LinkedIn",
    url: redes.linkedin,
    icono: (
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11.5H3V9.75Zm6.5 0h3.83v1.57h.06c.53-1 1.84-2.07 3.78-2.07 4.04 0 4.78 2.66 4.78 6.11v5.9h-4v-5.23c0-1.25-.02-2.86-1.74-2.86-1.75 0-2.01 1.36-2.01 2.77v5.32h-4V9.75Z" />
    ),
  },
  {
    nombre: "Instagram",
    url: redes.instagram,
    icono: (
      <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-3.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
    ),
  },
  {
    nombre: "Facebook",
    url: redes.facebook,
    icono: <path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V13h2.7v8h3.1Z" />,
  },
  {
    nombre: "YouTube",
    url: redes.youtube,
    icono: <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5 3-5 3Z" />,
  },
].filter((r) => r.url);

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink text-white">
      {/* Isotipo completo anclado a la esquina, sin recortes */}
      <LogoMark className="pointer-events-none absolute bottom-0 right-0 h-64 w-auto text-white/5" />

      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Logo className="text-2xl" />
            <p className="mt-8 font-display text-sm leading-loose tracking-brand uppercase">
              Valor
              <br />
              <span className="font-semibold">Sostenible</span>
              <br />
              para el futuro.
            </p>

            {redesActivas.length > 0 && (
              <div className="mt-9">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Síguenos</p>
                <div className="mt-4 flex gap-3">
                  {redesActivas.map((r) => (
                    <a
                      key={r.nombre}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Valar en ${r.nombre}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:border-cyan hover:text-white"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        {r.icono}
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:gap-x-12 xl:grid-cols-4 xl:gap-x-14">
            <Col titulo="Servicios">
              <a href="/#servicios">Obras civiles</a>
              <a href="/#servicios">Mantenimiento industrial</a>
              <a href="/#servicios">Movimiento de tierra</a>
              <a href="/#servicios">Arriendo de equipos</a>
            </Col>

            <Col titulo="Empresa">
              <a href="/#nosotros">Quiénes somos</a>
              <a href="/#proyectos">Proyectos</a>
              <a href="/#contacto">Contacto</a>
              <a href={plataformaUrl}>Acceso a Plataforma Valar</a>
            </Col>

            <Col titulo="Trabaja con nosotros" className="col-span-2 xl:col-span-1">
              <p className="max-w-xs leading-relaxed text-white/50">
                Súmate a un equipo que construye en la minería, la energía y la industria.
              </p>
              <a
                href="/trabaja-con-nosotros/"
                className="w-fit rounded-full border border-white/25 px-4 py-2 text-sm font-semibold !text-white transition-colors hover:border-cyan hover:bg-cyan/10"
              >
                Envía tu CV →
              </a>
            </Col>

            <Col titulo="Contacto" className="col-span-2 xl:col-span-1">
              <a href={`mailto:${empresa.email}`} className="break-all">
                {empresa.email}
              </a>
              <span className="max-w-xs leading-relaxed text-white/50">{empresa.direccion}</span>
            </Col>
          </div>
        </div>

        <div className="mt-14 border-t border-white/10 pt-8 text-xs text-white/40">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <nav
              aria-label="Información legal"
              className="-my-1.5 flex flex-wrap gap-x-6 text-white/50 [&>a:hover]:text-white [&>a]:py-2 [&>a]:transition-colors [&>button:hover]:text-white [&>button]:py-2 [&>button]:text-left [&>button]:transition-colors"
            >
              <a href="/privacidad/">Política de privacidad</a>
              <a href="/terminos/">Términos de uso</a>
              <a href="/cookies/">Política de cookies</a>
              <EnlaceCookies />
            </nav>

            <span className="flex items-center gap-1">
              Desarrollado por
              <a
                href="https://www.teolabs.app"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
              >
                <InteractiveLogo variant="footer-small" className="text-[14px]" />
              </a>
              ®
            </span>
          </div>

          <p className="mt-6">
            © {new Date().getFullYear()} {empresa.razonSocial} · Empresa inscrita en Sicep
          </p>
        </div>
      </div>
    </footer>
  );
}

function Col({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">{titulo}</p>
      <div className="mt-5 flex flex-col gap-3 text-sm text-white/70 [&>a:hover]:text-white [&>a]:transition-colors">
        {children}
      </div>
    </div>
  );
}
