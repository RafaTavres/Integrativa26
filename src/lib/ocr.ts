"use client";

import type { PaymentMethod, Product, Supplier } from "./types";

/**
 * Leitura de notas e cupons direto no navegador.
 *
 * A foto é reduzida, ganha contraste e passa pelo Tesseract.js em um WebWorker.
 * Nada é enviado para servidor nenhum. O texto reconhecido é interpretado com
 * regras para cupom/nota brasileira e vira um rascunho para a pessoa conferir.
 */

export interface ReceiptItemDraft {
  name: string;
  quantity: number;
  unitCostCents: number;
  totalCents: number;
}

export interface ReceiptDraft {
  kind: "purchase" | "sale";
  supplierName?: string;
  cnpj?: string;
  date?: string;
  totalCents?: number;
  paymentMethod?: PaymentMethod;
  items: ReceiptItemDraft[];
  rawText: string;
  confidence: number;
  warnings: string[];
  /** URL do QR Code da NFC-e, quando a foto tem um. */
  qrCode?: string;
}

export interface OcrProgress {
  /** 0–1 */
  progress: number;
  status: string;
}

interface ReadReceiptOptions {
  rotation?: number;
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
}

const MAX_DIMENSION = 3000;

const MONEY_SOURCE =
  "\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2}|\\d{1,3}(?:\\.\\d{3})*\\.\\d{2}";

/** Quantidade inteira ou decimal, como "2", "1,00" ou "4,28". */
const QUANTITY_SOURCE = "\\d{1,3}(?:[.,]\\d{1,3})?";

const MONEY_TOKEN = new RegExp(
  `(?:R\\$\\s*)?(${MONEY_SOURCE}|\\d{1,3}(?:\\.\\d{3})+|\\d+)`,
  "gi",
);

/** Unidade e operador que aparecem entre a quantidade e o valor unitário. */
const UNIT_SOURCE =
  "(?:un|und|unid|unidade|unidades|kg|g|lt|ml|pc|pct|cx|caixa|pacote|pacotes|dz|duzia|dúzia|=\\s*\\d{1,2})?";
const OPERATOR_SOURCE = "(?:x|×|@)?";

const NON_ITEM = new RegExp(
  [
    "total",
    "subtotal",
    "desconto",
    "troco",
    "imposto",
    "tributo",
    "taxa",
    "servico",
    "cnpj",
    "cpf",
    "inscricao",
    "telefone",
    "fone",
    "celular",
    "data",
    "hora",
    "cupom",
    "nota fiscal",
    "documento",
    "chave",
    "consulta",
    "operador",
    "caixa",
    "endereco",
    "rua",
    "avenida",
    "av\\.",
    "cep",
    "site",
    "www",
    "email",
    "pagamento",
    "dinheiro",
    "cartao",
    "cartão",
    "pix",
    "credito",
    "crédito",
    "debito",
    "débito",
    "valor pago",
    "recebido",
    "quantidade",
    "unitario",
    "unitário",
    "vl\\.",
    "obrigado",
    "volte",
  ].join("|"),
  "i",
);

const SUPPLIER_SKIP = new RegExp(
  [
    "cupom",
    "nota fiscal",
    "documento",
    "cnpj",
    "cpf",
    "inscricao",
    "inscrição",
    "endereco",
    "endereço",
    "rua ",
    "avenida",
    "av\\.",
    "telefone",
    "fone",
    "site",
    "www",
    "chave",
    "consulta",
    "sat",
    "ecf",
    "caixa",
    "operador",
    "data",
    "hora",
    "total",
    "pagamento",
    "obrigado",
  ].join("|"),
  "i",
);

