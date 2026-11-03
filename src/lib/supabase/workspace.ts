"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SEGMENTS, isSegmentId } from "../segments";
import type { ImportRow, ImportSummary } from "../import";
import {
  pendingEmailImportFromEvent,
  type PendingEmailImport,
} from "../ingestion";
import type {
  Bill,
  Business,
  DemoState,
  InventoryLog,
  PaymentMethod,
  Product,
  Purchase,
  SegmentId,
  SourceType,
  Supplier,
  Transaction,
} from "../types";

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export type CloudAuthFailure = "anonymous_disabled" | "network" | "unknown";

export class CloudError extends Error {
  readonly code?: string;
  readonly authFailure?: CloudAuthFailure;

  constructor(
    message: string,
    options: { code?: string; authFailure?: CloudAuthFailure } = {},
  ) {
    super(message);
    this.name = "CloudError";
    this.code = options.code;
    this.authFailure = options.authFailure;
  }
}

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

const FRIENDLY_BY_CODE: Record<string, string> = {
  "23505": "Já existe um item com esse nome.",
  "42501": "Sua sessão expirou. Recarregue a página para entrar de novo.",
  PGRST116: "Não encontramos o registro.",
};

function toCloudError(error: PostgrestLikeError, fallback: string): CloudError {
  if (error.code && FRIENDLY_BY_CODE[error.code]) {
    return new CloudError(FRIENDLY_BY_CODE[error.code], { code: error.code });
  }

  const message = error.message?.trim();
  if (!message) return new CloudError(fallback, { code: error.code });

  // Mensagens levantadas pelas RPCs já estão em português e são amigáveis.
  const looksHuman = /[áàâãéêíóôõúç]/i.test(message);
  return new CloudError(looksHuman ? message : fallback, {
    code: error.code,
  });
}

function optionalText(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Linhas do banco
// ---------------------------------------------------------------------------

interface BusinessRow {
  id: string;
  name: string;
  owner_name: string;
  city: string | null;
  segment: string;
  demo_seeded?: boolean | null;
}

interface ProductRow {
  id: string;
  name: string;
  unit: string;
  unit_plural: string;
  stock: number | string;
  min_stock: number | string;
  cost_cents: number;
  price_cents: number;
  track_stock: boolean;
  supplier_id: string | null;
  created_at: string;
}

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

interface TransactionRow {
  id: string;
  kind: Transaction["kind"];
  description: string;
  amount_cents: number;
  quantity: number | string | null;
  product_id: string | null;
  supplier_id: string | null;
  payment_method: PaymentMethod | null;
  source_type: SourceType;
  status: Transaction["status"];
  raw_input: string | null;
  ai_confidence: number | string | null;
  occurred_at: string;
  created_at: string;
  reviewed_at: string | null;
}

interface InventoryLogRow {
  id: string;
  product_id: string;
  direction: InventoryLog["direction"];
  quantity: number | string;
  unit_cost_cents: number | null;
  transaction_id: string | null;
  source_type: SourceType;
  status: InventoryLog["status"];
  occurred_at: string;
}

interface BillRow {
  id: string;
  supplier_id: string | null;
  description: string;
  amount_cents: number;
  due_date: string;
  status: Bill["status"];
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  transaction_id: string | null;
  source_type: SourceType;
  created_at: string;
}

interface PurchaseRow {
  id: string;
  supplier_id: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number | string;
  unit_cost_cents: number;
  total_cents: number;
  bill_id: string | null;
  transaction_id: string | null;
  inventory_log_id: string | null;
  source_type: SourceType;
  occurred_at: string;
  created_at: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name:
      row.id === LOJA_WHATSAPP_ID
        ? "Loja de roupas (WhatsApp)"
        : row.name,
    ownerName: row.owner_name,
    city: row.city ?? "",
    segment: isSegmentId(row.segment) ? row.segment : "confeitaria",
    demoSeeded: row.demo_seeded === true,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    unitPlural: row.unit_plural,
    stock: toNumber(row.stock),
    minStock: toNumber(row.min_stock),
    costCents: toNumber(row.cost_cents),
    priceCents: toNumber(row.price_cents),
    trackStock: row.track_stock !== false,
    supplierId: row.supplier_id ?? undefined,
    createdAt: row.created_at,
  };
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function mapTransaction(
  row: TransactionRow,
  logIdByTransaction: Map<string, string>,
): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    amountCents: toNumber(row.amount_cents),
    quantity: row.quantity === null ? undefined : toNumber(row.quantity),
    productId: row.product_id ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    sourceType: row.source_type,
    status: row.status,
    rawInput: row.raw_input ?? undefined,
    aiConfidence:
      row.ai_confidence === null ? undefined : toNumber(row.ai_confidence),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? undefined,
    inventoryLogId: logIdByTransaction.get(row.id),
  };
}

function mapInventoryLog(row: InventoryLogRow): InventoryLog {
  return {
    id: row.id,
    productId: row.product_id,
    direction: row.direction,
    quantity: toNumber(row.quantity),
    unitCostCents:
      row.unit_cost_cents === null ? undefined : toNumber(row.unit_cost_cents),
    transactionId: row.transaction_id ?? undefined,
    sourceType: row.source_type,
    status: row.status,
    occurredAt: row.occurred_at,
  };
}

function mapBill(row: BillRow): Bill {
  return {
    id: row.id,
    supplierId: row.supplier_id ?? undefined,
    description: row.description,
    amountCents: toNumber(row.amount_cents),
    dueDate: row.due_date,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    transactionId: row.transaction_id ?? undefined,
    sourceType: row.source_type,
    createdAt: row.created_at,
  };
}

function mapPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    supplierId: row.supplier_id ?? undefined,
    productId: row.product_id ?? undefined,
    productName: row.product_name,
    quantity: toNumber(row.quantity),
    unitCostCents: toNumber(row.unit_cost_cents),
    totalCents: toNumber(row.total_cents),
    billId: row.bill_id ?? undefined,
    transactionId: row.transaction_id ?? undefined,
    inventoryLogId: row.inventory_log_id ?? undefined,
    sourceType: row.source_type,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

