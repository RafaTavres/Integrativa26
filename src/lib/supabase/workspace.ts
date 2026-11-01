"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SEGMENTS, isSegmentId } from "../segments";
import type {
  Business,
  DemoState,
  InventoryLog,
  PaymentMethod,
  Product,
  SegmentId,
  SourceType,
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

// ---------------------------------------------------------------------------
// Linhas do banco
// ---------------------------------------------------------------------------

interface BusinessRow {
  id: string;
  name: string;
  owner_name: string;
  city: string | null;
  segment: string;
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
  created_at: string;
}

interface TransactionRow {
  id: string;
  kind: Transaction["kind"];
  description: string;
  amount_cents: number;
  quantity: number | string | null;
  product_id: string | null;
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

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    ownerName: row.owner_name,
    city: row.city ?? "",
    segment: isSegmentId(row.segment) ? row.segment : "confeitaria",
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
  const [businessResult, productsResult, transactionsResult, logsResult] =
    await Promise.all([
      client
        .from("businesses")
        .select("id, name, owner_name, city, segment")
        .eq("id", businessId)
        .maybeSingle(),
      client
        .from("products")
        .select(
          "id, name, unit, unit_plural, stock, min_stock, cost_cents, price_cents, track_stock, created_at",
        )
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
      client
        .from("transactions")
        .select(
          "id, kind, description, amount_cents, quantity, product_id, payment_method, source_type, status, raw_input, ai_confidence, occurred_at, created_at, reviewed_at",
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
      version: 2,
      segmentId: business.segment,
      products: ((productsResult.data ?? []) as ProductRow[]).map(mapProduct),
      transactions: ((transactionsResult.data ?? []) as TransactionRow[]).map(
        (row) => mapTransaction(row, logIdByTransaction),
      ),
      inventoryLogs: logs,
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
      })),
    );
    if (error) {
      throw toCloudError(error, "Não conseguimos preparar os itens.");
    }
  }

  const { count, error: countError } = await client
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (countError) {
    throw toCloudError(countError, "Não conseguimos preparar os exemplos.");
  }
  if (!includeSampleTransactions || (count ?? 0) > 0) return;

  const { data: productRows, error: productError } = await client
    .from("products")
    .select("id, name")
    .eq("business_id", businessId);
  if (productError) {
    throw toCloudError(productError, "Não conseguimos preparar os exemplos.");
  }

  const idByName = new Map(
    ((productRows ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.name.trim().toLowerCase(),
      row.id,
    ]),
  );

  const productIdByKey = new Map<string, string>();
  for (const seed of segment.products) {
    const id = idByName.get(seed.name.trim().toLowerCase());
    if (id) productIdByKey.set(seed.key, id);
  }

  interface SeedTransactionRow {
    business_id: string;
    kind: Transaction["kind"];
    description: string;
    amount_cents: number;
    quantity: number | null;
    product_id: string | null;
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
  return loadWorkspace(client, businessId);
}

/**
 * Abre o negócio do usuário. Se ainda não existir, cria já com os itens
 * e lançamentos de exemplo do ramo escolhido.
 */
export async function openWorkspace(
  client: SupabaseClient,
  preferredSegment: SegmentId,
): Promise<Workspace> {
  const businessId = await findBusinessId(client);
  if (!businessId) return createWorkspace(client, preferredSegment);

  const workspace = await loadWorkspace(client, businessId);
  // Só completa itens que faltaram em um primeiro carregamento interrompido.
  // Lançamentos apagados de propósito não voltam.
  await seedWorkspace(client, businessId, workspace.business.segment, false);
  return loadWorkspace(client, businessId);
}

/**
 * Troca o ramo recomeçando os dados: apaga o negócio atual (em cascata) e
 * cria outro com os exemplos do novo ramo.
 */
