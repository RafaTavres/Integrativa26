import { describe, expect, it } from "vitest";
import {
  IMPORT_TEMPLATE_HEADER,
  parseSpreadsheetRows,
} from "./import";

describe("parseSpreadsheetRows", () => {
  it("lê o modelo oficial", () => {
    const rows = [
      IMPORT_TEMPLATE_HEADER.split(";"),
      [
        "01/11/2026",
        "venda",
        "Bolo de cenoura",
        "50,00",
        "1",
        "Bolo de cenoura",
        "",
        "",
        "sim",
        "pix",
      ],
    ];

    const result = parseSpreadsheetRows(rows, "teste.csv");
    expect(result.rows).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
    expect(result.rows[0].amountCents).toBe(5000);
    expect(result.rows[0].kind).toBe("sale");
  });

  it("separa linhas inválidas", () => {
    const rows = [
      IMPORT_TEMPLATE_HEADER.split(";"),
      ["data-ruim", "venda", "", "abc"],
    ];

    const result = parseSpreadsheetRows(rows, "teste.csv");
    expect(result.rows).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it("exige coluna de valor", () => {
    expect(() => parseSpreadsheetRows([["data", "tipo"]])).toThrow(
      /coluna de valor/i,
    );
  });
});