function isAnonymousDisabled(message: string): boolean {
  return /anonymous\s+sign[- ]?ins?\s+(are\s+)?disabled/i.test(message);
}

export async function ensureAnonymousSession(
  client: SupabaseClient,
): Promise<void> {
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    throw new CloudError("Não conseguimos ler a sessão salva.", {
      authFailure: "unknown",
    });
  }
  if (sessionData.session?.user) return;

  const { error } = await client.auth.signInAnonymously();
  if (!error) return;

  const message = error.message ?? "";
  if (isAnonymousDisabled(message) || error.status === 422) {
    throw new CloudError(
      "O login anônimo está desativado no projeto Supabase.",
      { authFailure: "anonymous_disabled" },
    );
  }

  if (error.status === 0 || /fetch|network/i.test(message)) {
    throw new CloudError("Sem conexão com o Supabase.", {
      authFailure: "network",
    });
  }

  throw new CloudError(`Não conseguimos entrar: ${message}`, {
    authFailure: "unknown",
  });
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface Workspace {
  business: Business;
  state: DemoState;
}

async function findBusinessId(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client
    .from("memberships")
    .select("business_id, created_at")
    .neq("business_id", LOJA_WHATSAPP_ID)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw toCloudError(error, "Não conseguimos abrir seu negócio.");
  const row = (data as Array<{ business_id: string }> | null)?.[0];
  return row?.business_id ?? null;
}

export async function loadWorkspace(
  client: SupabaseClient,
  businessId: string,
): Promise<Workspace> {
  const [
    businessResult,
    productsResult,
    transactionsResult,
    logsResult,
    suppliersResult,
    purchasesResult,
    billsResult,
  ] = await Promise.all([
    client
      .from("businesses")
      .select("id, name, owner_name, city, segment, demo_seeded")
      .eq("id", businessId)
      .maybeSingle(),
    client
      .from("products")
      .select(
        "id, name, unit, unit_plural, stock, min_stock, cost_cents, price_cents, track_stock, supplier_id, created_at",
      )
      .eq("business_id", businessId)
      .order("name", { ascending: true }),
    client
      .from("transactions")
      .select(
        "id, kind, description, amount_cents, quantity, product_id, supplier_id, payment_method, source_type, status, raw_input, ai_confidence, occurred_at, created_at, reviewed_at",
      )
      .eq("business_id", businessId)
      .order("occurred_at", { ascending: false }),
    client
      .from("inventory_logs")
      .select(
        "id, product_id, direction, quantity, unit_cost_cents, transaction_id, source_type, status, occurred_at",
      )
      .eq("business_id", businessId)
      .order("occurred_at", { ascending: false }),
    client
      .from("suppliers")
      .select("id, name, phone, email, notes, created_at")
      .eq("business_id", businessId)
      .order("name", { ascending: true }),
    client
      .from("purchases")
      .select(
        "id, supplier_id, product_id, product_name, quantity, unit_cost_cents, total_cents, bill_id, transaction_id, inventory_log_id, source_type, occurred_at, created_at",
      )
      .eq("business_id", businessId)
      .order("occurred_at", { ascending: false }),
    client
      .from("bills")
      .select(
        "id, supplier_id, description, amount_cents, due_date, status, paid_at, payment_method, transaction_id, source_type, created_at",
      )
      .eq("business_id", businessId)
      .order("due_date", { ascending: true }),
  ]);

  if (businessResult.error) {
    throw toCloudError(businessResult.error, "Não conseguimos abrir seu negócio.");
  }
  if (!businessResult.data) {
    throw new CloudError("Seu negócio não foi encontrado.");
  }
  if (productsResult.error) {
    throw toCloudError(productsResult.error, "Não conseguimos carregar os itens.");
  }
  if (transactionsResult.error) {
    throw toCloudError(
      transactionsResult.error,
      "Não conseguimos carregar os lançamentos.",
    );
  }
  if (logsResult.error) {
    throw toCloudError(
      logsResult.error,
      "Não conseguimos carregar o histórico de estoque.",
    );
  }
  if (suppliersResult.error) {
    throw toCloudError(
      suppliersResult.error,
      "Não conseguimos carregar os fornecedores.",
    );
  }
  if (purchasesResult.error) {
    throw toCloudError(
      purchasesResult.error,
      "Não conseguimos carregar as compras.",
    );
  }
  if (billsResult.error) {
    throw toCloudError(
      billsResult.error,
      "Não conseguimos carregar as contas a pagar.",
    );
  }

  const business = mapBusiness(businessResult.data as BusinessRow);
  const logs = ((logsResult.data ?? []) as InventoryLogRow[]).map(
    mapInventoryLog,
  );

  const logIdByTransaction = new Map<string, string>();
  for (const log of logs) {
    if (log.transactionId) logIdByTransaction.set(log.transactionId, log.id);
  }

  return {
    business,
    state: {
      version: 3,
      segmentId: business.segment,
      products: ((productsResult.data ?? []) as ProductRow[]).map(mapProduct),
      transactions: ((transactionsResult.data ?? []) as TransactionRow[]).map(
        (row) => mapTransaction(row, logIdByTransaction),
      ),
      inventoryLogs: logs,
      suppliers: ((suppliersResult.data ?? []) as SupplierRow[]).map(
        mapSupplier,
      ),
      purchases: ((purchasesResult.data ?? []) as PurchaseRow[]).map(
        mapPurchase,
      ),
      bills: ((billsResult.data ?? []) as BillRow[]).map(mapBill),
    },
  };
}

// ---------------------------------------------------------------------------
// Dados de exemplo
// ---------------------------------------------------------------------------

