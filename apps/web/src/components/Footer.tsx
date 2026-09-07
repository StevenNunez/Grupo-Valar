import { empresa } from "@/lib/content";
import { plataformaUrl } from "@/lib/site";
import InteractiveLogo from "./InteractiveLogo";
import { Logo, LogoMark } from "./Logo";

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
          </div>

          <div className="grid gap-10 sm:grid-cols-3 lg:gap-16">
            <Col titulo="Servicios">
              <a href="#servicios">Obras civiles</a>
              <a href="#servicios">Mantenimiento industrial</a>
              <a href="#servicios">Movimiento de tierra</a>
              <a href="#servicios">Arriendo de equipos</a>
            </Col>

            <Col titulo="Empresa">
              <a href="#nosotros">Quiénes somos</a>
              <a href="#proyectos">Proyectos</a>
              <a href="#contacto">Contacto</a>
              <a href={plataformaUrl}>Acceso a Plataforma Valar</a>
            </Col>

            <Col titulo="Contacto">
              <a href={`mailto:${empresa.email}`}>{empresa.email}</a>
              <span className="text-white/50">{empresa.direccion}</span>
            </Col>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-white/10 pt-8 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {empresa.razonSocial} · RUT {empresa.rut}
          </p>
          <p>
            Representante legal: {empresa.representante} · Empresa Sicep
          </p>
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
      </div>
    </footer>
  );
}

function Col({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">{titulo}</p>
      <div className="mt-5 flex flex-col gap-3 text-sm text-white/70 [&>a:hover]:text-white [&>a]:transition-colors">
        {children}
      </div>
    </div>
  );
}
