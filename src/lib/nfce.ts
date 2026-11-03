export interface NfceItem {
  name: string;
  quantity: number;
  unit?: string;
  unitCostCents: number;
  totalCents: number;
}

export interface NfceData {
  url: string;
  key?: string;
  supplierName?: string;
  cnpj?: string;
  date?: string;
  totalCents?: number;
  paymentMethod?: string;
  items: NfceItem[];
}

/**
 * Só consulta portais fiscais oficiais. A lista é propositalmente restrita
 * para o servidor não virar um proxy para qualquer endereço (SSRF).
 */
export function isAllowedNfceUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(".gov.br")) return false;
  return /(nfce|nfe|fazenda|faz|sefaz|sef|sefin|sefa|receita|dfe)/.test(host);
}

/**
 * O QR Code da NFC-e carrega uma URL do portal da SEFAZ. A chave de acesso
 * costuma ser o primeiro campo do parâmetro `p`, mas também procuramos 44
 * dígitos no texto por segurança.
 */
export function parseNfceQrCode(
  raw: string,
): { url: string; key?: string } | null {
  const text = raw.trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!isAllowedNfceUrl(url)) return null;

  let key: string | undefined;
  const p = url.searchParams.get("p");
  if (p) {
    const candidate = p.split("|")[0].replace(/\D/g, "");
    if (candidate.length === 44) key = candidate;
  }
  if (!key) {
    const match = text.replace(/\D/g, "").match(/\d{44}/);
    if (match) key = match[0];
  }

  return { url: url.toString(), key };
}

export function parseDecimal(value: string): number | undefined {
  const cleaned = value.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return undefined;

  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMoneyCents(value: string): number | undefined {
  const parsed = parseDecimal(value);
  if (parsed === undefined) return undefined;
  const cents = Math.round(parsed * 100);
  return cents > 0 ? cents : undefined;
}

export function normalizeNfceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