const HEADER_SKIP = new RegExp(
  [
    "cupom fiscal",
    "nota fiscal",
    "documento auxiliar",
    "danfe",
    "cnpj",
    "cpf",
    "chave de acesso",
    "consulta",
    "sat",
    "ecf",
    "total",
    "pagamento",
    "troco",
    "desconto",
  ].join("|"),
  "i",
);

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanLine(line: string): string {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Corrige confusões comuns do OCR em trechos numéricos:
 * 1O,5O -> 10,50 / 5S,OO -> 55,00. Só age em tokens com dígitos.
 */
function fixNumericNoise(raw: string): string {
  if (!/\d/.test(raw)) return raw;
  return raw
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

function parseMoneyToken(raw: string): number | undefined {
  const cleaned = fixNumericNoise(raw)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d.,]/g, "");
  if (!cleaned) return undefined;

  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const cents = Math.round(value * 100);
  return cents > 0 ? cents : undefined;
}

function parseQuantityToken(raw: string): number {
  const cleaned = raw.trim();
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}\.\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(".", "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clampQuantity(quantity: number): number {
  return Math.min(9999, Math.max(0.001, quantity));
}

function moneyTokens(line: string): number[] {
  const values: number[] = [];
  for (const match of line.matchAll(MONEY_TOKEN)) {
    // Evita capturar pedaços de CNPJ/CPF/data como dinheiro.
    const start = match.index ?? 0;
    const before = line.slice(Math.max(0, start - 1), start);
    const after = line.slice(start + match[0].length, start + match[0].length + 1);
    if (/[/-]/.test(before) || /[/-]/.test(after)) continue;
    const cents = parseMoneyToken(match[1]);
    if (cents) values.push(cents);
  }
  return values;
}

function lastMoney(line: string): number | undefined {
  const values = moneyTokens(line);
  return values.length ? values[values.length - 1] : undefined;
}

function formatSupplier(raw: string): string {
  const cleaned = raw
    .replace(/^[\d\s.#*-]+/, "")
    .replace(/[-–—:;,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3 || cleaned.length > 70) return "";
  if (!/[A-Za-zÀ-ÿ]{3}/.test(cleaned)) return "";
  if (SUPPLIER_SKIP.test(cleaned)) return "";
  if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(cleaned)) return "";
  return cleaned;
}

function findSupplier(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 10)) {
    const candidate = formatSupplier(line);
    if (candidate) return candidate;
  }
  return undefined;
}

