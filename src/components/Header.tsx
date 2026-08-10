"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { empresa } from "@/lib/content";

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
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        solid || open
          ? "bg-white/90 backdrop-blur-md shadow-[0_1px_0_rgba(31,33,36,0.08)]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10">
        <a
          href="#top"
          aria-label="Valar — inicio"
          className={`text-[19px] transition-colors ${
            solid || open ? "text-ink" : "text-white"
          }`}
        >
          <Logo />
        </a>

        <nav className="hidden items-center gap-9 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`group relative text-sm font-medium transition-colors ${
                solid ? "text-ink-soft hover:text-ink" : "text-white/80 hover:text-white"
              }`}
            >
              {l.label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-cyan transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
          <a
            href="#contacto"
            className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
          >
            Solicitar cotización
          </a>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className={`-mr-2 p-2 md:hidden ${solid || open ? "text-ink" : "text-white"}`}
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
        <div className="border-t border-mist bg-white px-6 pb-8 pt-4 md:hidden">
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
            href={`tel:${empresa.telefonoRaw}`}
            className="mt-6 block rounded-full bg-cyan px-5 py-3.5 text-center font-semibold text-white"
          >
            Llamar {empresa.telefono}
          </a>
        </div>
      )}
    </header>
  );
}
