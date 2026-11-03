import type { PaymentMethod } from "./types";
import { parseDecimal, parseMoneyCents } from "./nfce";
import type { ImportRow, ParsedSpreadsheet } from "./import";

export interface NfeXmlItem {
  name: string;
  quantity: number;
  unit?: string;
  unitCostCents: number;
  totalCents: number;
}

export interface NfeXmlData {
  supplierName?: string;
  cnpj?: string;
  date?: string;
  totalCents?: number;
  paymentMethod?: PaymentMethod;
  paid: boolean;
  dueDate?: string;
  items: NfeXmlItem[];
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .trim();
}

function tagPattern(name: string): string {
  const prefix = "(?:[\\w.-]+:)?";
  return `<${prefix}${name}\\b[^>]*>([\\s\\S]*?)</${prefix}${name}>`;
}

function findTag(xml: string, name: string): string | undefined {
  const match = new RegExp(tagPattern(name), "i").exec(xml);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")) : undefined;
}

function findBlock(xml: string, name: string): string | undefined {
  const prefix = "(?:[\\w.-]+:)?";
  const match = new RegExp(
    `<${prefix}${name}\\b[^>]*>([\\s\\S]*?)</${prefix}${name}>`,
    "i",
  ).exec(xml);
  return match ? match[1] : undefined;
}

function findAllBlocks(xml: string, name: string): string[] {
  const prefix = "(?:[\\w.-]+:)?";
  const regex = new RegExp(
    `<${prefix}${name}\\b[^>]*>([\\s\\S]*?)</${prefix}${name}>`,
    "gi",
  );
  return [...xml.matchAll(regex)].map((match) => match[1]);
}

function paymentFromCode(code?: string): PaymentMethod {
  switch (code) {
    case "01":
      return "cash";
    case "03":
    case "04":
      return "card";
    case "17":
      return "pix";
    default:
      return "other";
  }
}

function firstPaymentCode(pagBlock?: string): string | undefined {
  if (!pagBlock) return undefined;
  return findTag(pagBlock, "tPag");
}

export function parseNfeXml(xml: string): NfeXmlData | null {
  const emit = findBlock(xml, "emit");
  const ide = findBlock(xml, "ide");
  const total = findBlock(xml, "ICMSTot");
  const pag = findBlock(xml, "pag");
  const cobr = findBlock(xml, "cobr");

  const paymentCode = firstPaymentCode(pag);
  const paid = paymentCode ? !["15", "90"].includes(paymentCode) : true;

  const items: NfeXmlItem[] = [];
  for (const det of findAllBlocks(xml, "det")) {
    const prod = findBlock(det, "prod");
    if (!prod) continue;

    const name = findTag(prod, "xProd");
    const quantity = parseDecimal(findTag(prod, "qCom") ?? "") ?? 0;
    const unit = findTag(prod, "uCom");
    let unitCostCents = parseMoneyCents(findTag(prod, "vUnCom") ?? "");
    let totalCents = parseMoneyCents(findTag(prod, "vProd") ?? "");

    if (!unitCostCents && totalCents && quantity > 0) {
      unitCostCents = Math.max(1, Math.round(totalCents / quantity));
    }
    if (unitCostCents && !totalCents) {
      totalCents = Math.round(unitCostCents * quantity);
    }
    if (!name || quantity <= 0 || !unitCostCents || !totalCents) continue;

    items.push({
      name,
      quantity,
      unit: unit || undefined,
      unitCostCents,
      totalCents,
    });
  }

  if (!items.length) return null;

  const rawDate =
    (ide ? findTag(ide, "dhEmissao") ?? findTag(ide, "dEmi") : undefined) ??
    undefined;
  const rawDueDate = cobr ? findTag(cobr, "dVenc") : undefined;

  return {
    supplierName: emit ? findTag(emit, "xNome") : undefined,
    cnpj: emit ? findTag(emit, "CNPJ") : undefined,
    date: rawDate ? rawDate.slice(0, 10) : undefined,
    totalCents: total
      ? parseMoneyCents(findTag(total, "vNF") ?? "")
      : undefined,
    paymentMethod: paymentFromCode(paymentCode),
    paid,
    dueDate: rawDueDate ? rawDueDate.slice(0, 10) : undefined,
    items,
  };
}

export function nfeXmlToImportRows(data: NfeXmlData): ImportRow[] {
  const occurredAt = data.date
    ? `${data.date}T12:00:00`
    : new Date().toISOString();

  return data.items.map((item, index) => ({
    line: index + 1,
    kind: "purchase",
    occurredAt,
    description: item.name,
    amountCents: item.totalCents,
    quantity: item.quantity,
    productName: item.name,
    supplierName: data.supplierName,
    dueDate: data.dueDate,
    paid: data.paid,
    paymentMethod: data.paymentMethod ?? "other",
    errors: [],
    sourceType: "email_import",
    unit: item.unit,
    applyStock: true,
  }));
}

export async function parseNfeXmlFile(file: File): Promise<ParsedSpreadsheet> {
  const xml = await file.text();
  const data = parseNfeXml(xml);
  if (!data) {
    throw new Error(
      "Não achamos itens no XML. Confira se é o XML de uma NF-e/NFC-e.",
    );
  }

  const rows = nfeXmlToImportRows(data);
  return {
    rows,
    invalid: [],
    totalRows: rows.length,
    headers: [
      "Data",
      "Tipo",
      "Descrição",
      "Valor",
      "Quantidade",
      "Produto",
      "Fornecedor",
      "Pagamento",
    ],
    fileName: file.name,
  };
}
