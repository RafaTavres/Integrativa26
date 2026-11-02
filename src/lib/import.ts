import { strFromU8, unzipSync } from "fflate";
import type { PaymentMethod } from "./types";

export type ImportKind =
  | "sale"
  | "expense"
  | "withdrawal"
  | "purchase"
  | "bill";

export interface ImportRow {
  /** Linha da planilha (1 = cabeçalho). */
  line: number;
  kind: ImportKind;
  occurredAt: string;
  description: string;
  amountCents: number;
  quantity?: number;
  productName?: string;
  supplierName?: string;
  dueDate?: string;
  paid: boolean;
  paymentMethod: PaymentMethod;
  errors: string[];
}

export interface ParsedSpreadsheet {
  rows: ImportRow[];
  invalid: ImportRow[];
  totalRows: number;
  headers: string[];
  fileName: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["data", "date", "dia", "data_venda", "data_compra", "competencia"],
  kind: ["tipo", "type", "operacao", "lancamento", "natureza"],
  description: [
    "descricao",
    "description",
    "historico",
    "detalhe",
    "observacao",
    "item",
    "produto",
  ],
  amount: ["valor", "amount", "total", "valor_total", "preco", "preco_total"],
  quantity: ["quantidade", "qty", "quantity", "qtd", "volume"],
  product: ["produto", "product", "item", "mercadoria", "descricao_produto"],
  supplier: ["fornecedor", "supplier", "loja", "vendedor", "emitente"],
  dueDate: [
    "vencimento",
    "due_date",
    "data_vencimento",
    "vencimento_data",
    "prazo",
    "pagar_em",
  ],
  paid: ["pago", "paid", "status_pagamento", "quitado", "foi_pago"],
  paymentMethod: [
    "forma_pagamento",
    "pagamento",
    "payment",
    "metodo",
    "forma_de_pagamento",
  ],
};

const KIND_ALIASES: Record<string, ImportKind> = {
  venda: "sale",
  vendas: "sale",
  sale: "sale",
  sales: "sale",
  entrada: "sale",
  receita: "sale",
  faturamento: "sale",
  gasto: "expense",
  despesa: "expense",
  saida: "expense",
  expense: "expense",
  custo: "expense",
  compra: "purchase",
  compras: "purchase",
  purchase: "purchase",
  estoque: "purchase",
  mercadoria: "purchase",
  retirada: "withdrawal",
  saque: "withdrawal",
  pro_labore: "withdrawal",
  prolabore: "withdrawal",
  withdrawal: "withdrawal",
  conta: "bill",
  boleto: "bill",
  a_pagar: "bill",
  fatura: "bill",
  bill: "bill",
};

const PAYMENT_ALIASES: Record<string, PaymentMethod> = {
  pix: "pix",
  dinheiro: "cash",
  cash: "cash",
  especie: "cash",
  cartao: "card",
  card: "card",
  credito: "card",
  debito: "card",
  boleto: "other",
  transferencia: "other",
  outro: "other",
  other: "other",
};

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseAmount(raw: string): number {
  const clean = raw.replace(/[^\d.,-]/g, "").trim();
  if (!clean) return 0;
  let value = clean;
  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = value.split(".");
    if (parts.length > 2) {
      value = `${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`;
    }
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) : 0;
}

function parseBoolean(raw: string, fallback: boolean): boolean {
  const value = normalizeHeader(raw);
  if (!value) return fallback;
  if (
    ["sim", "s", "true", "1", "pago", "yes", "y", "quitado"].includes(value)
  ) {
    return true;
  }
  if (
    ["nao", "n", "false", "0", "aberto", "pendente", "no"].includes(value)
  ) {
    return false;
  }
  return fallback;
}

