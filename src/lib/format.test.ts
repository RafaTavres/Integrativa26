import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "./format";

describe("parseMoneyInput", () => {
  it("aceita inteiro, vírgula e milhar", () => {
    expect(parseMoneyInput("50")).toBe(5000);
    expect(parseMoneyInput("50,90")).toBe(5090);
    expect(parseMoneyInput("1.234,56")).toBe(123456);
    expect(parseMoneyInput("R$ 12,30")).toBe(1230);
  });

  it("aceita ponto decimal", () => {
    expect(parseMoneyInput("50.90")).toBe(5090);
  });

  it("devolve zero para entrada vazia ou inválida", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
  });
});