function findCnpj(text: string): string | undefined {
  const match = /(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[\/\s]?(\d{4})[-\s]?(\d{2})/.exec(
    text,
  );
  if (!match) return undefined;
  const digits = match.slice(1).join("");
  return digits.length === 14 ? digits : undefined;
}

function findDate(lines: string[]): string | undefined {
  const candidates: Array<{ value: string; score: number }> = [];

  for (const line of lines) {
    const matches = line.matchAll(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/g);
    for (const match of matches) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      let year = Number(match[3]);
      if (year < 100) year += year > 50 ? 1900 : 2000;
      if (
        day < 1 ||
        day > 31 ||
        month < 1 ||
        month > 12 ||
        year < 2000 ||
        year > 2100
      ) {
        continue;
      }
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      candidates.push({ value: iso, score: /data|emiss/i.test(line) ? 2 : 1 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.value;
}

function findPayment(text: string): PaymentMethod | undefined {
  const normalized = normalizeText(text);
  if (/\bpix\b/.test(normalized)) return "pix";
  if (
    /cartao|credito|debito|maquininha|parcelad|visa|mastercard|elo\b/.test(
      normalized,
    )
  ) {
    return "card";
  }
  if (/dinheiro|especie|cedula|nota de|troco/.test(normalized)) return "cash";
  return undefined;
}

function findTotal(lines: string[]): number | undefined {
  const candidates: Array<{ cents: number; score: number }> = [];

  for (const line of lines) {
    if (/subtotal|total de itens|total itens|desconto|troco|imposto|tributo/i.test(line)) {
      continue;
    }
    if (!/total/i.test(line)) continue;
    const cents = lastMoney(line);
    if (!cents) continue;
    let score = 1;
    if (/total\s*(?:a pagar|da nota|geral|bruto|liquido|líquido)/i.test(line)) {
      score = 3;
    } else if (/valor\s*total/i.test(line)) {
      score = 2;
    }
    candidates.push({ cents, score });
  }

  candidates.sort((a, b) => b.score - a.score || b.cents - a.cents);
  if (candidates[0]) return candidates[0].cents;

  // Sem a palavra "total": usa o maior valor da nota, ignorando troco e
  // desconto. É o palpite mais seguro para cupons curtos.
  const fallback: number[] = [];
  for (const line of lines) {
    if (/troco|desconto|subtotal|imposto|tributo|cnpj|cpf/i.test(line)) continue;
    const cents = lastMoney(line);
    if (cents) fallback.push(cents);
  }
  return fallback.length ? Math.max(...fallback) : undefined;
}

function cleanItemName(raw: string): string {
  return raw
    .replace(/^\s*\d{1,6}\s+/, "")
    .replace(/\b(?:un|und|unid|unidade|unidades|kg|g|lt|ml)\b\.?\s*$/i, "")
    // Sobra de linha mal segmentada: "FARINHA & UNID x 6,00".
    .replace(
      /\s+(?:&\s*)?(?:(?:un|und|unid|unidade|unidades|kg|g|lt|ml|pc|pct|cx|caixa|pacote|pacotes|dz)\b\.?\s*)?(?:x|×|@)?\s*\d{1,3}[.,]\d{2}$/i,
      "",
    )
    .replace(/\s*&\s*$/, "")
    .replace(/^[-–—:;,.]+|[-–—:;,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deixa nomes lidos em caixa alta mais legíveis: "FARINHA DE TRIGO" vira
 * "Farinha de trigo". Nomes que já vieram com maiúsculas e minúsculas são
 * preservados como estão.
 */
export function tidyItemName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Só mexe quando não existe nenhuma letra minúscula.
  if (/[a-zà-ÿ]/.test(cleaned)) return cleaned;

  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}

function isPlausibleItemName(name: string): boolean {
  if (name.length < 2 || name.length > 80) return false;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(name)) return false;
  if (NON_ITEM.test(name)) return false;
  if (HEADER_SKIP.test(name)) return false;
  if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(name)) return false;
  return true;
}

interface ParsedItem {
  name: string;
  quantity: number;
  totalCents: number;
}

function parseItems(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];

  const add = (
    rawName: string,
    quantity: number,
    totalCents: number,
  ) => {
    const name = cleanItemName(rawName);
    if (!isPlausibleItemName(name)) return;
    if (totalCents < 1 || quantity <= 0) return;

    // O mesmo produto pode aparecer em mais de uma linha (lotes diferentes).
    // Soma as quantidades, mas só quando o custo unitário também bate; preços
    // diferentes podem ser produtos ou promoções distintas e não devem virar
    // uma média que não existe na nota.
    const key = normalizeText(name);
    const unitCost = totalCents / quantity;
    const existing = items.find((item) => {
      if (normalizeText(item.name) !== key) return false;
      const existingUnitCost = item.totalCents / item.quantity;
      return Math.abs(existingUnitCost - unitCost) <= 1;
    });
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + quantity);
      existing.totalCents += totalCents;
      return;
    }

    items.push({
      name,
      quantity: clampQuantity(quantity),
      totalCents,
    });
  };

  // Nome que apareceu sozinho na linha anterior. Em muitos cupons o nome do
  // produto fica em uma linha e "2 x 40,00 = 80,00" na seguinte.
  let pendingName: string | null = null;

  for (const line of lines) {
    if (NON_ITEM.test(line) || HEADER_SKIP.test(line)) {
      pendingName = null;
      continue;
    }

    const withUnitAndTotal = new RegExp(
      `^(.+?)\\s+(${QUANTITY_SOURCE})(?![\\d.,])\\s*${UNIT_SOURCE}\\s*${OPERATOR_SOURCE}\\s*(?:R\\$\\s*)?(${MONEY_SOURCE})\\s*(?:=|→)?\\s*(?:R\\$\\s*)?(${MONEY_SOURCE})$`,
      "i",
    ).exec(line);

    if (withUnitAndTotal) {
      let quantity = parseQuantityToken(withUnitAndTotal[2]);
      const unitPriceCents = parseMoneyToken(withUnitAndTotal[3]);
      const totalCents = parseMoneyToken(withUnitAndTotal[4]);
      // O OCR às vezes perde a vírgula da quantidade ("4,28" vira "428").
      // Quando o preço unitário e o total estão legíveis, o total manda:
      // 23,43 / 5,48 = 4,28.
      if (quantity > 0 && unitPriceCents && totalCents) {
        const expected = quantity * unitPriceCents;
        if (Math.abs(expected - totalCents) > Math.max(2, totalCents * 0.05)) {
          const inferred = totalCents / unitPriceCents;
          // Só corrige quando a quantidade lida é muito maior que a inferida:
          // é o caso clássico de "4,28" lido como "428". Assim uma nota com
          // total mal lido não vira uma quantidade esquisita.
          if (
            inferred > 0 &&
            inferred <= 9999 &&
            quantity >= inferred * 10
          ) {
            quantity = Math.round(inferred * 100) / 100;
          }
        }
      }
      if (quantity > 0 && totalCents) {
        add(withUnitAndTotal[1], quantity, totalCents);
        pendingName = null;
        continue;
      }
    }

    const withQuantity = new RegExp(
      `^(.+?)\\s+(${QUANTITY_SOURCE})(?![\\d.,])\\s*${UNIT_SOURCE}\\s*${OPERATOR_SOURCE}\\s*(?:R\\$\\s*)?(${MONEY_SOURCE})$`,
      "i",
    ).exec(line);

    if (withQuantity) {
      const quantity = parseQuantityToken(withQuantity[2]);
      const totalCents = parseMoneyToken(withQuantity[3]);
      if (quantity > 0 && totalCents) {
        add(withQuantity[1], quantity, totalCents);
        pendingName = null;
        continue;
      }
    }

    // Linha só com quantidade e preço, sem nome. Usa o nome da linha anterior.
    if (pendingName) {
      const leadingQuantity = new RegExp(
        `^(${QUANTITY_SOURCE})(?![\\d.,])\\s*${UNIT_SOURCE}\\s*(x|×|@)?\\s*(?:R\\$\\s*)?(${MONEY_SOURCE})(?:\\s*(?:=|→)?\\s*(?:R\\$\\s*)?(${MONEY_SOURCE}))?$`,
        "i",
      ).exec(line);

      if (leadingQuantity) {
        const quantity = parseQuantityToken(leadingQuantity[1]);
        const unitCents = parseMoneyToken(leadingQuantity[3]);
        const explicitTotal = leadingQuantity[4]
          ? parseMoneyToken(leadingQuantity[4])
          : undefined;
        const hasOperator = Boolean(leadingQuantity[2]);
        const totalCents =
          explicitTotal ??
          (hasOperator && unitCents ? unitCents * quantity : unitCents);
        if (quantity > 0 && totalCents) {
          add(pendingName, quantity, totalCents);
          pendingName = null;
          continue;
        }
      }

      const onlyMoney = new RegExp(
        `^(?:R\\$\\s*)?(${MONEY_SOURCE})$`,
        "i",
      ).exec(line);
      if (onlyMoney) {
        const totalCents = parseMoneyToken(onlyMoney[1]);
        if (totalCents) {
          add(pendingName, 1, totalCents);
          pendingName = null;
          continue;
        }
      }
    }

    const simple = new RegExp(
      `^(.+?)\\s+(?:R\\$\\s*)?(${MONEY_SOURCE})$`,
      "i",
    ).exec(line);
    if (simple) {
      const totalCents = parseMoneyToken(simple[2]);
      if (totalCents) {
        add(simple[1], 1, totalCents);
        pendingName = null;
        continue;
      }
    }

    // Nome sem preço: guarda para a próxima linha, que pode trazer a
    // quantidade e o valor.
    const possibleName = cleanItemName(line);
    if (!moneyTokens(line).length && isPlausibleItemName(possibleName)) {
      pendingName = line;
      continue;
    }

    pendingName = null;
  }

  return items;
}

const MATCH_STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "com",
  "ao",
  "a",
  "o",
  "os",
  "as",
  "para",
  "tipo",
  "un",
  "und",
  "unid",
  "unidade",
  "unidades",
  "kg",
  "g",
  "lt",
  "ml",
  "pacote",
  "pacotes",
  "caixa",
  "caixas",
  "lata",
  "latas",
  "garrafa",
  "garrafas",
  "fardo",
  "fardos",
  "cx",
  "pct",
  "ltda",
  "epp",
]);

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !MATCH_STOPWORDS.has(token));
}

