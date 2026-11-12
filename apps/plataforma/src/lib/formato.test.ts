import { describe, expect, it } from "vitest";
import { formatearFecha, formatearPesos, numeroDeTexto, saludoA } from "./formato";

describe("saludoA: el saludo del correo al proveedor", () => {
  it("usa solo el primer nombre, con mayúscula inicial", () => {
    expect(saludoA("FABIOLA ROJAS SOTO")).toBe("Estimado/a Fabiola:");
    expect(saludoA("juan pablo pérez")).toBe("Estimado/a Juan:");
  });

  it("se salta el tratamiento", () => {
    expect(saludoA("Sra. María José Díaz")).toBe("Estimado/a María:");
    expect(saludoA("Don Ñuño")).toBe("Estimado/a Ñuño:");
  });

  it("sin un nombre de verdad, saluda en plural", () => {
    expect(saludoA(null)).toBe("Estimados:");
    expect(saludoA("   ")).toBe("Estimados:");
    expect(saludoA("ventas@proveedor.cl")).toBe("Estimados:");
    expect(saludoA("+56 9 1234 5678")).toBe("Estimados:");
  });
});

describe("numeroDeTexto: lo que se escribe en un campo de precio", () => {
  it("el punto separa miles y la coma es decimal", () => {
    expect(numeroDeTexto("1.234.567")).toBe(1234567);
    expect(numeroDeTexto("663,87")).toBe(663.87);
    expect(numeroDeTexto("$ 4.400")).toBe(4400);
  });

  it("un punto que solo puede ser decimal se lee como decimal (copiado de un PDF)", () => {
    expect(numeroDeTexto("663.87")).toBe(663.87);
  });

  it("vacío es cero", () => {
    expect(numeroDeTexto("")).toBe(0);
  });
});

describe("formato chileno", () => {
  it("pesos sin decimales y con punto de miles", () => {
    expect(formatearPesos(50800)).toMatch(/^\$\s?50\.800$/);
  });

  it("la fecha no se corre al día anterior por la zona horaria", () => {
    expect(formatearFecha("2026-11-12")).toMatch(/^12[- ]nov/i);
    expect(formatearFecha(null)).toBe("—");
  });
});
