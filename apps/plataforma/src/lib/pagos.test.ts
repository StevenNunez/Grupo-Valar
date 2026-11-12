import { describe, expect, it } from "vitest";
import { armarNomina, montoAPagar, partirRut, proximasFechasDePago, type CuentaPorPagar } from "./pagos";

/** Una cuenta por pagar con lo mínimo; el resto, valores neutros. */
function cuenta(c: Partial<CuentaPorPagar>): CuentaPorPagar {
  return {
    id: "x", origen: "factura", compraId: null, ordenId: null, ordenNumero: null, contratoId: "C-1", contrato: "Contrato",
    proveedorId: "P-1", proveedor: "Ferretería Sur SpA", rut: "76.123.456-7", estadoCuenta: "creada", banco: "Banco Estado",
    numeroCuenta: "123456", detalle: "", documento: "F-100", fechaFactura: null, neto: 0, iva: 0, total: 0, plazoDias: 30,
    vencimiento: null, diasParaVencer: null, diasSinFacturar: null, estadoDocumento: "recibido" as CuentaPorPagar["estadoDocumento"],
    alertaDocumental: "ninguna" as CuentaPorPagar["alertaDocumental"], aptoParaPago: true, fechaPagoProgramada: null, fechaPago: null,
    semanaPago: null, pagado: 0, saldo: 0, cuotas: 0, cuotaMonto: null, cuotaNumero: null,
    ...c,
  };
}

describe("montoAPagar: cuánto se transfiere de una línea", () => {
  it("la próxima cuota si tiene plan; si no, lo que falta", () => {
    expect(montoAPagar({ cuotaMonto: 400_000, saldo: 1_190_000 })).toBe(400_000);
    expect(montoAPagar({ cuotaMonto: null, saldo: 790_000 })).toBe(790_000);
  });
});

describe("armarNomina: el archivo para el banco", () => {
  it("una línea por proveedor, con el RUT partido", () => {
    const nomina = armarNomina([
      cuenta({ documento: "F-100", total: 119_000, saldo: 119_000 }),
      cuenta({ documento: "F-101", total: 238_000, saldo: 238_000 }),
    ]);
    expect(nomina).toHaveLength(1);
    expect(nomina[0]).toMatchObject({ rut: "76123456", dv: "7", monto: 357_000, descripcion: "F-100, F-101", listo: true });
  });

  it("una factura en cuotas va por la cuota, no por el total", () => {
    const [linea] = armarNomina([cuenta({ total: 1_190_000, pagado: 400_000, saldo: 790_000, cuotas: 3, cuotaMonto: 395_000 })]);
    expect(linea.monto).toBe(395_000);
  });

  it("una factura con un abono va por lo que falta", () => {
    const [linea] = armarNomina([cuenta({ total: 1_190_000, pagado: 190_000, saldo: 1_000_000 })]);
    expect(linea.monto).toBe(1_000_000);
  });

  it("sin cuenta bancaria no está lista para pagar", () => {
    const [linea] = armarNomina([cuenta({ numeroCuenta: null, saldo: 10 })]);
    expect(linea.listo).toBe(false);
  });
});

describe("partirRut", () => {
  it("separa número y dígito verificador", () => {
    expect(partirRut("76.175.835-7")).toEqual(["76175835", "7"]);
    expect(partirRut("12.345.678-k")).toEqual(["12345678", "K"]);
    expect(partirRut(null)).toEqual(["", ""]);
  });
});

describe("proximasFechasDePago", () => {
  it("las próximas en el día de la semana que se transfiere (1 = lunes)", () => {
    // Jueves 12-11-2026 → los lunes siguientes.
    expect(proximasFechasDePago(1, 3, new Date(2026, 10, 12))).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  it("si hoy es el día de pago, parte hoy", () => {
    expect(proximasFechasDePago(1, 1, new Date(2026, 10, 16))).toEqual(["2026-11-16"]);
  });

  it("el domingo es 7", () => {
    expect(proximasFechasDePago(7, 1, new Date(2026, 10, 12))).toEqual(["2026-11-15"]);
  });
});
