import { describe, expect, it } from "vitest";
import { explicarError } from "./errores";

const explica = (mensaje: string) => explicarError(new Error(mensaje));

describe("explicarError: lo que ve la persona cuando algo falla", () => {
  it("traduce los errores de Postgres y PostgREST", () => {
    expect(explica('new row violates row-level security policy for table "compras"').mensaje).toMatch(/Tu acceso no permite/);
    expect(explica('duplicate key value violates unique constraint "compras_pkey"').mensaje).toMatch(/Ya existe un registro/);
    expect(explica('null value in column "fecha" of relation "compras" violates not-null constraint').mensaje).toMatch(/Falta completar/);
    expect(explica('update or delete on table "contratos" violates foreign key constraint "compras_contrato_id_fkey" on table "compras"').mensaje).toMatch(/No se puede borrar/);
    expect(explica('insert or update on table "compras" violates foreign key constraint "compras_proveedor_id_fkey"').mensaje).toMatch(/ya no existe/);
    expect(explica('invalid input syntax for type date: "2026-13-40"').mensaje).toMatch(/formato correcto/);
  });

  it("un corte de red no se reporta: no es un error del código", () => {
    const r = explica("Failed to fetch");
    expect(r.mensaje).toMatch(/No se pudo conectar/);
    expect(r.reportar).toBe(false);
  });

  it("la base lenta o una migración sin aplicar sí se reportan", () => {
    expect(explica("canceling statement due to statement timeout").reportar).toBe(true);
    const falta = explica("Could not find the function public.pedir_cotizacion(p_items) in the schema cache");
    expect(falta.mensaje).toMatch(/actualización de la base/);
    expect(falta.reportar).toBe(true);
  });

  it("los mensajes que escribimos nosotros pasan tal cual", () => {
    const propio = "Ya se le pidió cotización a este proveedor para esta solicitud.";
    expect(explica(propio)).toEqual({ mensaje: propio, reportar: false });
  });

  it("un error técnico que no sabe explicar no se muestra crudo y se reporta", () => {
    const r = explica("Cannot read properties of undefined (reading 'total')");
    expect(r.mensaje).not.toMatch(/undefined/);
    expect(r.reportar).toBe(true);
  });
});
