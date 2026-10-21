"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { COLUMNAS_EMPRESA, DATOS_POR_DEFECTO, datosDeFila, type DatosEmpresa, type FilaEmpresa } from "./empresa";
import { supabase } from "./supabase";
import { useUsuario } from "./sesion";

/**
 * Los datos de la empresa activa para las pantallas. Mientras cargan (o si la
 * lectura falla) valen los de por defecto, así que ninguna pantalla espera.
 * `recargar` se llama después de editarlos.
 */
const Contexto = createContext<{ datos: DatosEmpresa; recargar: () => void }>({ datos: DATOS_POR_DEFECTO, recargar: () => {} });

export function ProveedorEmpresa({ children }: { children: React.ReactNode }) {
  const usuario = useUsuario();
  const [datos, setDatos] = useState<DatosEmpresa>(DATOS_POR_DEFECTO);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!usuario.empresa) return;
    let vigente = true;
    supabase
      .from("empresas")
      .select(COLUMNAS_EMPRESA)
      .eq("id", usuario.empresa)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente && data) setDatos(datosDeFila(data as FilaEmpresa));
      });
    return () => {
      vigente = false;
    };
  }, [usuario.empresa, version]);

  return <Contexto.Provider value={{ datos, recargar: () => setVersion((v) => v + 1) }}>{children}</Contexto.Provider>;
}

export const useEmpresa = () => useContext(Contexto).datos;
export const useRecargarEmpresa = () => useContext(Contexto).recargar;
