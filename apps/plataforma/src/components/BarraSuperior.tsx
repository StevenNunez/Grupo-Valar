"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

/**
 * Barra superior común a todo el panel: quién eres y cómo salir.
 *
 * `izquierda` cambia según el marco — en /modulos/ lleva la marca, y dentro de
 * un módulo lleva el botón que abre la barra lateral en móvil.
 */
export function BarraSuperior({ izquierda }: { izquierda?: React.ReactNode }) {
  const router = useRouter();
  const usuario = useUsuario();

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-30 flex h-17 items-center justify-between gap-4 border-b border-mist-deep bg-white/90 px-5 backdrop-blur-md lg:px-10">
      <div className="flex min-w-0 items-center">{izquierda}</div>

      <div className="flex shrink-0 items-center gap-4">
        {usuario.general === "soporte" && <SelectorEmpresa actual={usuario.empresa} />}
        {usuario.empresa === "demo" && (
          <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-cyan-deep" title="Entorno de demostración">
            DEMO
          </span>
        )}
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-semibold text-ink">{usuario.nombre}</p>
          <p className="truncate text-xs text-ink-soft">{usuario.cargo}</p>
        </div>
        <Link
          href="/perfil/"
          aria-label="Mi perfil"
          title="Mi perfil"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
        >
          {usuario.iniciales}
        </Link>
        <Link href="/perfil/" className="hidden text-sm font-semibold text-ink-soft hover:text-cyan-deep md:block">
          Mi perfil
        </Link>
        <span className="hidden h-8 w-px bg-mist-deep sm:block" aria-hidden="true" />
        <button
          type="button"
          onClick={salir}
          className="rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Salir
        </button>
      </div>
    </header>
  );
}

/**
 * Solo Soporte: en qué empresa está mirando, y el cambio a otra.
 *
 * Soporte ve UNA empresa a la vez (ver la 0046): lo que ve y lo que crea son
 * siempre de la misma. Al cambiar se recarga la página entera, porque cada
 * pantalla ya trajo sus datos de la empresa anterior y ninguna tendría por qué
 * saber que tiene que volver a pedirlos.
 */
function SelectorEmpresa({ actual }: { actual: string | null }) {
  const [empresas, setEmpresas] = useState<{ id: string; nombre: string }[]>([]);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("empresas")
      .select("id, nombre")
      .eq("activa", true)
      .order("es_demo")
      .order("nombre")
      .then(({ data }) => setEmpresas(data ?? []));
  }, []);

  async function cambiar(destino: string) {
    setCambiando(true);
    setError(null);
    const { error: fallo } = await supabase.rpc("cambiar_empresa", { destino });
    if (fallo) {
      setCambiando(false);
      setError(fallo.message);
      return;
    }
    // Recarga completa a propósito (ver arriba): una navegación de Next dejaría
    // en memoria los datos de la empresa anterior.
    window.location.href = new URL("/modulos/", window.location.origin).href;
  }

  if (empresas.length < 2) return null;

  return (
    <label className="hidden items-center gap-2 text-xs text-ink-soft md:flex">
      <span className="font-semibold uppercase tracking-[0.12em]">Empresa</span>
      <select
        value={actual ?? ""}
        disabled={cambiando}
        onChange={(e) => void cambiar(e.target.value)}
        className="rounded-full border border-mist-deep bg-white px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
      >
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="text-[#a52f24]">{error}</span>}
    </label>
  );
}
