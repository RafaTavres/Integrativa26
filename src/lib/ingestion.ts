import type {
  PaymentMethod,
  SourceType,
  TransactionKind,
} from "./types";
import { parseNfeXml, nfeXmlToImportRows } from "./nfe-xml";
import type { ImportRow } from "./import";

/**
 * Contrato único para tudo que vai entrar por fora da interface:
 * WhatsApp, e-mail de fornecedor (XML), QR Code/SEFAZ e planilhas.
 *
 * O webapp já sabe transformar este envelope em um rascunho revisável. Os
 * conectores externos (Edge Function do Supabase, worker de e-mail, bot do
 * WhatsApp) só precisam gravar em `ingestion_events` com este formato.
 */
export type IngestionChannel =
  | "whatsapp"
  | "email"
  | "qrcode"
  | "spreadsheet"
  | "audio"
  | "image"
  | "manual";

export interface IngestionEnvelope {
  businessId: string;
  channel: IngestionChannel;
  sourceType: SourceType;
  /** ID do provedor (message id, e-mail id, chave da NF-e…). Evita duplicar. */
  externalId?: string;
  receivedAt?: string;
  rawInput?: string;
  mediaPath?: string;
  aiConfidence?: number;
  payload?: Record<string, unknown>;
}

export interface IngestionDraft {
  kind: TransactionKind;
  description: string;
  amountCents: number;
  occurredAt: string;
  paymentMethod?: PaymentMethod;
  productName?: string;
  quantity?: number;
  supplierName?: string;
  dueDate?: string;
  externalId?: string;
  confidence?: number;
  needsReview: boolean;
}

const CHANNEL_SOURCE: Record<IngestionChannel, SourceType> = {
  whatsapp: "whatsapp_import",
  email: "email_import",
  qrcode: "qr_code",
  spreadsheet: "spreadsheet_import",
  audio: "audio_transcription",
  image: "image_recognition",
  manual: "manual",
};

export function sourceTypeForChannel(
  channel: IngestionChannel,
): SourceType {
  return CHANNEL_SOURCE[channel];
}

function readString(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function readNumber(
  payload: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/**
 * Normaliza o resultado de OCR/transcrição/parser fiscal em algo que a tela
 * consegue revisar. Valores monetários podem chegar em reais ou centavos;
 * `amountCents` tem prioridade.
 */
export function draftFromPayload(
  envelope: IngestionEnvelope,
): IngestionDraft | null {
  const payload = envelope.payload ?? {};
  const amountCents =
    readNumber(payload, ["amountCents", "amount_cents", "totalCents"]) ??
    (() => {
      const reais = readNumber(payload, ["amount", "total", "valor"]);
      return reais === undefined ? undefined : Math.round(reais * 100);
    })();

  if (!amountCents || amountCents < 1) return null;

  const rawKind = readString(payload, ["kind", "tipo", "type"])?.toLowerCase();
  const kind: TransactionKind =
    rawKind === "sale" ||
    rawKind === "venda" ||
    rawKind === "entrada" ||
    rawKind === "receita"
      ? "sale"
      : rawKind === "withdrawal" ||
          rawKind === "retirada" ||
          rawKind === "saque"
        ? "withdrawal"
        : "expense";

  const confidence =
    readNumber(payload, ["confidence", "aiConfidence", "ai_confidence"]) ??
    envelope.aiConfidence;
  const description =
    readString(payload, [
      "description",
      "descricao",
      "productName",
      "product_name",
      "item",
    ]) ?? "Registro importado";

  return {
    kind,
    description,
    amountCents,
    occurredAt:
      readString(payload, ["occurredAt", "occurred_at", "date", "data"]) ??
      envelope.receivedAt ??
      new Date().toISOString(),
    paymentMethod: readString(payload, [
      "paymentMethod",
      "payment_method",
      "pagamento",
    ]) as PaymentMethod | undefined,
    productName: readString(payload, [
      "productName",
      "product_name",
      "produto",
    ]),
    quantity: readNumber(payload, ["quantity", "quantidade", "qtd"]),
    supplierName: readString(payload, [
      "supplierName",
      "supplier_name",
      "fornecedor",
    ]),
    dueDate: readString(payload, [
      "dueDate",
      "due_date",
      "vencimento",
    ]),
    externalId: envelope.externalId,
    confidence,
    needsReview: confidence === undefined || confidence < 0.9,
  };
}

export interface PendingEmailImport {
  id: string;
  createdAt: string;
  from?: string;
  subject?: string;
  supplierName?: string;
  totalCents?: number;
  itemCount: number;
  rows: ImportRow[];
}

interface IngestionEventRow {
  id: string;
  created_at: string;
  raw_input?: string | null;
  extracted_payload?: unknown;
}

/**
 * O worker de e-mail guarda o XML bruto em `extracted_payload.xml`. A tela
 * refaz o parsing no cliente, em vez de confiar em linhas serializadas no
 * banco. Assim a prévia usa exatamente o mesmo parser da importação manual.
 */
export function pendingEmailImportFromEvent(
  row: IngestionEventRow,
): PendingEmailImport | null {
  const payload =
    row.extracted_payload && typeof row.extracted_payload === "object"
      ? (row.extracted_payload as Record<string, unknown>)
      : null;
  if (!payload) return null;
  const xml = payload.xml;
  if (typeof xml !== "string" || !xml.trim()) return null;

  const data = parseNfeXml(xml);
  if (!data) return null;

  return {
    id: row.id,
    createdAt: row.created_at,
    from: typeof payload.from === "string" ? payload.from : undefined,
    subject: typeof payload.subject === "string" ? payload.subject : undefined,
    supplierName: data.supplierName,
    totalCents: data.totalCents,
    itemCount: data.items.length,
    rows: nfeXmlToImportRows(data),
  };
}

export const INGESTION_CONTRACT = {
  version: 1,
  table: "public.ingestion_events",
  channels: Object.keys(CHANNEL_SOURCE),
  sourceTypes: Object.values(CHANNEL_SOURCE),
  required: ["businessId", "channel", "sourceType", "payload.amount"],
  recommended: [
    "externalId",
    "payload.kind",
    "payload.description",
    "payload.date",
    "payload.supplierName",
    "payload.productName",
    "payload.quantity",
    "payload.dueDate",
    "aiConfidence",
  ],
  notes: [
    "externalId + channel formam a chave de idempotência por negócio.",
    "O conector externo roda no servidor (Edge Function) e grava o evento bruto.",
    "O webapp consome o evento, cria o rascunho e preserva raw_input e ai_confidence.",
    "Nenhuma chave service_role é usada no navegador.",
  ],
} as const;