export async function replaceWorkspace(
  client: SupabaseClient,
  businessId: string,
  segmentId: SegmentId,
): Promise<Workspace> {
  const { data, error } = await client
    .from("businesses")
    .delete()
    .eq("id", businessId)
    .select("id");

  if (error) throw toCloudError(error, "Não conseguimos recomeçar seu caixa.");
  if (!data || data.length === 0) {
    throw new CloudError("Não conseguimos apagar os dados antigos.");
  }

  return createWorkspace(client, segmentId);
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
): Promise<void> {
  const { error } = await client.rpc("register_sale", {
    p_business_id: businessId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_amount_cents: input.amountCents,
    p_payment_method: input.paymentMethod,
    p_source_type: input.sourceType ?? "manual",
    p_raw_input: input.rawInput ?? null,
  });
  if (error) throw toCloudError(error, "Não conseguimos salvar a venda.");
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
  },
): Promise<void> {
  const { error } = await client.from("transactions").insert({
    business_id: businessId,
    kind: "expense",
    description: input.description,
    amount_cents: input.amountCents,
    payment_method: input.paymentMethod,
    source_type: input.sourceType ?? "manual",
    status: "processed",
    raw_input: input.rawInput ?? null,
  });
  if (error) throw toCloudError(error, "Não conseguimos salvar o gasto.");
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
  const unitCostCents = Math.round(input.totalCostCents / input.quantity);

  const { data: products, error: productsError } = await client
    .from("products")
    .select("id, name, stock, cost_cents, track_stock")
    .eq("business_id", businessId);
  if (productsError) {
    throw toCloudError(productsError, "Não conseguimos consultar os itens.");
  }

  const rows = (products ?? []) as Array<{
    id: string;
    name: string;
    stock: number | string;
    cost_cents: number;
    track_stock: boolean;
  }>;
  const cleanName = input.name.trim().toLowerCase();
  const existing =
    rows.find((row) => row.id === input.productId && row.track_stock) ??
    rows.find(
      (row) => row.track_stock && row.name.trim().toLowerCase() === cleanName,
    );

  let productId: string;

  if (existing) {
    const currentStock = toNumber(existing.stock);
    const newStock = currentStock + input.quantity;
    const weightedCost = Math.round(
      (currentStock * toNumber(existing.cost_cents) + input.totalCostCents) /
        newStock,
    );
    const { error } = await client
      .from("products")
      .update({
        name: input.name.trim(),
        stock: newStock,
        cost_cents: weightedCost,
      })
      .eq("id", existing.id);
    if (error) throw toCloudError(error, "Não conseguimos dar entrada.");
    productId = existing.id;
  } else {
    const suggestedPrice =
      unitCostCents > 0
        ? Math.max(100, Math.ceil((unitCostCents * 1.8) / 100) * 100)
        : 0;
    const { data, error } = await client
      .from("products")
      .insert({
        business_id: businessId,
        name: input.name.trim(),
        unit: "un",
        unit_plural: "un",
        stock: input.quantity,
        min_stock: 2,
        cost_cents: unitCostCents,
        price_cents: suggestedPrice,
        track_stock: true,
      })
      .select("id")
      .single();
    if (error) throw toCloudError(error, "Não conseguimos criar o item.");
    productId = (data as { id: string }).id;
  }

  let transactionId: string | null = null;
  if (input.totalCostCents > 0) {
    const { data, error } = await client
      .from("transactions")
      .insert({
        business_id: businessId,
        kind: "expense",
        description: `Compra: ${input.name.trim()}`,
        amount_cents: input.totalCostCents,
        payment_method: "other",
        source_type: "manual",
        status: "processed",
      })
      .select("id")
      .single();
    if (error) throw toCloudError(error, "Não conseguimos lançar o gasto.");
    transactionId = (data as { id: string }).id;
  }

  const { error: logError } = await client.from("inventory_logs").insert({
    business_id: businessId,
    product_id: productId,
    direction: "in",
    quantity: input.quantity,
    unit_cost_cents: unitCostCents,
    transaction_id: transactionId,
    source_type: "manual",
    status: "processed",
  });
  if (logError) {
    throw new CloudError(
      "A entrada foi salva, mas o histórico de estoque falhou.",
    );
  }

  return productId;
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

export async function createPendingSale(
  client: SupabaseClient,
  businessId: string,
  input: {
    productId: string;
    productName: string;
    quantity: number;
    amountCents: number;
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
      source_type: input.sourceType,
      status: "pending_review",
      raw_input: input.rawInput ?? null,
      ai_confidence: input.aiConfidence ?? null,
    })
    .select("id")
    .single();
  if (error) throw toCloudError(error, "Não conseguimos registrar o áudio.");
  return (data as { id: string }).id;
}