function parsePaymentMethod(raw: string): PaymentMethod {
  return PAYMENT_ALIASES[normalizeHeader(raw)] ?? "other";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateToIso(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function dateToOnly(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function excelSerialToParts(serial: number): [number, number, number] {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

function parseDateParts(
  raw: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const value = raw.trim();
  if (!value) return null;

  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const [year, month, day] = excelSerialToParts(serial);
    return { year, month, day, hour: 12, minute: 0 };
  }

  const dateTime =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(value);
  if (dateTime) {
    return {
      year: Number(dateTime[1]),
      month: Number(dateTime[2]),
      day: Number(dateTime[3]),
      hour: dateTime[4] ? Number(dateTime[4]) : 12,
      minute: dateTime[5] ? Number(dateTime[5]) : 0,
    };
  }

  const brazilian =
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(
      value,
    );
  if (brazilian) {
    const year =
      Number(brazilian[3]) < 100
        ? 2000 + Number(brazilian[3])
        : Number(brazilian[3]);
    return {
      year,
      month: Number(brazilian[2]),
      day: Number(brazilian[1]),
      hour: brazilian[4] ? Number(brazilian[4]) : 12,
      minute: brazilian[5] ? Number(brazilian[5]) : 0,
    };
  }

  return null;
}

function parseDateValue(raw: string): string | null {
  const parts = parseDateParts(raw);
  if (!parts) return null;
  return dateToIso(parts.year, parts.month, parts.day, parts.hour, parts.minute);
}

function parseDueValue(raw: string): string | null {
  const parts = parseDateParts(raw);
  if (!parts) return null;
  return dateToOnly(parts.year, parts.month, parts.day);
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12, 0, 0, 0);
  return dateToOnly(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function todayOnly(): string {
  const now = new Date();
  return dateToOnly(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = {
    ";": (firstLine.match(/;/g) ?? []).length,
    ",": (firstLine.match(/,/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  if (counts["\t"] >= counts[";"] && counts["\t"] >= counts[","]) return "\t";
  if (counts[";"] >= counts[","]) return ";";
  return ",";
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// XLSX (leitor mínimo: primeira aba, valores e textos compartilhados)
// ---------------------------------------------------------------------------

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => {
      const map: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      return map[entity] ?? "";
    });
}

function textFromXml(xml: string): string {
  const texts = [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) =>
    decodeXml(match[1]),
  );
  if (texts.length > 0) return texts.join("");
  return decodeXml(xml.replace(/<[^>]+>/g, ""));
}

function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/i.exec(reference)?.[1]?.toUpperCase();
  if (!letters) return 0;
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseXlsx(buffer: ArrayBuffer): string[][] {
  const files = unzipSync(new Uint8Array(buffer));
  const sharedStringsRaw = files["xl/sharedStrings.xml"]
    ? strFromU8(files["xl/sharedStrings.xml"])
    : "";
  const sharedStrings = [...sharedStringsRaw.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
    (match) => textFromXml(match[1]),
  );

  const sheetPath =
    Object.keys(files).find((path) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(path),
    ) ?? Object.keys(files).find((path) => path.startsWith("xl/worksheets/"));
  if (!sheetPath) {
    throw new Error("A planilha não tem uma aba legível.");
  }

  const sheetXml = strFromU8(files[sheetPath]);
  const rows: string[][] = [];

  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1] ?? "";
      const type = /\bt="([^"]+)"/i.exec(attrs)?.[1] ?? "";
      const valueTag = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      let value = "";

      if (type === "s") {
        value = sharedStrings[Number(valueTag)] ?? "";
      } else if (type === "inlineStr" || type === "str") {
        value = textFromXml(body);
      } else if (type === "b") {
        value = valueTag === "1" ? "sim" : "nao";
      } else {
        value = decodeXml(valueTag);
      }

      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    if (cells.some((cell) => cell.trim() !== "")) rows.push(cells);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Cabeçalhos e linhas
// ---------------------------------------------------------------------------

function buildHeaderMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized) && !map.has(field)) {
        map.set(field, index);
      }
    }
  });
  return map;
}

function valueAt(cells: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (cells[index] ?? "").trim();
}