function at(dayOffset: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function dateOnly(dayOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function seedWorkspace(
  client: SupabaseClient,
  businessId: string,
  segmentId: SegmentId,
  includeSampleTransactions: boolean,
): Promise<void> {
  const segment = SEGMENTS[segmentId];

  const { data: existingProducts, error: existingError } = await client
    .from("products")
    .select("id, name")
    .eq("business_id", businessId);
  if (existingError) {
    throw toCloudError(existingError, "Não conseguimos preparar os itens.");
  }

  const existingNames = new Set(
    ((existingProducts ?? []) as Array<{ name: string }>).map((row) =>
      row.name.trim().toLowerCase(),
    ),
  );

  const missing = segment.products.filter(
    (product) => !existingNames.has(product.name.trim().toLowerCase()),
  );

  if (missing.length > 0) {
    const { error } = await client.from("products").insert(
      missing.map((product) => ({
        business_id: businessId,
        name: product.name,
        unit: product.unit,
        unit_plural: product.unitPlural,
        stock: product.stock,
        min_stock: product.minStock,
        cost_cents: product.costCents,
        price_cents: product.priceCents,
        track_stock: product.trackStock,
        // O item de exemplo já existia antes do histórico, igual ao modo local.
        // Sem isso, o estoque parado nunca apareceria no primeiro acesso à nuvem.
        created_at: at(90, 8, 0),
      })),
    );
    if (error) {
      throw toCloudError(error, "Não conseguimos preparar os itens.");
    }
  }

  if (!includeSampleTransactions) return;

  const { count, error: countError } = await client
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (countError) {
    throw toCloudError(countError, "Não conseguimos preparar os exemplos.");
  }
  if ((count ?? 0) > 0) return;

  const { data: productRows, error: productError } = await client
    .from("products")
    .select("id, name")
    .eq("business_id", businessId);
  if (productError) {
    throw toCloudError(productError, "Não conseguimos preparar os exemplos.");
  }

  const productIdByName = new Map(
    ((productRows ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.name.trim().toLowerCase(),
      row.id,
    ]),
  );

  const productIdByKey = new Map<string, string>();
  for (const seed of segment.products) {
    const id = productIdByName.get(seed.name.trim().toLowerCase());
    if (id) productIdByKey.set(seed.key, id);
  }

  // -------------------------------------------------------------------------
  // Fornecedores
  // -------------------------------------------------------------------------
  const supplierIdByKey = new Map<string, string>();

  for (const supplier of segment.suppliers) {
    const { data, error } = await client
      .from("suppliers")
      .insert({
        business_id: businessId,
        name: supplier.name,
        phone: optionalText(supplier.phone),
        email: optionalText(supplier.email),
        notes: optionalText(supplier.notes),
      })
      .select("id")
      .single();
    if (error) {
      throw toCloudError(error, "Não conseguimos preparar os fornecedores.");
    }
    supplierIdByKey.set(supplier.key, (data as { id: string }).id);
  }

  // -------------------------------------------------------------------------
  // Contas a pagar de exemplo
  // -------------------------------------------------------------------------
  for (const bill of segment.bills) {
    const { error } = await client.from("bills").insert({
      business_id: businessId,
      supplier_id: bill.supplierKey
        ? (supplierIdByKey.get(bill.supplierKey) ?? null)
        : null,
      description: bill.description,
      amount_cents: bill.amountCents,
      due_date: dateOnly(bill.dueDayOffset),
      status: "open",
      payment_method: bill.paymentMethod ?? null,
      source_type: "manual",
    });
    if (error) {
      throw toCloudError(error, "Não conseguimos preparar as contas.");
    }
  }

  // -------------------------------------------------------------------------
  // Compras de exemplo (histórico de preço)
  // -------------------------------------------------------------------------
  for (const purchase of segment.purchases) {
    const productName = purchase.productName
      ? purchase.productName
      : (segment.products.find(
          (product) => product.key === purchase.productKey,
        )?.name ?? "Compra");
    const totalCents = Math.round(
      purchase.quantity * purchase.unitCostCents,
    );

    let billId: string | null = null;
    if (!purchase.paid) {
      const { data, error } = await client
        .from("bills")
        .insert({
          business_id: businessId,
          supplier_id: supplierIdByKey.get(purchase.supplierKey) ?? null,
          description: `Compra: ${productName}`,
          amount_cents: totalCents,
          due_date: dateOnly(purchase.dueDayOffset ?? 14),
          status: "open",
          payment_method: purchase.paymentMethod ?? null,
          source_type: "manual",
        })
        .select("id")
        .single();
      if (error) {
        throw toCloudError(error, "Não conseguimos preparar as compras.");
      }
      billId = (data as { id: string }).id;
    }

    const { error } = await client.from("purchases").insert({
      business_id: businessId,
      supplier_id: supplierIdByKey.get(purchase.supplierKey) ?? null,
      product_id: purchase.productKey
        ? (productIdByKey.get(purchase.productKey) ?? null)
        : null,
      product_name: productName,
      quantity: purchase.quantity,
      unit_cost_cents: purchase.unitCostCents,
      total_cents: totalCents,
      bill_id: billId,
      source_type: "manual",
      occurred_at: at(purchase.dayOffset, 10, 30),
    });
    if (error) {
      throw toCloudError(error, "Não conseguimos preparar as compras.");
    }
  }

  // -------------------------------------------------------------------------
  // Lançamentos de exemplo
  // -------------------------------------------------------------------------
  interface SeedTransactionRow {
    business_id: string;
    kind: Transaction["kind"];
    description: string;
    amount_cents: number;
    quantity: number | null;
    product_id: string | null;
    supplier_id: null;
    payment_method: PaymentMethod | null;
    source_type: SourceType;
    status: Transaction["status"];
    occurred_at: string;
  }

  const rows: SeedTransactionRow[] = segment.transactions.map((seed) => ({
    business_id: businessId,
    kind: seed.kind,
    description: seed.description,
    amount_cents: seed.amountCents,
    quantity: seed.quantity ?? null,
    product_id: seed.productKey
      ? (productIdByKey.get(seed.productKey) ?? null)
      : null,
    supplier_id: null,
    payment_method: seed.paymentMethod ?? null,
    source_type: "manual",
    status: "processed",
    occurred_at: at(seed.dayOffset, seed.hour, seed.minute),
  }));

  const pendingProductId = productIdByKey.get(segment.pending.productKey);
  if (pendingProductId) {
    rows.unshift({
      business_id: businessId,
      kind: "sale",
      description:
        segment.products.find(
          (product) => product.key === segment.pending.productKey,
        )?.name ?? "Venda",
      amount_cents: segment.pending.amountCents,
      quantity: segment.pending.quantity,
      product_id: pendingProductId,
      supplier_id: null,
      payment_method: null,
      source_type: "audio_transcription",
      status: "pending_review",
      occurred_at: at(0, 12, 47),
    });
  }

  if (rows.length === 0) return;

  const { error } = await client.from("transactions").insert(rows);
  if (error) {
    throw toCloudError(error, "Não conseguimos preparar os exemplos.");
  }
}

// ---------------------------------------------------------------------------
// Criação e troca de negócio
// ---------------------------------------------------------------------------

async function markDemoSeeded(
  client: SupabaseClient,
  businessId: string,
): Promise<void> {
  const { error } = await client
    .from("businesses")
    .update({ demo_seeded: true })
    .eq("id", businessId);
  if (error) {
    throw toCloudError(error, "Não conseguimos concluir a preparação dos exemplos.");
  }
}

export async function createWorkspace(
  client: SupabaseClient,
  segmentId: SegmentId,
): Promise<Workspace> {
  const segment = SEGMENTS[segmentId];
  const { data, error } = await client.rpc("create_business", {
    p_name: segment.businessName,
    p_owner_name: segment.ownerName,
    p_city: segment.city,
    p_segment: segmentId,
  });

  if (error) throw toCloudError(error, "Não conseguimos criar seu negócio.");
  const businessId = typeof data === "string" ? data : null;
  if (!businessId) {
    throw new CloudError("O Supabase não devolveu o negócio criado.");
  }

  await seedWorkspace(client, businessId, segmentId, true);
  await markDemoSeeded(client, businessId);
  return loadWorkspace(client, businessId);
}

/**
 * Abre o negócio do usuário. Se ainda não existir, cria já com os itens
 * e lançamentos de exemplo do ramo escolhido. O seed roda uma única vez:
 * itens apagados de propósito não voltam no próximo acesso.
 */
export async function openWorkspace(
  client: SupabaseClient,
  preferredSegment: SegmentId,
): Promise<Workspace> {
  const businessId = await findBusinessId(client);
  if (!businessId) return createWorkspace(client, preferredSegment);

  const workspace = await loadWorkspace(client, businessId);
  if (workspace.business.demoSeeded) return workspace;

  // Primeiro carregamento interrompido: completa o que faltou e marca.
  await seedWorkspace(client, businessId, workspace.business.segment, false);
  await markDemoSeeded(client, businessId);
  return loadWorkspace(client, businessId);
}

/**
 * Troca o ramo recomeçando os dados. A limpeza acontece em uma RPC
 * transacional, sem apagar o negócio/membership da pessoa.
 */
export async function replaceWorkspace(
  client: SupabaseClient,
  businessId: string,
  segmentId: SegmentId,
): Promise<Workspace> {
  const { error } = await client.rpc("reset_business", {
    p_business_id: businessId,
    p_segment: segmentId,
  });
  if (error) {
    throw toCloudError(
      error,
      "Não conseguimos recomeçar seu caixa. Atualize o schema do Supabase.",
    );
  }

  // Mantém a mesma identidade que a criação de um negócio novo teria.
  const segment = SEGMENTS[segmentId];
  const { error: identityError } = await client
    .from("businesses")
    .update({
      name: segment.businessName,
      owner_name: segment.ownerName,
      city: segment.city,
    })
    .eq("id", businessId);
  if (identityError) {
    throw toCloudError(identityError, "Não conseguimos atualizar o ramo.");
  }

  await seedWorkspace(client, businessId, segmentId, true);
  await markDemoSeeded(client, businessId);
  return loadWorkspace(client, businessId);
}

export const LOJA_WHATSAPP_ID = "1590b256-f558-4f64-9dac-525677f11c56";

export interface MovimentoWhatsapp {
  id: string;
  tipo: "venda" | "compra";
  produto: string;
  quantidade: number;
  totalCents: number;
  fornecedor: string | null;
  porAudio: boolean;
  criadoEm: string;
}

export interface OfertaFornecedor {
  id: string;
  fornecedor: string;
  produto: string;
  unidade: string | null;
  precoCents: number;
  promocao: boolean;
  validade: string | null;
  mensagem: string | null;
  criadoEm: string;
}

export interface DadosWhatsapp {
  movimentos: MovimentoWhatsapp[];
  ofertas: OfertaFornecedor[];
}

interface MovimentoWhatsappRow {
  id: string;
  created_at: string;
  product_name: string;
  quantity: number | string;
  amount_cents?: number;
  total_cents?: number;
  supplier_name: string | null;
  source: string;
}

interface OfertaFornecedorRow {
  id: string;
  created_at: string;
  supplier_name: string | null;
  product_name: string | null;
  unit: string | null;
  price_cents: number | null;
  is_promo: boolean | null;
  valid_until: string | null;
  raw_message: string | null;
}

function paraMovimento(
  row: MovimentoWhatsappRow,
  tipo: MovimentoWhatsapp["tipo"],
): MovimentoWhatsapp {
  return {
    id: row.id,
    tipo,
    produto: row.product_name,
    quantidade: Number(row.quantity),
    totalCents: row.amount_cents ?? row.total_cents ?? 0,
    fornecedor: row.supplier_name,
    porAudio: row.source === "audio",
    criadoEm: row.created_at,
  };
}

export async function abrirLojaWhatsapp(
  client: SupabaseClient,
): Promise<Workspace> {
  const { error } = await client.rpc("entrar_loja_whatsapp");
  if (error) {
    throw toCloudError(error, "Não conseguimos abrir a loja do WhatsApp.");
  }
  return loadWorkspace(client, LOJA_WHATSAPP_ID);
}

export async function carregarDadosWhatsapp(
  client: SupabaseClient,
  businessId: string,
): Promise<DadosWhatsapp> {
  const [vendas, compras, ofertas] = await Promise.all([
    client
      .from("n8n_whatsapp_transactions")
      .select("id, created_at, product_name, quantity, amount_cents, supplier_name, source")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("n8n_whatsapp_purchases")
      .select("id, created_at, product_name, quantity, total_cents, supplier_name, source")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("n8n_providers_group")
      .select("id, created_at, supplier_name, product_name, unit, price_cents, is_promo, valid_until, raw_message")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const erro = vendas.error ?? compras.error ?? ofertas.error;
  if (erro) throw toCloudError(erro, "Não conseguimos ler o que veio do WhatsApp.");

  const movimentos = [
    ...((vendas.data ?? []) as MovimentoWhatsappRow[]).map((row) =>
      paraMovimento(row, "venda"),
    ),
    ...((compras.data ?? []) as MovimentoWhatsappRow[]).map((row) =>
      paraMovimento(row, "compra"),
    ),
  ].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  const listaOfertas = ((ofertas.data ?? []) as OfertaFornecedorRow[])
    .filter((row) => row.product_name && (row.price_cents ?? 0) > 0)
    .map((row) => ({
      id: row.id,
      fornecedor: row.supplier_name?.trim() || "Fornecedor",
      produto: row.product_name!.trim(),
      unidade: row.unit,
      precoCents: row.price_cents ?? 0,
      promocao: row.is_promo === true,
      validade: row.valid_until,
      mensagem: row.raw_message,
      criadoEm: row.created_at,
    }));

  return { movimentos, ofertas: listaOfertas };
}

// ---------------------------------------------------------------------------
// E-mail de fornecedor
// ---------------------------------------------------------------------------

export async function loadPendingEmailImports(
  client: SupabaseClient,
  businessId: string,
): Promise<PendingEmailImport[]> {
  const { data, error } = await client
    .from("ingestion_events")
    .select("id, created_at, raw_input, extracted_payload")
    .eq("business_id", businessId)
    .eq("source_type", "email_import")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw toCloudError(error, "Não conseguimos ler os e-mails pendentes.");
  }

  return ((data ?? []) as Array<{
    id: string;
    created_at: string;
    raw_input: string | null;
    extracted_payload: unknown;
  }>)
    .map((row) => pendingEmailImportFromEvent(row))
    .filter((event): event is PendingEmailImport => Boolean(event));
}

export async function markEmailImportProcessed(
  client: SupabaseClient,
  businessId: string,
  eventId: string,
): Promise<void> {
  const { error } = await client
    .from("ingestion_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
    })
    .eq("business_id", businessId)
    .eq("id", eventId);
  if (error) {
    throw toCloudError(error, "Não conseguimos marcar o e-mail como lido.");
  }
}

// ---------------------------------------------------------------------------
// Ingestão (base para WhatsApp, e-mail/XML e QR Code)
// ---------------------------------------------------------------------------

async function recordIngestionEvent(
  client: SupabaseClient,
  businessId: string,
  input: {
    sourceType: SourceType;
    status: "processed" | "pending_review";
    rawInput?: string;
    transactionId?: string;
    aiConfidence?: number;
    extractedPayload?: Record<string, unknown>;
    externalChannel?: string;
    externalId?: string;
  },
): Promise<void> {
  const { error } = await client.from("ingestion_events").insert({
    business_id: businessId,
    source_type: input.sourceType,
    status: input.status,
    raw_input: input.rawInput ?? null,
    extracted_payload: input.extractedPayload ?? null,
    ai_confidence: input.aiConfidence ?? null,
    transaction_id: input.transactionId ?? null,
    external_channel: input.externalChannel ?? null,
    external_id: input.externalId ?? null,
    processed_at: input.status === "processed" ? new Date().toISOString() : null,
  });
  // O evento é auditoria: se falhar, o lançamento financeiro já está salvo.
  if (error) return;
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

export async function registerSale(
  client: SupabaseClient,
  businessId: string,
  input: {
    productId: string;
    quantity: number;
    amountCents: number;
    paymentMethod: PaymentMethod;
    sourceType?: SourceType;
    rawInput?: string;
  },
): Promise<string | null> {
  const { data, error } = await client.rpc("register_sale", {
    p_business_id: businessId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_amount_cents: input.amountCents,
    p_payment_method: input.paymentMethod,
    p_source_type: input.sourceType ?? "manual",
    p_raw_input: input.rawInput ?? null,
  });
  if (error) throw toCloudError(error, "Não conseguimos salvar a venda.");

  const transactionId = typeof data === "string" ? data : null;
  const sourceType = input.sourceType ?? "manual";
  if (transactionId && sourceType !== "manual") {
    await recordIngestionEvent(client, businessId, {
      sourceType,
      status: "processed",
      rawInput: input.rawInput,
      transactionId,
      externalChannel: sourceType === "image_recognition" ? "image" : "audio",
    });
  }
  return transactionId;
}

export async function registerExpense(
  client: SupabaseClient,
  businessId: string,
  input: {
    description: string;
    amountCents: number;
    paymentMethod: PaymentMethod;
    sourceType?: SourceType;
    rawInput?: string;
    supplierId?: string;
  },
): Promise<string | null> {
  const { data, error } = await client
    .from("transactions")
    .insert({
      business_id: businessId,
      kind: "expense",
      description: input.description,
      amount_cents: input.amountCents,
      supplier_id: input.supplierId ?? null,
      payment_method: input.paymentMethod,
      source_type: input.sourceType ?? "manual",
      status: "processed",
      raw_input: input.rawInput ?? null,
    })
    .select("id")
    .single();
  if (error) throw toCloudError(error, "Não conseguimos salvar o gasto.");

  const transactionId = (data as { id: string }).id;
  const sourceType = input.sourceType ?? "manual";
  if (sourceType !== "manual") {
    await recordIngestionEvent(client, businessId, {
      sourceType,
      status: "processed",
      rawInput: input.rawInput,
      transactionId,
      externalChannel: sourceType === "image_recognition" ? "image" : "audio",
    });
  }
  return transactionId;
}

export async function registerWithdrawal(
  client: SupabaseClient,
  businessId: string,
  input: {
    description: string;
    amountCents: number;
    paymentMethod: PaymentMethod;
    occurredAt?: string;
  },
): Promise<string> {
  const { data, error } = await client
    .from("transactions")
    .insert({
      business_id: businessId,
      kind: "withdrawal",
      description: input.description,
      amount_cents: input.amountCents,
      payment_method: input.paymentMethod,
      source_type: "manual",
      status: "processed",
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw toCloudError(error, "Não conseguimos salvar a retirada.");
  return (data as { id: string }).id;
}

export async function registerStockEntry(
  client: SupabaseClient,
  businessId: string,
  input: {
    productId?: string;
    name: string;
    quantity: number;
    totalCostCents: number;
  },
): Promise<string> {
  const { data, error } = await client.rpc("register_stock_entry", {
    p_business_id: businessId,
    p_product_id: input.productId ?? null,
    p_name: input.name.trim(),
    p_quantity: input.quantity,
    p_total_cost_cents: input.totalCostCents,
  });
  if (error) throw toCloudError(error, "Não conseguimos dar entrada.");

  const result = (data ?? {}) as { product_id?: string };
  if (!result.product_id) {
    throw new CloudError("O Supabase não devolveu o item atualizado.");
  }
  return result.product_id;
}

export async function registerPurchase(
  client: SupabaseClient,
  businessId: string,
  input: {
    supplierId?: string;
    productId?: string;
    productName: string;
    quantity: number;
    unitCostCents: number;
    paidNow: boolean;
    dueDate?: string;
    paymentMethod: PaymentMethod;
    sourceType?: SourceType;
    rawInput?: string;
  },
): Promise<{
  productId: string | null;
  purchaseId: string | null;
  billId: string | null;
  transactionId: string | null;
}> {
  const { data, error } = await client.rpc("register_purchase", {
    p_business_id: businessId,
    p_supplier_id: input.supplierId ?? null,
    p_product_id: input.productId ?? null,
    p_product_name: input.productName,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_paid_now: input.paidNow,
    p_due_date: input.dueDate ?? null,
    p_payment_method: input.paymentMethod,
    p_source_type: input.sourceType ?? "manual",
    p_raw_input: input.rawInput ?? null,
  });
  if (error) throw toCloudError(error, "Não conseguimos salvar a compra.");

  const result = (data ?? {}) as {
    product_id?: string;
    purchase_id?: string;
    bill_id?: string | null;
    transaction_id?: string | null;
  };

  return {
    productId: result.product_id ?? null,
    purchaseId: result.purchase_id ?? null,
    billId: result.bill_id ?? null,
    transactionId: result.transaction_id ?? null,
  };
}

export async function confirmPendingSale(
  client: SupabaseClient,
  input: {
    transactionId: string;
    productId: string;
    quantity: number;
    amountCents: number;
    paymentMethod: PaymentMethod;
  },
): Promise<void> {
  const { error } = await client.rpc("confirm_pending_sale", {
    p_transaction_id: input.transactionId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_amount_cents: input.amountCents,
    p_payment_method: input.paymentMethod,
  });
  if (error) {
    throw toCloudError(error, "Não conseguimos confirmar essa venda.");
  }
}

export async function removeTransaction(
  client: SupabaseClient,
  transactionId: string,
): Promise<void> {
  const { error } = await client.rpc("delete_transaction", {
    p_transaction_id: transactionId,
  });
  if (error) throw toCloudError(error, "Não conseguimos apagar o registro.");
}

export async function updateProduct(
  client: SupabaseClient,
  input: {
    productId: string;
    name: string;
    priceCents: number;
    minStock: number;
  },
): Promise<void> {
  const { error } = await client
    .from("products")
    .update({
      name: input.name,
      price_cents: input.priceCents,
      min_stock: input.minStock,
    })
    .eq("id", input.productId);
  if (error) throw toCloudError(error, "Não conseguimos atualizar o item.");
}

export async function setProductSupplier(
  client: SupabaseClient,
  productId: string,
  supplierId: string | null,
): Promise<void> {
  const { error } = await client
    .from("products")
    .update({ supplier_id: supplierId })
    .eq("id", productId);
  if (error) {
    throw toCloudError(error, "Não conseguimos atualizar o fornecedor do item.");
  }
}

// ---------------------------------------------------------------------------
// Fornecedores, contas e retiradas
// ---------------------------------------------------------------------------

export async function saveSupplier(
  client: SupabaseClient,
  businessId: string,
  input: {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
  },
): Promise<string> {
  const payload = {
    name: input.name.trim(),
    phone: optionalText(input.phone),
    email: optionalText(input.email),
    notes: optionalText(input.notes),
  };

  if (input.id) {
    const { error } = await client
      .from("suppliers")
      .update(payload)
      .eq("id", input.id);
    if (error) throw toCloudError(error, "Não conseguimos salvar o fornecedor.");
    return input.id;
  }

  const { data, error } = await client
    .from("suppliers")
    .insert({ business_id: businessId, ...payload })
    .select("id")
    .single();
  if (error) throw toCloudError(error, "Não conseguimos salvar o fornecedor.");
  return (data as { id: string }).id;
}

export async function removeSupplier(
  client: SupabaseClient,
  supplierId: string,
): Promise<void> {
  const { error } = await client
    .from("suppliers")
    .delete()
    .eq("id", supplierId);
  if (error) throw toCloudError(error, "Não conseguimos apagar o fornecedor.");
}

export async function createBill(
  client: SupabaseClient,
  businessId: string,
  input: {
    description: string;
    amountCents: number;
    dueDate: string;
    supplierId?: string;
    paymentMethod?: PaymentMethod;
  },
): Promise<string> {
  const { data, error } = await client
    .from("bills")
    .insert({
      business_id: businessId,
      supplier_id: input.supplierId ?? null,
      description: input.description.trim(),
      amount_cents: input.amountCents,
      due_date: input.dueDate,
      status: "open",
      payment_method: input.paymentMethod ?? null,
      source_type: "manual",
    })
    .select("id")
    .single();
  if (error) throw toCloudError(error, "Não conseguimos salvar a conta.");
  return (data as { id: string }).id;
}

export async function payBill(
  client: SupabaseClient,
  input: {
    billId: string;
    paymentMethod: PaymentMethod;
    paidAt?: string;
  },
): Promise<string> {
  const { data, error } = await client.rpc("pay_bill", {
    p_bill_id: input.billId,
    p_payment_method: input.paymentMethod,
    p_paid_at: input.paidAt ?? new Date().toISOString(),
  });
  if (error) throw toCloudError(error, "Não conseguimos pagar esta conta.");
  return typeof data === "string" ? data : "";
}

export async function removeBill(
  client: SupabaseClient,
  billId: string,
): Promise<void> {
  const { error } = await client
    .from("bills")
    .delete()
    .eq("id", billId)
    .eq("status", "open");
  if (error) throw toCloudError(error, "Não conseguimos apagar a conta.");
}

export async function createPendingSale(
  client: SupabaseClient,
  businessId: string,
  input: {
    productId: string;
    productName: string;
    quantity: number;
    amountCents: number;
    paymentMethod?: PaymentMethod;
    sourceType: SourceType;
    rawInput?: string;
    aiConfidence?: number;
  },
): Promise<string> {
  const { data, error } = await client
    .from("transactions")
    .insert({
      business_id: businessId,
      kind: "sale",
      description: input.productName,
      amount_cents: input.amountCents,
      quantity: input.quantity,
      product_id: input.productId,
      payment_method: input.paymentMethod ?? null,
      source_type: input.sourceType,
      status: "pending_review",
      raw_input: input.rawInput ?? null,
      ai_confidence: input.aiConfidence ?? null,
    })
    .select("id")
    .single();
  if (error) throw toCloudError(error, "Não conseguimos registrar o áudio.");
  const transactionId = (data as { id: string }).id;

  await recordIngestionEvent(client, businessId, {
    sourceType: input.sourceType,
    status: "pending_review",
    rawInput: input.rawInput,
    transactionId,
    aiConfidence: input.aiConfidence,
    externalChannel:
      input.sourceType === "audio_transcription" ? "audio" : "image",
    extractedPayload: {
      productName: input.productName,
      quantity: input.quantity,
      amountCents: input.amountCents,
    },
  });

  return transactionId;
}

// ---------------------------------------------------------------------------
// Importação de planilha
// ---------------------------------------------------------------------------

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function insertImportTransaction(
  client: SupabaseClient,
  businessId: string,
  row: ImportRow,
  overrides: {
    description?: string;
    kind?: "sale" | "expense" | "withdrawal";
    supplierId?: string | null;
    productId?: string | null;
    quantity?: number | null;
  } = {},
): Promise<string | null> {
  const { data, error } = await client
    .from("transactions")
    .insert({
      business_id: businessId,
      kind: overrides.kind ?? row.kind,
      description: overrides.description ?? row.description,
      amount_cents: row.amountCents,
      quantity: overrides.quantity ?? row.quantity ?? null,
      product_id: overrides.productId ?? null,
      supplier_id: overrides.supplierId ?? null,
      payment_method: row.paymentMethod,
      source_type: row.sourceType ?? "spreadsheet_import",
      status: "processed",
      occurred_at: row.occurredAt,
    })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

export async function importSpreadsheetRows(
  client: SupabaseClient,
  businessId: string,
  rows: ImportRow[],
): Promise<ImportSummary> {
  const errors: string[] = [];
  let imported = 0;

  if (rows.length === 0) {
    return { imported: 0, skipped: 0, errors };
  }

  const { data: productRows, error: productError } = await client
    .from("products")
    .select(
      "id, name, stock, cost_cents, track_stock, unit, unit_plural, min_stock, price_cents, supplier_id",
    )
    .eq("business_id", businessId);
  if (productError) {
    throw toCloudError(productError, "Não conseguimos carregar os itens.");
  }
  type ImportProductRow = {
    id: string;
    name: string;
    stock: number | string;
    cost_cents: number;
    track_stock: boolean;
    unit: string;
    unit_plural: string;
    min_stock: number;
    price_cents: number;
    supplier_id: string | null;
  };
  const products = (productRows ?? []) as ImportProductRow[];
  const productByName = new Map(
    products.map((row) => [normalizeName(row.name), row]),
  );
  const productIdByName = new Map(
    products.map((row) => [normalizeName(row.name), row.id]),
  );

  const { data: supplierRows, error: supplierError } = await client
    .from("suppliers")
    .select("id, name")
    .eq("business_id", businessId);
  if (supplierError) {
    throw toCloudError(supplierError, "Não conseguimos carregar os fornecedores.");
  }
  const supplierIdByName = new Map(
    ((supplierRows ?? []) as Array<{ id: string; name: string }>).map((row) => [
      normalizeName(row.name),
      row.id,
    ]),
  );

  async function ensureSupplier(name?: string): Promise<string | null> {
    if (!name?.trim()) return null;
    const key = normalizeName(name);
    const existing = supplierIdByName.get(key);
    if (existing) return existing;
    const { data, error } = await client
      .from("suppliers")
      .insert({ business_id: businessId, name: name.trim() })
      .select("id")
      .single();
    if (error) {
      errors.push(`Fornecedor "${name}" não foi criado.`);
      return null;
    }
    const id = (data as { id: string }).id;
    supplierIdByName.set(key, id);
    return id;
  }

  async function applyStockToProduct(
    row: ImportRow,
    supplierId: string | null,
  ): Promise<string | null> {
    if (!row.applyStock) {
      const name = row.productName ?? row.description;
      return productIdByName.get(normalizeName(name)) ?? null;
    }

    const name = (row.productName ?? row.description).trim();
    if (!name) return null;
    const key = normalizeName(name);
    const quantity = row.quantity ?? 1;
    const existing = productByName.get(key);

    if (existing) {
      if (!existing.track_stock) return existing.id;
      const currentStock = toNumber(existing.stock);
      const newStock = currentStock + quantity;
      const newCost = Math.round(
        (currentStock * toNumber(existing.cost_cents) + row.amountCents) /
          Math.max(0.0001, newStock),
      );
      const { error } = await client
        .from("products")
        .update({
          stock: newStock,
          cost_cents: newCost,
          supplier_id: supplierId,
        })
        .eq("id", existing.id);
      if (error) {
        errors.push(`Linha ${row.line}: estoque não foi atualizado.`);
        return existing.id;
      }
      existing.stock = newStock;
      existing.cost_cents = newCost;
      existing.supplier_id = supplierId;
      return existing.id;
    }

    const unit = row.unit?.trim() || "un";
    const unitCost = Math.round(row.amountCents / Math.max(0.0001, quantity));
    const priceCents = Math.max(100, Math.ceil((unitCost * 1.8) / 100) * 100);
    const { data, error } = await client
      .from("products")
      .insert({
        business_id: businessId,
        name,
        unit,
        unit_plural: unit,
        stock: quantity,
        min_stock: 2,
        cost_cents: unitCost,
        price_cents: priceCents,
        track_stock: true,
        supplier_id: supplierId,
      })
      .select("id, name")
      .single();
    if (error) {
      errors.push(`Linha ${row.line}: produto não foi criado.`);
      return null;
    }

    const created = data as { id: string; name: string };
    productIdByName.set(key, created.id);
    productByName.set(key, {
      id: created.id,
      name: created.name,
      stock: quantity,
      cost_cents: unitCost,
      track_stock: true,
      unit,
      unit_plural: unit,
      min_stock: 2,
      price_cents: priceCents,
      supplier_id: supplierId,
    });
    return created.id;
  }

  // Vendas, gastos e retiradas entram em um único lote.
  const simpleRows = rows.filter(
    (row) =>
      row.kind === "sale" ||
      row.kind === "expense" ||
      row.kind === "withdrawal",
  );

  if (simpleRows.length > 0) {
    const { error } = await client.from("transactions").insert(
      simpleRows.map((row) => ({
        business_id: businessId,
        kind: row.kind,
        description: row.description,
        amount_cents: row.amountCents,
        quantity: row.kind === "sale" ? (row.quantity ?? null) : null,
        product_id:
          row.kind === "sale" && row.productName
            ? (productIdByName.get(normalizeName(row.productName)) ?? null)
            : null,
        supplier_id: null,
        payment_method: row.paymentMethod,
        source_type: row.sourceType ?? "spreadsheet_import",
        status: "processed",
        occurred_at: row.occurredAt,
      })),
    );
    if (error) {
      errors.push("Não conseguimos importar as vendas e gastos.");
    } else {
      imported += simpleRows.length;
    }
  }

  // Compras e contas precisam de vínculo com fornecedor/produto/conta.
  for (const row of rows) {
    try {
      if (row.kind === "purchase") {
        const supplierId = await ensureSupplier(row.supplierName);
        const productName = row.productName ?? row.description;
        const productId = await applyStockToProduct(row, supplierId);
        const quantity = row.quantity ?? 1;

        let billId: string | null = null;
        let transactionId: string | null = null;

        if (row.paid) {
          transactionId = await insertImportTransaction(
            client,
            businessId,
            row,
            {
              kind: "expense",
              description: `Compra: ${productName}`,
              supplierId,
              productId,
            },
          );
          if (!transactionId) {
            errors.push(`Linha ${row.line}: compra não foi salva.`);
            continue;
          }
        } else {
          const { data, error } = await client
            .from("bills")
            .insert({
              business_id: businessId,
              supplier_id: supplierId,
              description: `Compra: ${productName}`,
              amount_cents: row.amountCents,
              due_date: row.dueDate ?? dateOnly(14),
              status: "open",
              payment_method: row.paymentMethod,
              source_type: row.sourceType ?? "spreadsheet_import",
            })
            .select("id")
            .single();
          if (error) {
            errors.push(`Linha ${row.line}: conta da compra não foi criada.`);
            continue;
          }
          billId = (data as { id: string }).id;
        }

        const { error: purchaseError } = await client.from("purchases").insert({
          business_id: businessId,
          supplier_id: supplierId,
          product_id: productId,
          product_name: productName,
          quantity,
          unit_cost_cents: Math.round(row.amountCents / quantity),
          total_cents: row.amountCents,
          bill_id: billId,
          transaction_id: transactionId,
          source_type: row.sourceType ?? "spreadsheet_import",
          occurred_at: row.occurredAt,
        });
        if (purchaseError) {
          errors.push(`Linha ${row.line}: histórico de compra não foi salvo.`);
          continue;
        }
        if (row.applyStock && productId) {
          const { error: logError } = await client
            .from("inventory_logs")
            .insert({
              business_id: businessId,
              product_id: productId,
              direction: "in",
              quantity,
              unit_cost_cents: Math.round(row.amountCents / quantity),
              transaction_id: transactionId,
              source_type: row.sourceType ?? "spreadsheet_import",
              status: "processed",
              occurred_at: row.occurredAt,
            });
          if (logError) {
            errors.push(
              `Linha ${row.line}: entrada de estoque não foi registrada.`,
            );
          }
        }
        imported += 1;
        continue;
      }

      if (row.kind === "bill") {
        const supplierId = await ensureSupplier(row.supplierName);
        let transactionId: string | null = null;
        if (row.paid) {
          transactionId = await insertImportTransaction(
            client,
            businessId,
            row,
            {
              kind: "expense",
              description: `Conta: ${row.description}`,
              supplierId,
            },
          );
        }
        const { error } = await client.from("bills").insert({
          business_id: businessId,
          supplier_id: supplierId,
          description: row.description,
          amount_cents: row.amountCents,
          due_date: row.dueDate ?? dateOnly(7),
          status: row.paid ? "paid" : "open",
          paid_at: row.paid ? row.occurredAt : null,
          payment_method: row.paymentMethod,
          transaction_id: transactionId,
          source_type: row.sourceType ?? "spreadsheet_import",
        });
        if (error) {
          errors.push(`Linha ${row.line}: conta não foi salva.`);
          continue;
        }
        imported += 1;
      }
    } catch (error) {
      errors.push(
        `Linha ${row.line}: ${
          error instanceof Error ? error.message : "erro inesperado."
        }`,
      );
    }
  }

  return {
    imported,
    skipped: Math.max(0, rows.length - imported),
    errors,
  };
}
