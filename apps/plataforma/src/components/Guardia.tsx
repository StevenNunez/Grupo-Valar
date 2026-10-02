"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProveedorUsuario, useSesion } from "@/lib/sesion";

/**
 * Resuelve la sesión una sola vez para todo el panel y la reparte por contexto.
 *
 * Es comodidad, no seguridad: evita mostrar pantallas vacías a quien no inició
 * sesión. Lo que protege los datos son las políticas RLS —aunque alguien se
 * salte esto, Postgres no le devuelve una sola fila.
 */
export function Guardia({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sesion = useSesion();

  useEffect(() => {
    if (sesion.estado === "sin-sesion") router.replace("/");
  }, [sesion.estado, router]);

  if (sesion.estado !== "con-sesion") {
    return (
      <div className="grid min-h-svh place-items-center bg-mist/40">
        <p className="text-sm text-ink-soft">Verificando sesión…</p>
      </div>
    );
  }

  return <ProveedorUsuario value={sesion.usuario}>{children}</ProveedorUsuario>;
}