function buildRow(
  cells: string[],
  header: Map<string, number>,
  line: number,
): ImportRow {
  const errors: string[] = [];
  const kindRaw = normalizeHeader(valueAt(cells, header.get("kind")));
  const kind = KIND_ALIASES[kindRaw];
  const productName =
    valueAt(cells, header.get("product")) ||
    valueAt(cells, header.get("description"));
  const description =
    valueAt(cells, header.get("description")) || productName || "Importado";
  const amountCents = parseAmount(valueAt(cells, header.get("amount")));
  const quantityRaw = valueAt(cells, header.get("quantity"));
  const quantity = quantityRaw
    ? Number(quantityRaw.replace(",", "."))
    : undefined;
  const dateRaw = valueAt(cells, header.get("date"));
  const dueRaw = valueAt(cells, header.get("dueDate"));
  const paidRaw = valueAt(cells, header.get("paid"));

  if (!kind) {
    errors.push(
      `Tipo não reconhecido em "${valueAt(cells, header.get("kind")) || "vazio"}". Use venda, gasto, compra, retirada ou conta.`,
    );
  }
  if (amountCents < 1) errors.push("Valor precisa ser maior que zero.");
  if (!description.trim()) errors.push("Descrição vazia.");

  const occurredAt = parseDateValue(dateRaw) ?? new Date().toISOString();
  if (dateRaw && !parseDateValue(dateRaw)) {
    errors.push(`Data inválida: ${dateRaw}.`);
  }

  const resolvedKind: ImportKind = kind ?? "expense";
  const isBill = resolvedKind === "bill";
  const isPurchase = resolvedKind === "purchase";
  const defaultPaid = isBill ? false : isPurchase ? !dueRaw : true;
  const paid = parseBoolean(paidRaw, defaultPaid);

  let dueDate = dueRaw ? parseDueValue(dueRaw) : null;
  if (dueRaw && !dueDate) errors.push(`Vencimento inválido: ${dueRaw}.`);
  if (!paid && !dueDate && (isBill || isPurchase)) {
    // Conta vence em 7 dias; compra a prazo, em 14 — os mesmos padrões da tela.
    dueDate = addDays(todayOnly(), isBill ? 7 : 14);
  }
  if (isBill && !dueDate) {
    errors.push("Conta a pagar precisa de vencimento.");
  }

  return {
    line,
    kind: resolvedKind,
    occurredAt,
    description: description.trim(),
    amountCents,
    quantity:
      quantity && Number.isFinite(quantity) && quantity > 0
        ? quantity
        : undefined,
    productName: productName.trim() || undefined,
    supplierName: valueAt(cells, header.get("supplier")) || undefined,
    dueDate: dueDate ?? undefined,
    paid,
    paymentMethod: parsePaymentMethod(
      valueAt(cells, header.get("paymentMethod")),
    ),
    errors,
  };
}

export function parseSpreadsheetRows(
  rows: string[][],
  fileName = "planilha",
): ParsedSpreadsheet {
  if (rows.length === 0) {
    throw new Error("A planilha está vazia.");
  }
  const header = buildHeaderMap(rows[0]);
  if (header.size === 0) {
    throw new Error(
      "Não encontrei os cabeçalhos. A primeira linha precisa ter colunas como data, tipo, descrição e valor.",
    );
  }
  if (!header.has("amount")) {
    throw new Error("A planilha precisa de uma coluna de valor.");
  }

  const valid: ImportRow[] = [];
  const invalid: ImportRow[] = [];

  rows.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => !cell.trim())) return;
    const row = buildRow(cells, header, index + 2);
    if (row.errors.length > 0) {
      invalid.push(row);
    } else {
      valid.push(row);
    }
  });

  return {
    rows: valid,
    invalid,
    totalRows: rows.length - 1,
    headers: rows[0],
    fileName,
  };
}

export async function parseSpreadsheetFile(
  file: File,
): Promise<ParsedSpreadsheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const buffer = await file.arrayBuffer();
    return parseSpreadsheetRows(parseXlsx(buffer), file.name);
  }
  if (name.endsWith(".xls")) {
    throw new Error(
      "O formato .xls antigo não é suportado. Abra no Excel e salve como .xlsx ou .csv.",
    );
  }
  const text = await file.text();
  if (!text.trim()) throw new Error("O arquivo está vazio.");
  const delimiter = detectDelimiter(text);
  return parseSpreadsheetRows(
    parseDelimitedText(text, delimiter),
    file.name,
  );
}

export const IMPORT_TEMPLATE_HEADER =
  "data;tipo;descricao;valor;quantidade;produto;fornecedor;vencimento;pago;forma_pagamento";

export const IMPORT_TEMPLATE_EXAMPLES = [
  "01/11/2026;venda;Bolo de cenoura;50,00;1;Bolo de cenoura;;;sim;pix",
  "01/11/2026;gasto;Embalagens e sacolas;38,00;;;;;;pix",
  "02/11/2026;compra;Pão de queijo;45,00;10;Pão de queijo;Atacadão do Doce;;sim;pix",
  "02/11/2026;compra;Farinha e chocolate;186,50;;;;Atacadão do Doce;15/11/2026;nao;pix",
  "02/11/2026;retirada;Retirada para casa;150,00;;;;;;pix",
  "03/11/2026;conta;Embalagens Bianca;92,00;;;;Embalagens Bianca;10/11/2026;nao;pix",
];

export const IMPORT_TEMPLATE_CSV = [
  IMPORT_TEMPLATE_HEADER,
  ...IMPORT_TEMPLATE_EXAMPLES,
].join("\n");