/** Distância de edição simples, usada para tolerar erros pequenos do OCR. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Semelhança entre duas palavras. Exige pelo menos 80% de coincidência para
 * aceitar um erro de OCR, como "AGUCAR" x "AÇÚCAR".
 */
function tokenSimilarity(source: string, target: string): number {
  if (source === target) return 1;
  if (source.length < 4 || target.length < 4) return 0;

  const shorter = source.length <= target.length ? source : target;
  const longer = source.length <= target.length ? target : source;
  if (longer.startsWith(shorter) && shorter.length / longer.length >= 0.6) {
    return 0.9;
  }

  const distance = editDistance(source, target);
  const similarity = 1 - distance / Math.max(source.length, target.length);
  return similarity >= 0.8 ? similarity : 0;
}

/** Todos os tokens do produto precisam aparecer no item lido. */
function matchTokenSets(source: string[], target: string[]): number {
  const used = new Set<number>();
  let total = 0;

  for (const token of target) {
    let bestIndex = -1;
    let bestScore = 0;
    source.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = tokenSimilarity(candidate, token);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestScore < 0.8) return 0;
    used.add(bestIndex);
    total += bestScore;
  }

  return total / target.length;
}

export function matchSupplierByName(
  name: string | undefined,
  suppliers: Supplier[],
): Supplier | undefined {
  const tokens = tokenize(name ?? "");
  if (tokens.length === 0) return undefined;

  let best: { supplier: Supplier; score: number } | undefined;
  for (const supplier of suppliers) {
    const supplierTokens = tokenize(supplier.name);
    if (supplierTokens.length === 0) continue;
    const hits = tokens.filter((token) =>
      supplierTokens.some(
        (candidate) =>
          candidate === token ||
          candidate.startsWith(token) ||
          token.startsWith(candidate),
      ),
    ).length;
    if (hits === 0) continue;
    const score = hits / Math.max(tokens.length, supplierTokens.length);
    if (!best || score > best.score) best = { supplier, score };
  }

  return best && best.score >= 0.5 ? best.supplier : undefined;
}

