import { describe, expect, it } from "vitest";
import { conIva, honorarioEstimado, montoMensualArriendo, sumaHitos } from "./condiciones";
import { semaforo, sumar, type FilaMes } from "./dashboard";

describe("IVA y condiciones del contrato", () => {
  it("IVA del 19 % redondeado al peso", () => {
    expect(conIva(100_000)).toEqual({ iva: 19_000, total: 119_000 });
    expect(conIva(42_857)).toEqual({ iva: 8_143, total: 51_000 });
  });

  it("honorario de administración delegada: costo × porcentaje", () => {
    expect(honorarioEstimado({ costo_estimado: 10_000_000, honorario_pct: 12.5, tope: 0 })).toBe(1_250_000);
    expect(honorarioEstimado(undefined)).toBe(0);
  });

  it("arriendo mensual: equipos × tarifa", () => {
    const arriendo = { equipos: [{ cantidad: 3, tarifa: 850_000 }, { cantidad: 1, tarifa: 1_200_000 }] } as Parameters<typeof montoMensualArriendo>[0];
    expect(montoMensualArriendo(arriendo)).toBe(3_750_000);
  });

  it("los hitos de una suma alzada suman sus porcentajes", () => {
    const hitos = { hitos: [{ porcentaje: 30 }, { porcentaje: 50 }, { porcentaje: 20 }] } as Parameters<typeof sumaHitos>[0];
    expect(sumaHitos(hitos)).toBe(100);
  });
});

describe("Dashboard: margen y semáforo", () => {
  const mes = (f: Partial<FilaMes>) => ({ venta: 0, costo: 0, reembolsable: 0, cobrado: 0, ...f }) as FilaMes;

  it("suma venta y costo, y el margen sale de ahí", () => {
    const t = sumar([mes({ venta: 10_000_000, costo: 7_000_000 }), mes({ venta: 5_000_000, costo: 4_500_000 })]);
    expect(t.venta).toBe(15_000_000);
    expect(t.costo).toBe(11_500_000);
    expect(t.margen).toBe(3_500_000);
    expect(t.margenPct).toBeCloseTo(23.333, 2);
  });

  it("sin venta el margen porcentual es cero, no infinito", () => {
    expect(sumar([mes({ costo: 1_000_000 })]).margenPct).toBe(0);
  });

  it("semáforo contra la meta: hasta 5 puntos bajo la meta es aviso", () => {
    expect(semaforo(30, 25)).toBe("bueno");
    expect(semaforo(25, 25)).toBe("bueno");
    expect(semaforo(20, 25)).toBe("aviso");
    expect(semaforo(19.9, 25)).toBe("critico");
  });
});
