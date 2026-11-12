import { describe, expect, it } from "vitest";
import { leerCsvSii, normalizarRut, ordenesCitadas } from "./facturas-sii";
import { aNumero, leerCotizacionPegada } from "./lector-cotizacion";

describe("Registro de Compras del SII (CSV)", () => {
  const cabecera =
    "Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total";
  const fila = "1;33;Del Giro;76.123.456-7;Ferretería Sur SpA;001234;15/10/2026;16/10/2026;;0;100000;19000;0;;119000";

  it("lee cada documento con su RUT, folio, fecha y montos", () => {
    const { documentos, ignoradas, error } = leerCsvSii([cabecera, fila].join("\n"));
    expect(error).toBeUndefined();
    expect(ignoradas).toBe(0);
    expect(documentos).toHaveLength(1);
    expect(documentos[0]).toMatchObject({
      rutEmisor: "76123456-7",
      razonSocial: "Ferretería Sur SpA",
      tipoDocumento: 33,
      folio: "1234",
      fechaEmision: "2026-10-15",
      fechaRecepcion: "2026-10-16",
      neto: 100_000,
      iva: 19_000,
      total: 119_000,
    });
  });

  it("un documento repetido cuenta una vez y una fila sin folio se ignora", () => {
    const sinFolio = "2;33;Del Giro;76.123.456-7;Ferretería Sur SpA;;15/10/2026;;;0;1;0;0;;1";
    const r = leerCsvSii([cabecera, fila, fila, sinFolio].join("\r\n"));
    expect(r.documentos).toHaveLength(1);
    expect(r.ignoradas).toBe(1);
  });

  it("un archivo que no es del SII avisa en vez de cargar basura", () => {
    expect(leerCsvSii("a;b;c\n1;2;3").error).toMatch(/No reconocí las columnas/);
  });

  it("normaliza el RUT", () => {
    expect(normalizarRut("76.123.456-k")).toBe("76123456-K");
    expect(normalizarRut("x")).toBe("");
  });

  it("reconoce la OC que cita la factura", () => {
    expect(ordenesCitadas(["SEGUN OC 22-001011"], [])).toEqual(["221011"]);
    expect(ordenesCitadas(["Orden de compra 22-001154"], [])).toEqual(["221154"]);
  });
});

describe("Lector de cotizaciones", () => {
  it("lee montos chilenos", () => {
    expect(aNumero("$ 1.234.567")).toBe(1_234_567);
    expect(aNumero("1.234,50")).toBe(1234.5);
    expect(aNumero("26,923")).toBe(26_923);
    expect(aNumero("sin precio")).toBeNull();
  });

  it("una tabla pegada desde Excel sale con cantidad, precio y total por fila", () => {
    const pegado = [
      "Ítem\tDescripción\tCantidad\tPrecio unitario\tTotal",
      "1\tCemento 25 kg\t10\t4.400\t44.000",
      "2\tFierro 12 mm\t5\t12.990\t64.950",
    ].join("\n");
    const { filas } = leerCotizacionPegada(pegado);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ cantidad: 10, precioUnitario: 4400, total: 44_000 });
    expect(filas[0].descripcion).toMatch(/Cemento 25 kg/);
    expect(filas[1]).toMatchObject({ cantidad: 5, precioUnitario: 12_990, total: 64_950 });
  });
});
