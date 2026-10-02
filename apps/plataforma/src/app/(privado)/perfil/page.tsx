import type { Metadata } from "next";
import Link from "next/link";
import { MarcoSimple } from "@/components/MarcoSimple";
import { FormularioPerfil } from "@/components/FormularioPerfil";

export const metadata: Metadata = { title: "Mi perfil" };

export default function PerfilPage() {
  return (
    <MarcoSimple>
      <div className="mx-auto max-w-3xl">
        <Link href="/modulos/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-deep transition-colors hover:text-ink">
          <span aria-hidden="true">←</span> Todos los módulos
        </Link>
        <h1 className="font-display text-4xl font-semibold text-ink">Mi perfil</h1>
        <p className="mt-3 text-ink-soft">Revisa tus datos y cuida el acceso a tu cuenta.</p>
        <FormularioPerfil />
      </div>
    </MarcoSimple>
  );
}
