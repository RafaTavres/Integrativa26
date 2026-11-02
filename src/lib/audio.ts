import type { PaymentMethod, Product } from "./types";

/**
 * Interpreta a transcrição de um áudio curto em um rascunho de venda.
 *
 * O navegador entrega texto livre ("vendi dois bolos de cenoura por cem reais
 * no pix"). Aqui extraímos o que dá para extrair com segurança e deixamos o
 * resto para a revisão na tela. Nada é salvo sem confirmação.
 */

export interface AudioParseResult {
  productId?: string;
  productName?: string;
  quantity: number;
  amountCents?: number;
  paymentMethod?: PaymentMethod;
  /** 0–1. Serve para sinalizar que o rascunho precisa de revisão. */
  confidence: number;
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
  mil: 1000,
};

const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).join("|");
const AMOUNT_WORDS = new RegExp(
  `\\b((?:(?:${NUMBER_WORD_PATTERN})\\s+(?:e\\s+)?){1,4})(?:reais?|real)\\b`,
  "i",
);

const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "para",
  "sem",
  "por",
  "the",
]);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericMoney(raw: string): number | undefined {
  const cleaned = raw.trim();
  if (!cleaned) return undefined;

  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    // 1.200 e 12.000 são milhares no padrão brasileiro.
    normalized = cleaned.replace(/\./g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseWordMoney(raw: string): number | undefined {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((token) => token && token !== "e");
  if (tokens.length === 0) return undefined;

  let total = 0;
  for (const token of tokens) {
    const value = NUMBER_WORDS[token];
    if (value === undefined) return undefined;
    total += value;
  }
  return total > 0 ? total : undefined;
}

function findAmount(text: string): { cents: number; matched: string } | undefined {
  const currency = /r\$\s*([\d.]+(?:,\d{1,2})?)/i.exec(text);
  if (currency) {
    const value = parseNumericMoney(currency[1]);
    if (value !== undefined) {
      return { cents: Math.round(value * 100), matched: currency[0] };
    }
  }

  const numeric = /([\d.]+(?:,\d{1,2})?)\s*(?:reais?|real)\b/i.exec(text);
  if (numeric) {
    const value = parseNumericMoney(numeric[1]);
    if (value !== undefined) {
      return { cents: Math.round(value * 100), matched: numeric[0] };
    }
  }

  const words = AMOUNT_WORDS.exec(text);
  if (words) {
    const value = parseWordMoney(words[1]);
    if (value !== undefined) {
      return { cents: Math.round(value * 100), matched: words[0] };
    }
  }

  return undefined;
}

function findQuantity(text: string, amountText?: string): number {
  const rest = amountText ? text.replace(amountText, " ") : text;

  const explicit =
    /(\d{1,2})\s*(?:x|un|unidades?|itens?|pecas?)\b/i.exec(rest) ??
    /\b(?:vendi|atendi|fiz|foram|foi|sao)\s+(\d{1,2})\b/i.exec(rest) ??
    /(\d{1,2})\s+(?=[a-z])/i.exec(rest);

  if (explicit) {
    const value = Number(explicit[1]);
    if (value >= 1 && value <= 99) return value;
  }

  const words = new RegExp(
    `\\b(${NUMBER_WORD_PATTERN})\\s+(?=[a-z])`,
    "i",
  ).exec(rest);
  if (words) {
    const value = NUMBER_WORDS[words[1].toLowerCase()];
    if (value >= 2 && value <= 20) return value;
  }

  return 1;
}

function productTokens(name: string): string[] {
  return normalize(name)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function matchProduct(text: string, products: Product[]): Product | undefined {
  let best: { product: Product; score: number } | undefined;

  for (const product of products) {
    const name = normalize(product.name);
    if (!name) continue;

    let score = 0;
    if (text.includes(name)) {
      score = 1000 + name.length;
    } else {
      const tokens = productTokens(product.name);
      if (tokens.length === 0) continue;

      const matched = tokens.filter(
        (token) => text.includes(token) || text.includes(token.replace(/s$/, "")),
      ).length;
      if (matched === 0 || matched < Math.ceil(tokens.length / 2)) continue;
      score = matched * 100 + tokens.length;
    }

    if (!best || score > best.score) best = { product, score };
  }

  return best?.product;
}

function findPayment(text: string): PaymentMethod | undefined {
  if (/\bpix\b/.test(text)) return "pix";
  if (/\bcartao\b|\bcredito\b|\bdebito\b|\bmaquininha\b|\bparcelad/.test(text)) {
    return "card";
  }
  if (/\bdinheiro\b|\bespecie\b|\bcedula\b/.test(text)) return "cash";
  return undefined;
}

export function parseAudioTranscript(
  transcript: string,
  products: Product[],
): AudioParseResult {
  const text = normalize(transcript);
  if (!text) {
    return { quantity: 1, confidence: 0 };
  }

  const amount = findAmount(text);
  const quantity = findQuantity(text, amount?.matched);
  const product = matchProduct(text, products);
  const paymentMethod = findPayment(text);

  let confidence = 0.35;
  if (amount) confidence += 0.25;
  if (product) confidence += 0.2;
  if (quantity > 1) confidence += 0.1;
  if (paymentMethod) confidence += 0.1;

  return {
    productId: product?.id,
    productName: product?.name,
    quantity,
    amountCents: amount?.cents,
    paymentMethod,
    confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
  };
}

export function formatAudioDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
