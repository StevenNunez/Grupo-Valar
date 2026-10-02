"use client";

import Link from "next/link";
import { BarraSuperior } from "./BarraSuperior";
import { Logo } from "./Logo";

/**
 * Marco del índice de módulos: barra superior y nada más.
 *
 * Sin barra lateral a propósito — es un lanzador, y las tarjetas ya dicen a
 * dónde llevan. La barra lateral aparece recién al entrar a un módulo.
 */
export function MarcoSimple({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-mist/40">
      {/* El logo lleva al inicio: desde Usuarios o Mi perfil es la salida, y
          a quien entra directo a un módulo /modulos/ lo devuelve a él. */}
      <BarraSuperior
        izquierda={
          <Link href="/modulos/" aria-label="Inicio">
            <Logo className="text-[21px] text-ink" />
          </Link>
        }
      />
      <main className="px-5 py-10 lg:px-10 lg:py-16">{children}</main>
    </div>
  );
}
