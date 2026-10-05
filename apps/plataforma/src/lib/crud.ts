"use client";

import { supabase } from "./supabase";

/**
 * Escrituras del módulo.
 *
 * No mandan `creado_por` ni `actualizado_por`: los estampa la base desde
 * `auth.uid()` (ver `supabase/migraciones/0003_auditoria.sql`). Si los mandara
 * la app, bastaría un cliente modificado para firmar a nombre de otro.
 *
 * Tampoco comprueban el rol: eso lo hace RLS. Acá solo se traduce el rechazo a
 * algo que se pueda leer en pantalla.
 */

export type Fila = Record<string, unknown>;

export async function crear(tabla: string, datos: Fila) {
  const { error } = await supabase.from(tabla).insert(datos);
  if (error) throw new Error(traducir(error.message));
}

export async function actualizar(tabla: string, id: string, datos: Fila) {
  const { error } = await supabase.from(tabla).update(datos).eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

export async function eliminar(tabla: string, id: string) {
  const { error } = await supabase.from(tabla).delete().eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

/** Convierte los errores de Postgres en algo que sirva a quien está mirando. */
function traducir(mensaje: string) {
  if (/violates row-level security|permission denied/i.test(mensaje)) {
    return "Tu acceso no permite este cambio (o ese contrato no está entre los tuyos).";
  }
  if (/proveedores_pagnol_unico/.test(mensaje)) {
    return "Ese proveedor de Pagnol ya está enlazado a otra ficha. Quita el enlace de la otra antes.";
  }
  if (/duplicate key|already exists/i.test(mensaje)) {
    return "Ya existe un registro con ese código. Usa uno distinto.";
  }
  if (/violates foreign key/i.test(mensaje)) {
    if (/contratos/i.test(mensaje)) {
      return "Ese contrato no existe, o el contrato todavía tiene movimientos asociados y no se puede borrar.";
    }
    return "El registro está relacionado con otros datos y no se puede borrar.";
  }
  if (/violates check constraint/i.test(mensaje)) {
    return "Algún valor está fuera de rango. Revisa los montos y los porcentajes.";
  }
  if (/null value in column/i.test(mensaje)) {
    const campo = /column "([^"]+)"/.exec(mensaje)?.[1];
    return campo ? `Falta completar el campo "${campo}".` : "Falta completar un campo obligatorio.";
  }
  return mensaje;
}
