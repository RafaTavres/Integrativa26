import { parse, type HTMLElement } from "node-html-parser";
import {
  normalizeNfceText,
  parseDecimal,
  parseMoneyCents,
  type NfceData,
  type NfceItem,
} from "./nfce";

const DESCRIPTION_HEADERS = ["descricao", "produto", "item", "mercadoria"];
const QUANTITY_HEADERS = ["qtde", "qtd", "quantidade"];
const UNIT_HEADERS = ["un", "unidade", "unid"];
const UNIT_PRICE_HEADERS = [
  "vl unit",
  "valor unit",
  "unitario",
  "vl. unit",
  "valor unitario",
];
const TOTAL_HEADERS = ["vl total", "valor total", "total"];

function textOf(node: HTMLElement): string {
  return node.text.replace(/\s+/g, " ").trim();
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) =>
    candidates.some(
      (candidate) => header === candidate || header.includes(candidate),
    ),
  );
}

function cellTexts(row: HTMLElement): string[] {
  return row.querySelectorAll("td, th").map(textOf);
}

function looksLikeItemName(value: string): boolean {
  const normalized = normalizeNfceText(value);
  if (normalized.length < 2) return false;
  if (!/[a-z]{2}/.test(normalized)) return false;
  if (
    /^(total|subtotal|valor|desconto|tributos?|forma|pagamento|troco|qtd|quantidade|descricao|codigo|item)$/.test(
      normalized,
    )
  ) {
    return false;
  }
  return true;
}

function buildItem(
  cells: string[],
  columns: {
    description: number;
    quantity: number;
    unit?: number;
    unitPrice?: number;
    total?: number;
  },
): NfceItem | undefined {
  const name = cells[columns.description]?.trim();
  if (!name || !looksLikeItemName(name)) return undefined;

  const quantity = parseDecimal(cells[columns.quantity] ?? "") ?? 0;
  if (quantity <= 0) return undefined;

  const unit =
    columns.unit !== undefined ? cells[columns.unit]?.trim() : undefined;
  let unitCostCents =
    columns.unitPrice !== undefined
      ? parseMoneyCents(cells[columns.unitPrice] ?? "")
      : undefined;
  let totalCents =
    columns.total !== undefined
      ? parseMoneyCents(cells[columns.total] ?? "")
      : undefined;

  if (!unitCostCents && totalCents) {
    unitCostCents = Math.max(1, Math.round(totalCents / quantity));
  }
  if (unitCostCents && !totalCents) {
    totalCents = Math.round(unitCostCents * quantity);
  }
  if (!unitCostCents || !totalCents) return undefined;

  return {
    name,
    quantity,
    unit: unit || undefined,
    unitCostCents,
    totalCents,
  };
}

function parseItemTable(table: HTMLElement): NfceItem[] {
  const rows = table.querySelectorAll("tr");
  if (!rows.length) return [];

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 6); rowIndex += 1) {
    const headers = cellTexts(rows[rowIndex]).map(normalizeNfceText);
    const description = findColumn(headers, DESCRIPTION_HEADERS);
    const quantity = findColumn(headers, QUANTITY_HEADERS);
    if (description < 0 || quantity < 0) continue;

    const unit = findColumn(headers, UNIT_HEADERS);
    const unitPrice = findColumn(headers, UNIT_PRICE_HEADERS);
    const total = findColumn(headers, TOTAL_HEADERS);
    const columns = {
      description,
      quantity,
      unit: unit >= 0 ? unit : undefined,
      unitPrice: unitPrice >= 0 ? unitPrice : undefined,
      total: total >= 0 ? total : undefined,
    };

    const items: NfceItem[] = [];
    for (let index = rowIndex + 1; index < rows.length; index += 1) {
      const item = buildItem(cellTexts(rows[index]), columns);
      if (item) items.push(item);
    }
    if (items.length) return items;
  }

  // Tabelas antigas nem sempre têm cabeçalho. Nesse caso, usa a ordem padrão
  // do DANFE: código, descrição, quantidade, unidade, valor unitário, total.
  const items: NfceItem[] = [];
  for (const row of rows) {
    const cells = cellTexts(row);
    if (cells.length < 5) continue;
    const item = buildItem(cells, {
      description: 1,
      quantity: 2,
      unit: 3,
      unitPrice: 4,
      total: 5,
    });
    if (item) items.push(item);
  }
  return items;
}

function findCnpj(text: string): string | undefined {
  const match = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  return match ? match[0] : undefined;
}

function findDate(text: string): string | undefined {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function findTotalCents(text: string): number | undefined {
  const match = text.match(
    /(?:valor\s+total|total\s+da\s+nota|total\s+a\s+pagar)[^\d]{0,50}([\d.,]+)/i,
  );
  return match ? parseMoneyCents(match[1]) : undefined;
}

function findSupplierName(root: HTMLElement): string | undefined {
  const labels = root.querySelectorAll("td, th, span, div, label");
  for (const node of labels) {
    const text = textOf(node);
    const normalized = normalizeNfceText(text);
    if (
      normalized.startsWith("razao social") ||
      normalized.startsWith("nome empresarial") ||
      normalized.startsWith("nome fantasia")
    ) {
      const value = text
        .replace(/^[^:]+:\s*/i, "")
        .replace(/^(razao social|nome empresarial|nome fantasia)\s*/i, "")
        .trim();
      if (value.length >= 2 && !/^(razao social|nome)/i.test(value)) {
        return value;
      }
      const parent = node.parentNode as HTMLElement | null;
      if (parent) {
        const after = textOf(parent)
          .replace(
            /^.*?(razao social|nome empresarial|nome fantasia)\s*:?\s*/i,
            "",
          )
          .trim();
        if (after.length >= 2 && after.length < 120) return after;
      }
    }
  }
  return undefined;
}

export function parseNfceHtml(html: string, url: string): NfceData | null {
  const root = parse(html);
  const text = root.text.replace(/\s+/g, " ").trim();

  const tables = root.querySelectorAll("table");
  const tableItems = tables.flatMap(parseItemTable);
  const items: NfceItem[] = [];
  for (const item of tableItems) {
    const existing = items.find(
      (candidate) =>
        normalizeNfceText(candidate.name) === normalizeNfceText(item.name) &&
        candidate.unitCostCents === item.unitCostCents,
    );
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalCents += item.totalCents;
    } else {
      items.push({ ...item });
    }
  }

  if (!items.length) return null;

  return {
    url,
    supplierName: findSupplierName(root),
    cnpj: findCnpj(text),
    date: findDate(text),
    totalCents: findTotalCents(text),
    items,
  };
}
