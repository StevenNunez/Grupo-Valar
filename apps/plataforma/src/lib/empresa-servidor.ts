import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMNAS_EMPRESA, datosDeFila, type DatosEmpresa, type FilaEmpresa } from "./empresa";

/**
 * Los datos de una empresa para documentos que arma el servidor (PDF, correos,
 * páginas del proveedor). Si la lectura falla o la empresa no existe, vuelven
 * los valores por defecto: un documento no se cae por esto.
 */
export async function cargarDatosEmpresa(sb: SupabaseClient, empresaId: string): Promise<DatosEmpresa> {
  const { data } = await sb.from("empresas").select(COLUMNAS_EMPRESA).eq("id", empresaId).maybeSingle();
  return datosDeFila(data as FilaEmpresa | null);
}
