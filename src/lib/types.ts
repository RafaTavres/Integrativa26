export type SegmentId = "confeitaria" | "barbearia" | "roupas";

export type SourceType =
  | "manual"
  | "audio_transcription"
  | "image_recognition"
  | "whatsapp_import"
  | "email_import"
  | "qr_code"
  | "spreadsheet_import";

export type ProcessingStatus = "processed" | "pending_review";

/**
 * `withdrawal` é dinheiro que o dono tira do negócio. Não é gasto: não tem
 * fornecedor, não gera conta a pagar e não entra na análise de despesas.
 * Mesmo assim sai do caixa, então entra no "Saiu".
 */
export type TransactionKind = "sale" | "expense" | "withdrawal";

export type PaymentMethod = "pix" | "cash" | "card" | "other";

export type InventoryDirection = "in" | "out" | "adjustment";

export type BillStatus = "open" | "paid" | "canceled";

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
  /** Fornecedor preferido, atualizado na última compra. */
  supplierId?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Compra de mercadoria. Serve de histórico de preço: cada compra guarda
 * quanto custou a unidade naquele fornecedor e naquela data.
 */
export interface Purchase {
  id: string;
  supplierId?: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitCostCents: number;
  totalCents: number;
  billId?: string;
  transactionId?: string;
  inventoryLogId?: string;
  sourceType: SourceType;
  occurredAt: string;
  createdAt: string;
}

/** Conta a pagar (boleto, carnê, compra a prazo, aluguel…). */
export interface Bill {
  id: string;
  supplierId?: string;
  description: string;
  amountCents: number;
  /** Data pura, no formato YYYY-MM-DD. */
  dueDate: string;
  status: BillStatus;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  sourceType: SourceType;
  createdAt: string;
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  description: string;
  amountCents: number;
  quantity?: number;
  productId?: string;
  supplierId?: string;
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
  demoSeeded?: boolean;
}

export interface DemoState {
  version: 3;
  segmentId: SegmentId;
  products: Product[];
  transactions: Transaction[];
  inventoryLogs: InventoryLog[];
  suppliers: Supplier[];
  purchases: Purchase[];
  bills: Bill[];
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  manual: "Registrado por você",
  audio_transcription: "Veio de um áudio",
  image_recognition: "Veio de uma foto",
  whatsapp_import: "Veio do WhatsApp",
  email_import: "Veio de um e-mail",
  qr_code: "Veio do QR Code da nota",
  spreadsheet_import: "Veio de uma planilha",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  other: "Outro",
};

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  sale: "Venda",
  expense: "Gasto",
  withdrawal: "Retirada",
};
