import { describe, expect, it } from "vitest";
import { brutoDesdeLiquido, liquidoDe, retencionDe, tasaRetencion } from "./honorarios";

describe("lib/honorarios", () => {
  it("la tasa es la del año de la boleta", () => {
    expect(tasaRetencion("2025-12-31")).toBe(14.5);
    expect(tasaRetencion("2026-11-24")).toBe(15.25);
    expect(tasaRetencion("2027-01-01")).toBe(16);
    expect(tasaRetencion("2031-05-01")).toBe(17);
  });

  it("retención y líquido de un bruto, al peso", () => {
    expect(retencionDe(1_000_000, "2026-11-24")).toBe(152_500);
    expect(liquidoDe(1_000_000, "2026-11-24")).toBe(847_500);
    expect(retencionDe(333_333, "2026-11-24")).toBe(50_833);
  });

  it("el bruto que deja exactamente el líquido pactado", () => {
    expect(brutoDesdeLiquido(847_500, "2026-11-24")).toBe(1_000_000);
    for (const l of [300_000, 123_457, 999_999, 1]) {
      expect(liquidoDe(brutoDesdeLiquido(l, "2026-06-01"), "2026-06-01")).toBe(l);
    }
    expect(brutoDesdeLiquido(0, "2026-06-01")).toBe(0);
  });
});
