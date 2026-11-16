"use client";

import type { ContratoBreve } from "@/lib/contratos";
import type { Usuario as Yo } from "@/lib/sesion";
import type {
  Acceso,
  Cargo,
  General,
  Invitacion,
  Modulo,
  Nivel,
  Permiso,
  Persona,
} from "@/lib/usuarios";

export type Datos = {
  personas: Persona[];
  cargos: Cargo[];
  modulos: Modulo[];
  permisos: Permiso[];
  nivelPermisos: Set<string>;
  accesos: Acceso[];
  contratos: ContratoBreve[];
  invitaciones: Invitacion[];
};

export type Comunes = {
  datos: Datos;
  yo: Yo;
  misModulos: Modulo[];
  filtros: React.ReactNode;
  alGuardado: () => void;
};

export function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
      {texto}
    </p>
  );
}

export const tituloGeneral = (g: General) => (g === "soporte" ? "Soporte" : "Administrador general");

/** "Todos los contratos" o "C-TORRES, C-MISC". */
export function textoContratos(contratos: string[] | null) {
  if (contratos === null) return "Todos los contratos";
  if (contratos.length === 0) return "Ningún contrato";
  return contratos.length <= 3 ? contratos.join(", ") : `${contratos.length} contratos`;
}


/* ── El borrador del acceso a un módulo ───────────────────────────────────── */

export type Borrador = { nivel: Nivel | null; permisos: string[]; contratos: string[] | null };

export const sinAcceso: Borrador = { nivel: null, permisos: [], contratos: null };

export function borradorDe(acceso: Acceso | undefined): Borrador {
  return acceso
    ? { nivel: acceso.nivel, permisos: acceso.permisos, contratos: acceso.contratos }
    : sinAcceso;
}

/** Si quien mira puede dar "todos los contratos" en ese módulo. */
export function puedoDarTodos(yo: Yo, datos: Datos, modulo: string) {
  if (yo.general) return true;
  const mio = datos.accesos.find((a) => a.usuarioId === yo.id && a.moduloId === modulo);
  return mio?.contratos === null;
}

