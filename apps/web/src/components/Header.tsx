"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { plataformaUrl } from "@/lib/site";

const links = [
  { href: "#servicios", label: "Servicios" },
  { href: "#proyectos", label: "Proyectos" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#contacto", label: "Contacto" },
];

export function Header() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Evita el scroll del fondo mientras el menú móvil está abierto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    // `sticky` y no `fixed`: el header ocupa su lugar en el flujo, así el hero
    // empieza debajo y la marca no se pierde sobre la foto de portada.
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        solid || open
          ? "bg-white/90 backdrop-blur-md shadow-[0_1px_0_rgba(31,33,36,0.08)]"
          : "bg-white"
      }`}
    >
      <div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-6 lg:px-10">
        <a
          href="#top"
          aria-label="Valar — inicio"
          // Destino del isotipo que vuela al terminar la intro (ver Splash.tsx).
          data-splash-target=""
          className="text-[23px] text-ink"
        >
          <Logo />
        </a>

        {/* Corte a medida y no un `lg` redondo: con el acceso a la plataforma
            sumado, el menú entero mide 1.015 px más el aire de los costados, así
            que por debajo de 1.140 px manda el desplegable, que lo lleva todo. */}
        <nav className="hidden items-center gap-8 min-[1140px]:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {l.label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-cyan transition-all duration-300 group-hover:w-full" />
            </a>
          ))}

          {/* La cotización y el logo de Pagnol van juntos, más cerca entre sí
              que del resto del menú, con una línea que los separa. */}
          <div className="flex items-center gap-3">
            <AccesoPlataforma className="rounded-full border border-mist-deep px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink" />
            <a
              href="#contacto"
              className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
            >
              Solicitar cotización
            </a>
            <span className="h-8 w-px bg-mist" aria-hidden="true" />
            <PagnolLink className="h-9" />
          </div>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className="-mr-2 p-2 text-ink min-[1140px]:hidden"
        >
          <span className="sr-only">Menú</span>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        // `absolute` para que el menú caiga por encima del hero en vez de
        // empujarlo hacia abajo, ahora que el header va en el flujo.
        <div className="absolute inset-x-0 top-full border-t border-mist bg-white px-6 pb-8 pt-4 shadow-[0_12px_24px_-12px_rgba(31,33,36,0.25)] min-[1140px]:hidden">
          <nav className="flex flex-col">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="border-b border-mist py-4 font-display text-lg text-ink"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <a
            href="#contacto"
            onClick={() => setOpen(false)}
            className="mt-6 block rounded-full bg-cyan px-5 py-3.5 text-center font-semibold text-white"
          >
            Solicitar cotización
          </a>
          <AccesoPlataforma
            onClick={() => setOpen(false)}
            className="mt-3 justify-center rounded-full border border-mist-deep px-5 py-3.5 font-semibold text-ink"
          />
          <PagnolLink
            className="mx-auto mt-7 h-10"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </header>
  );
}

/**
 * Entrada a la plataforma interna. Vive en otro dominio y en otro deploy, así
 * que va como enlace normal: `next/link` no sirve para salir de este sitio.
 */
function AccesoPlataforma({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={plataformaUrl}
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap ${className}`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
        <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" strokeLinecap="round" />
      </svg>
      Acceso a Plataforma Valar
    </a>
  );
}

/** Logo de Pagnol Asset Management, enlazado a su sitio. */
function PagnolLink({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href="https://www.pagnol.cl"
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`flex w-fit items-center opacity-90 transition-opacity hover:opacity-100 ${className}`}
    >
      <Image
        src="/logo-pagnol.png"
        alt="Pagnol Asset Management"
        width={678}
        height={269}
        className="h-full w-auto"
      />
    </a>
  );
}
