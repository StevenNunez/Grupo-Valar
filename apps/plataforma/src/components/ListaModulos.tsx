"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconoModulo } from "./IconoModulo";
import { entraDirecto, modulos } from "@/lib/modulos";
import { administraAlgo, entraA, useUsuario } from "@/lib/sesion";

/**
 * Las tarjetas de los módulos, recortadas a los de la persona.
 *
 * Quien entra a uno solo no ve este índice: va directo a su módulo. Los que
 * no tiene no aparecen ni apagados —"Pronto" lo ve solo el Administrador
 * general, que es quien decide qué viene—.
 */
export function ListaModulos() {
  const usuario = useUsuario();
  const router = useRouter();
  const directo = entraDirecto(usuario);

  useEffect(() => {
    if (directo) router.replace(directo);
  }, [directo, router]);

  if (directo) return null;

  const visibles = modulos.filter((m) =>
    m.activo ? entraA(usuario, m.id) : usuario.general !== null,
  );

  return (
    <>
      {visibles.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-mist-deep bg-white px-6 py-10">
          <p className="font-display text-xl font-semibold text-ink">
            Todavía no tienes acceso a ningún módulo.
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Pídele a quien te invitó que te dé acceso. Apenas lo haga, vuelve a entrar.
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {visibles.map((m) =>
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
      )}

      {/* La administración no es un módulo: es de dónde salen los accesos de
          todos los demás. Va aparte y en chico, porque se entra pocas veces. */}
      {administraAlgo(usuario) && (
        <div className="mt-10 border-t border-mist-deep pt-6">
          <Link
            href="/usuarios/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
              <path d="M16 8.5h5M18.5 6v5" strokeLinecap="round" />
            </svg>
            Usuarios y accesos
          </Link>
        </div>
      )}
    </>
  );
}
