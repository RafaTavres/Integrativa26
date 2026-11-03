import { describe, expect, it } from "vitest";
import { isAllowedNfceUrl, parseNfceQrCode } from "./nfce";

describe("isAllowedNfceUrl", () => {
  it("aceita portais fiscais .gov.br", () => {
    expect(
      isAllowedNfceUrl(new URL("https://nfce.sefaz.sc.gov.br/consulta")),
    ).toBe(true);
    expect(
      isAllowedNfceUrl(new URL("http://sat.sef.sc.gov.br/nfce/consulta")),
    ).toBe(true);
    expect(
      isAllowedNfceUrl(new URL("https://www.sefaz.rs.gov.br/nfe")),
    ).toBe(true);
  });

  it("bloqueia domínios comuns, portas e credenciais", () => {
    expect(isAllowedNfceUrl(new URL("https://example.com/nfce"))).toBe(false);
    expect(
      isAllowedNfceUrl(new URL("https://nfce.sefaz.sc.gov.br:8443/consulta")),
    ).toBe(false);
    expect(
      isAllowedNfceUrl(
        new URL("https://user:pass@nfce.sefaz.sc.gov.br/consulta"),
      ),
    ).toBe(false);
  });
});

describe("parseNfceQrCode", () => {
  it("extrai a chave do parâmetro p", () => {
    const key = "42260112345678000195650010000012341000012345";
    const result = parseNfceQrCode(
      `https://nfce.sefaz.sc.gov.br/consulta?p=${key}|2|1|1`,
    );
    expect(result?.key).toBe(key);
  });

  it("recusa URL fora da allowlist", () => {
    expect(parseNfceQrCode("https://example.com/nfce")).toBeNull();
  });
});
