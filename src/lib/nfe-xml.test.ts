import { describe, expect, it } from "vitest";
import { nfeXmlToImportRows, parseNfeXml } from "./nfe-xml";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe42260112345678000195650010000012341000012345">
      <ide>
        <dhEmissao>2026-11-01T10:00:00-03:00</dhEmissao>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>Fornecedor de Teste</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <xProd>Camiseta básica</xProd>
          <qCom>2</qCom>
          <uCom>un</uCom>
          <vUnCom>25.00</vUnCom>
          <vProd>50.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>50.00</vNF>
        </ICMSTot>
      </total>
      <pag>
        <detPag>
          <tPag>17</tPag>
        </detPag>
      </pag>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("parseNfeXml", () => {
  it("lê fornecedor, item e pagamento", () => {
    const data = parseNfeXml(xml);
    expect(data).not.toBeNull();
    expect(data?.supplierName).toBe("Fornecedor de Teste");
    expect(data?.paymentMethod).toBe("pix");
    expect(data?.items).toHaveLength(1);
    expect(data?.items[0]).toMatchObject({
      name: "Camiseta básica",
      quantity: 2,
      unitCostCents: 2500,
      totalCents: 5000,
    });
  });

  it("converte itens em linhas de compra", () => {
    const data = parseNfeXml(xml);
    const rows = nfeXmlToImportRows(data!);
    expect(rows[0]).toMatchObject({
      kind: "purchase",
      amountCents: 5000,
      productName: "Camiseta básica",
      paid: true,
    });
  });

  it("devolve null sem itens", () => {
    expect(parseNfeXml("<nfeProc></nfeProc>")).toBeNull();
  });
});
