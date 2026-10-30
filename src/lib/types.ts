export type SegmentId = "confeitaria" | "barbearia" | "roupas";

export type SourceType =
  | "manual"
  | "audio_transcription"
  | "image_recognition"
  | "whatsapp_import";

export type ProcessingStatus = "processed" | "pending_review";

export type TransactionKind = "sale" | "expense";

export type PaymentMethod = "pix" | "cash" | "card" | "other";

export type InventoryDirection = "in" | "out" | "adjustment";

export interface Product {
  id: string;
  name: string;
  unit: string;
  unitPlural: string;
  stock: number;
  minStock: number;
  costCents: number;
  priceCents: number;
  trackStock: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  description: string;
  amountCents: number;
  quantity?: number;
  productId?: string;
  paymentMethod?: PaymentMethod;
  sourceType: SourceType;
  status: ProcessingStatus;
  rawInput?: string;
  aiConfidence?: number;
  occurredAt: string;
  createdAt: string;
  reviewedAt?: string;
  inventoryLogId?: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  direction: InventoryDirection;
  quantity: number;
  unitCostCents?: number;
  transactionId?: string;
  sourceType: SourceType;
  status: ProcessingStatus;
  occurredAt: string;
}

export interface Business {
  id: string;
  name: string;
  ownerName: string;
  city: string;
  segment: SegmentId;
}

export interface DemoState {
  version: 2;
  segmentId: SegmentId;
  products: Product[];
  transactions: Transaction[];
  inventoryLogs: InventoryLog[];
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  manual: "Registrado por você",
  audio_transcription: "Veio de um áudio",
  image_recognition: "Veio de uma foto",
  whatsapp_import: "Veio do WhatsApp",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  other: "Outro",
};