/**
 * Casa o nome lido na nota com um produto já cadastrado.
 *
 * A regra continua conservadora: é melhor criar um produto novo do que somar
 * estoque no item errado. "Bolo de chocolate" não casa com "Chocolate ao
 * leite" só porque os dois têm a palavra "chocolate". Erros pequenos de OCR,
 * como "AGUCAR" x "AÇÚCAR", são aceitos.
 */
export function matchProductByName(
  name: string,
  products: Product[],
): Product | undefined {
  const source = tokenize(name);
  if (source.length === 0) return undefined;

  const normalizedName = normalizeText(name).trim();
  let best: { product: Product; score: number } | undefined;

  for (const product of products) {
    const target = tokenize(product.name);
    if (target.length === 0) continue;

    let score = 0;
    if (normalizedName === normalizeText(product.name).trim()) {
      // Nome idêntico. É o casamento mais seguro.
      score = 10000;
    } else if (target.length >= 2) {
      // Um nome com duas ou mais palavras só casa quando todas aparecem no
      // item lido. "Bolo de chocolate" casa com "Bolo de chocolate caseiro",
      // mas não com "Chocolate ao leite".
      const similarity = matchTokenSets(source, target);
      if (similarity === 0) continue;
      score = 1000 + similarity * 100 + target.length * 10;
    } else {
      // Produto de uma palavra dentro de um nome maior: só aceita quando é a
      // primeira palavra, como "Brigadeiro" em "Brigadeiro gourmet". A tela
      // de revisão mostra qual produto será usado e permite trocar.
      const similarity = tokenSimilarity(source[0], target[0]);
      if (similarity === 0) continue;
      score = 500 + similarity * 100;
    }

    if (!best || score > best.score) best = { product, score };
  }

  return best?.product;
}

function describeStatus(status: string): string {
  switch (status) {
    case "loading tesseract core":
      return "Preparando o leitor";
    case "initializing tesseract":
      return "Preparando o leitor";
    case "loading language traineddata":
      return "Baixando o português";
    case "initializing api":
      return "Quase pronto";
    case "recognizing text":
      return "Lendo a foto";
    default:
      return "Organizando os dados";
  }
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;

    // `decode()` pode ficar pendente em alguns navegadores com fotos grandes.
    // O evento `load` é mais previsível e já entrega a imagem pronta para o
    // canvas.
    await new Promise<void>((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) {
        resolve();
        return;
      }
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não conseguimos abrir a foto."));
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Não conseguimos abrir a foto.");
    }
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareCanvas(file: File, rotation: number): Promise<HTMLCanvasElement> {
  const image = await loadImage(file);
  const degrees = ((rotation % 360) + 360) % 360;
  const swap = degrees === 90 || degrees === 270;
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  // Fotos pequenas (comuns em prints e NFC-e) têm letras muito baixas para o
  // Tesseract. Aumentar até 1200 px de largura melhora a leitura sem estourar
  // o limite de 3000 px do lado maior.
  const scale = Math.min(
    MAX_DIMENSION / longestSide,
    Math.max(1, 1200 / image.naturalWidth),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = swap ? height : width;
  canvas.height = swap ? width : height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não conseguimos preparar a foto.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);

  // Escala de cinza com alongamento de contraste. Ajuda em fotos de celular
  // com sombra sem apagar o texto do cupom.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const histogram = new Uint32Array(256);

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
    histogram[gray] += 1;
  }

  const totalPixels = data.length / 4;
  const lowTarget = totalPixels * 0.02;
  const highTarget = totalPixels * 0.98;
  let low = 0;
  let high = 255;
  let accumulated = 0;
  for (let value = 0; value < 256; value += 1) {
    accumulated += histogram[value];
    if (accumulated >= lowTarget) {
      low = value;
      break;
    }
  }
  accumulated = 0;
  for (let value = 255; value >= 0; value -= 1) {
    accumulated += histogram[value];
    if (accumulated >= totalPixels - highTarget) {
      high = value;
      break;
    }
  }
  const range = Math.max(16, high - low);
  // Em imagens já nítidas (prints e NFC-e) o contraste extra pode apagar
  // detalhes finos, como a vírgula de "4,28". Só reforça quando a foto é
  // lavada ou tem sombra.
  const contrast = range >= 200 ? 1 : 1.12;
  const lut = new Uint8ClampedArray(256);
  for (let value = 0; value < 256; value += 1) {
    const stretched = ((value - low) * 255) / range;
    lut[value] = (stretched - 128) * contrast + 128;
  }

  for (let index = 0; index < data.length; index += 4) {
    const value = lut[data[index]];
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0);

  return canvas;
}

function parseReceiptText(text: string, ocrConfidence: number): ReceiptDraft {
  const lines = text
    .split(/\r?\n|\f/)
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const supplierName = findSupplier(lines);
  const cnpj = findCnpj(text);
  const date = findDate(lines);
  const totalCents = findTotal(lines);
  const paymentMethod = findPayment(text);
  const parsedItems = parseItems(lines);

  const items: ReceiptItemDraft[] = parsedItems.map((item) => {
    const unitCostCents = Math.max(
      1,
      Math.round(item.totalCents / Math.max(1, item.quantity)),
    );
    return {
      name: item.name,
      quantity: item.quantity,
      unitCostCents,
      totalCents: unitCostCents * item.quantity,
    };
  });

  const normalized = normalizeText(text);
  const saleSignal =
    /comprovante|recebido|recebemos|transferencia recebida|pix recebido|valor recebido|pagamento recebido/.test(
      normalized,
    );
  const purchaseSignal =
    /cupom fiscal|nota fiscal|cnpj|fornecedor|mercadoria|total a pagar/.test(
      normalized,
    );
  const kind: "purchase" | "sale" =
    saleSignal && !purchaseSignal ? "sale" : "purchase";

  const warnings: string[] = [];
  if (!totalCents) warnings.push("Não achamos o valor total. Confira o campo.");
  if (items.length === 0) {
    warnings.push("Não achamos os itens. Preencha o nome do que foi comprado.");
  }
  if (!supplierName) warnings.push("Não achamos o fornecedor na foto.");
  if (text.trim().length < 24) {
    warnings.push("Saiu pouco texto. Tente uma foto mais reta e com mais luz.");
  }
  if (items.length > 0 && totalCents) {
    const sum = items.reduce((acc, item) => acc + item.totalCents, 0);
    // Tolerância de R$ 1,00 (ou 0,5% em notas grandes). Acima disso é mais
    // provável que um item tenha sido lido errado do que arredondamento.
    if (Math.abs(sum - totalCents) > Math.max(100, totalCents * 0.005)) {
      warnings.push(
        "A soma dos itens ficou diferente do total da nota. Confira antes de salvar.",
      );
    }
  }

  let score = 0.2;
  if (totalCents) score += 0.25;
  if (items.length > 0) score += 0.2;
  if (supplierName) score += 0.15;
  if (cnpj) score += 0.05;
  if (date) score += 0.05;
  if (paymentMethod) score += 0.05;
  // Cada aviso é um motivo concreto para desconfiar. Sem isso, uma nota com
  // item mal lido ainda apareceria como "Leitura boa".
  score -= warnings.length * 0.12;

  const vision = Math.max(0, Math.min(1, ocrConfidence / 100));
  let confidence = Math.min(
    0.98,
    Math.round((score * 0.7 + vision * 0.3) * 100) / 100,
  );
  if (warnings.length > 0) confidence = Math.min(confidence, 0.68);

  return {
    kind,
    supplierName,
    cnpj,
    date,
    totalCents,
    paymentMethod,
    items,
    rawText: text.trim(),
    confidence,
    warnings,
  };
}

async function decodeQrCode(
  canvas: HTMLCanvasElement,
): Promise<string | undefined> {
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import("jsqr");
    const result = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });
    return result?.data?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function readReceiptPhoto(
  file: File,
  options: ReadReceiptOptions = {},
): Promise<ReceiptDraft> {
  const { rotation = 0, signal, onProgress } = options;
  onProgress?.({ progress: 0.02, status: "Preparando a foto" });

  const canvas = await prepareCanvas(file, rotation);
  if (signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");

  const qrCode = await decodeQrCode(canvas);
  if (signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");

  onProgress?.({ progress: 0.08, status: "Carregando o leitor" });

  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("por", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract",
    logger: (message) => {
      const status = describeStatus(message.status);
      let progress = 0.08;
      if (message.status === "recognizing text") {
        progress = 0.55 + message.progress * 0.4;
      } else if (message.status === "loading language traineddata") {
        progress = 0.15 + message.progress * 0.2;
      } else if (message.status === "initializing api") {
        progress = 0.45;
      }
      onProgress?.({ progress: Math.min(0.98, progress), status });
    },
  });

  const abort = () => {
    void worker.terminate();
  };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    if (signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");
    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.SINGLE_COLUMN,
      preserve_interword_spaces: "1",
    });
    const result = await worker.recognize(canvas);
    if (signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");

    onProgress?.({ progress: 0.99, status: "Organizando os dados" });
    const draft = parseReceiptText(
      result.data.text ?? "",
      result.data.confidence ?? 0,
    );
    onProgress?.({ progress: 1, status: "Pronto" });
    return { ...draft, qrCode };
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException("Leitura cancelada.", "AbortError");
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => undefined);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
