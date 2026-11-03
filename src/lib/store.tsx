"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBusiness, createSeedState } from "./seed";
import { SEGMENTS, SEGMENT_LIST, isSegmentId } from "./segments";
import type { SegmentProfile } from "./segments";
import { getSupabaseClient, loadSupabaseConfig } from "./supabase/client";
import { addDaysToDateOnly, todayDateOnly } from "./analytics";
import type { ImportRow, ImportSummary } from "./import";
import {
  abrirLojaWhatsapp,
  carregarDadosWhatsapp,
  CloudError,
  confirmPendingSale,
  createBill as createCloudBill,
  createPendingSale,
  ensureAnonymousSession,
  importSpreadsheetRows,
  loadWorkspace,
  LOJA_WHATSAPP_ID,
  openWorkspace,
  payBill as payCloudBill,
  registerExpense,
  registerPurchase as registerCloudPurchase,
  registerSale,
  registerStockEntry,
  registerWithdrawal as registerCloudWithdrawal,
  removeBill as removeCloudBill,
  removeSupplier as removeCloudSupplier,
  removeTransaction,
  replaceWorkspace,
  saveSupplier,
  setProductSupplier as setCloudProductSupplier,
  updateProduct as updateCloudProduct,
  type DadosWhatsapp,
  type Workspace,
} from "./supabase/workspace";
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
} from "./types";

const STORAGE_KEY = "estokar:demo:v3";
// Chaves do nome antigo, migradas na primeira leitura.
const LEGACY_STORAGE_KEYS = [
  "meu-caixa:demo:v3",
  "meu-caixa:demo:v2",
  "meu-caixa:demo:v1",
];

/** Nome de produto/fornecedor sem acento, caixa ou espaço extra. */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface SaleInput {
  productId: string;
  quantity: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
  /** De onde veio o registro: manual, foto, áudio… */
  sourceType?: SourceType;
  rawInput?: string;
}

interface ExpenseInput {
  description: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  sourceType?: SourceType;
  rawInput?: string;
}

interface StockInput {
  productId?: string;
  name: string;
  quantity: number;
  totalCostCents: number;
}

interface ReviewInput extends SaleInput {
  transactionId: string;
}

/** Rascunho criado a partir de um áudio gravado no próprio navegador. */
interface AudioDraftInput {
  productId: string;
  quantity: number;
  amountCents: number;
  paymentMethod?: PaymentMethod;
  transcript: string;
  aiConfidence?: number;
}

interface SupplierInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

interface PurchaseInput {
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
}

interface PurchaseResult {
  productId?: string;
  purchaseId?: string;
  billId?: string;
  transactionId?: string;
}

interface BillInput {
  description: string;
  amountCents: number;
  dueDate: string;
  supplierId?: string;
  paymentMethod?: PaymentMethod;
}

interface WithdrawalInput {
  description: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
}

export type StoreMode = "local" | "cloud";
export type CloudStatus = "off" | "connecting" | "ready" | "error";

interface AppContextValue {
  business: Business;
  segment: SegmentProfile;
  segments: SegmentProfile[];
  products: Product[];
  transactions: Transaction[];
  inventoryLogs: InventoryLog[];
  suppliers: Supplier[];
  purchases: Purchase[];
  bills: Bill[];
  openBills: Bill[];
  pendingTransactions: Transaction[];
  lowStockProducts: Product[];
  todayInCents: number;
  todayOutCents: number;
  cashCents: number;
  todayCount: number;
  /** "cloud" quando a sessão anônima do Supabase está ativa. */
  mode: StoreMode;
  cloudStatus: CloudStatus;
  cloudMessage: string | null;
  ready: boolean;
  retryCloud: () => Promise<void>;
  recordSale: (input: SaleInput) => Promise<void>;
  recordExpense: (input: ExpenseInput) => Promise<void>;
  recordWithdrawal: (input: WithdrawalInput) => Promise<void>;
  addStock: (input: StockInput) => Promise<{
    product: Product;
    transaction?: Transaction;
  }>;
  reviewPending: (input: ReviewInput) => Promise<void>;
  discardPending: (transactionId: string) => Promise<void>;
  updateProduct: (
    productId: string,
    input: { name: string; priceCents: number; minStock: number },
  ) => Promise<void>;
  setProductSupplier: (
    productId: string,
    supplierId?: string,
  ) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
  addSupplier: (input: SupplierInput) => Promise<Supplier>;
  updateSupplier: (supplierId: string, input: SupplierInput) => Promise<void>;
  deleteSupplier: (supplierId: string) => Promise<void>;
  registerPurchase: (input: PurchaseInput) => Promise<PurchaseResult>;
  addBill: (input: BillInput) => Promise<void>;
  payBill: (billId: string, paymentMethod: PaymentMethod) => Promise<void>;
  deleteBill: (billId: string) => Promise<void>;
  importRows: (rows: ImportRow[]) => Promise<ImportSummary>;
  setSegment: (segmentId: SegmentId) => Promise<void>;
  resetDemo: () => Promise<void>;
  createAudioDraft: (input: AudioDraftInput) => Promise<Transaction>;
  simulatePending: () => Promise<Transaction | null>;
  naLojaWhatsapp: boolean;
  entrarNaLojaWhatsapp: () => Promise<void>;
  voltarParaMinhaLoja: () => Promise<void>;
  carregarWhatsapp: () => Promise<DadosWhatsapp>;
}

const AppContext = createContext<AppContextValue | null>(null);

const LOJA_WHATSAPP_KEY = "estokar:loja-whatsapp";

function lojaWhatsappEscolhida(): boolean {
  try {
    return window.localStorage.getItem(LOJA_WHATSAPP_KEY) === "1";
  } catch {
    return false;
  }
}

function lembrarLojaWhatsapp(escolhida: boolean) {
  try {
    if (escolhida) window.localStorage.setItem(LOJA_WHATSAPP_KEY, "1");
    else window.localStorage.removeItem(LOJA_WHATSAPP_KEY);
  } catch {
    return;
  }
}

async function abrirLojaInicial(
  client: SupabaseClient,
  preferredSegment: SegmentId,
): Promise<Workspace> {
  if (lojaWhatsappEscolhida()) {
    try {
      return await abrirLojaWhatsapp(client);
    } catch {
      lembrarLojaWhatsapp(false);
    }
  }
  return openWorkspace(client, preferredSegment);
}

interface CloudConnection {
  client: SupabaseClient;
  businessId: string;
}

interface LegacyDemoState {
  version: 2;
  segmentId: SegmentId;
  products: Product[];
  transactions: Transaction[];
  inventoryLogs: InventoryLog[];
}

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DemoState>;
  return (
    state.version === 3 &&
    isSegmentId(state.segmentId) &&
    Array.isArray(state.products) &&
    Array.isArray(state.transactions) &&
    Array.isArray(state.inventoryLogs) &&
    Array.isArray(state.suppliers) &&
    Array.isArray(state.purchases) &&
    Array.isArray(state.bills) &&
    state.products.every(
      (product) =>
        product && typeof product === "object" && "trackStock" in product,
    )
  );
}

function isLegacyState(value: unknown): value is LegacyDemoState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<LegacyDemoState>;
  return (
    state.version === 2 &&
    isSegmentId(state.segmentId) &&
    Array.isArray(state.products) &&
    Array.isArray(state.transactions) &&
    Array.isArray(state.inventoryLogs)
  );
}

/**
 * Quem já usava a demo na v2 mantém vendas, gastos e estoque. Fornecedores,
 * compras e contas de exemplo entram para as telas novas já terem conteúdo.
 */
function migrateLegacyState(state: LegacyDemoState): DemoState {
  const seed = createSeedState(state.segmentId);
  const productIdByName = new Map(
    state.products.map((product) => [
      normalizeName(product.name),
      product.id,
    ]),
  );

  const purchases = seed.purchases.map((purchase) => ({
    ...purchase,
    productId: purchase.productName
      ? (productIdByName.get(normalizeName(purchase.productName)) ??
        undefined)
      : purchase.productId,
  }));

  return {
    version: 3,
    segmentId: state.segmentId,
    products: state.products,
    transactions: state.transactions,
    inventoryLogs: state.inventoryLogs,
    suppliers: seed.suppliers,
    purchases,
    bills: seed.bills,
  };
}

function readStoredState(): DemoState | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isDemoState(parsed)) {
        for (const key of LEGACY_STORAGE_KEYS) {
          window.localStorage.removeItem(key);
        }
        return parsed;
      }
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = window.localStorage.getItem(key);
      if (!legacy) continue;
      const parsed: unknown = JSON.parse(legacy);

      // v3 do nome antigo: só muda a chave, o conteúdo continua igual.
      if (isDemoState(parsed)) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          window.localStorage.removeItem(legacyKey);
        }
        return parsed;
      }

      // A v2 guardava só produtos, lançamentos e estoque. Migramos mantendo o
      // que a pessoa já tinha e completando fornecedores/compras/contas.
      if (isLegacyState(parsed)) {
        const migrated = migrateLegacyState(parsed);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          window.localStorage.removeItem(legacyKey);
        }
        return migrated;
      }
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    return null;
  } catch {
    // Um storage corrompido não deve impedir o app de abrir.
    return null;
  }
}

function describeCloudError(error: unknown): string {
  if (error instanceof CloudError) {
    if (error.authFailure === "anonymous_disabled") {
      return "O login anônimo está desativado no Supabase. Ative em Authentication → Sign In / Providers → Anonymous.";
    }
    if (error.authFailure === "network") {
      return "Sem conexão com o Supabase agora. Os dados ficam neste navegador até a conexão voltar.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Não conseguimos conectar ao Supabase.";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() =>
    createSeedState("confeitaria"),
  );
  const [cloudBusiness, setCloudBusiness] = useState<Business | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("off");
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const cloudRef = useRef<CloudConnection | null>(null);
  const bootRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<Workspace | null> => {
    const active = cloudRef.current;
    if (!active) return null;
    const workspace = await loadWorkspace(active.client, active.businessId);
    setCloudBusiness(workspace.business);
    setState(workspace.state);
    return workspace;
  }, []);

  const connectCloud = useCallback(
    async (preferredSegment: SegmentId): Promise<boolean> => {
      setCloudStatus("connecting");
      setCloudMessage(null);

      const { config, problem } = await loadSupabaseConfig();
      if (!config) {
        cloudRef.current = null;
        setCloudStatus("off");
        setCloudMessage(problem);
        return false;
      }

      const client = getSupabaseClient(config);
      try {
        await ensureAnonymousSession(client);
        const workspace = await abrirLojaInicial(client, preferredSegment);
        cloudRef.current = {
          client,
          businessId: workspace.business.id,
        };
        setCloudBusiness(workspace.business);
        setState(workspace.state);
        setCloudStatus("ready");
        setCloudMessage(null);
        return true;
      } catch (error) {
        cloudRef.current = null;
        setCloudStatus("error");
        setCloudMessage(describeCloudError(error));
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    // StrictMode monta o efeito duas vezes em dev. Guardar a promessa evita
    // abrir duas sessões e criar dois negócios.
    if (!bootRef.current) {
      bootRef.current = (async () => {
        const stored = readStoredState();
        if (stored) setState(stored);

        const connected = await connectCloud(
          stored?.segmentId ?? "confeitaria",
        );
        if (!connected && !stored) {
          setState(createSeedState("confeitaria"));
        }
        setReady(true);
      })();
    }

    void bootRef.current;
  }, [connectCloud]);

  // No modo local os dados continuam no navegador. No modo nuvem quem manda
  // é o Supabase, então não sobrescrevemos o cache com dados antigos.
  useEffect(() => {
    if (!ready || cloudRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Modo privado ou storage cheio: o app continua funcionando só na sessão.
    }
  }, [state, ready]);

  const retryCloud = useCallback(async () => {
    const connected = await connectCloud(state.segmentId);
    if (!connected) {
      // Mantém a tela usável com os dados que já estavam carregados.
      setReady(true);
    }
  }, [connectCloud, state.segmentId]);

  const recordSale = useCallback(
    async (input: SaleInput): Promise<void> => {
      const product = state.products.find((item) => item.id === input.productId);
      if (!product) throw new Error("Produto não encontrado.");
      if (input.quantity < 1) throw new Error("Informe a quantidade.");
      if (product.trackStock && input.quantity > product.stock) {
        throw new Error("Essa quantidade não está disponível no estoque.");
      }
      if (input.amountCents < 1) throw new Error("Informe um valor válido.");

      const active = cloudRef.current;
      if (active) {
        await registerSale(active.client, active.businessId, {
          productId: product.id,
          quantity: input.quantity,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          sourceType: input.sourceType ?? "manual",
          rawInput: input.rawInput,
        });
        await refresh();
        return;
      }

      const now = new Date().toISOString();
      const logId = product.trackStock ? uid("log") : undefined;
      const transactionId = uid("tx");
      const sourceType = input.sourceType ?? "manual";
      const transaction: Transaction = {
        id: transactionId,
        kind: "sale",
        description: product.name,
        productId: product.id,
        quantity: input.quantity,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        sourceType,
        status: "processed",
        rawInput: input.rawInput,
        occurredAt: now,
        createdAt: now,
        inventoryLogId: logId,
      };
      const log: InventoryLog | null = logId
        ? {
            id: logId,
            productId: product.id,
            direction: "out",
            quantity: input.quantity,
            transactionId,
            sourceType,
            status: "processed",
            occurredAt: now,
          }
        : null;

      setState((previous) => ({
        ...previous,
        products: product.trackStock
          ? previous.products.map((item) =>
              item.id === product.id
                ? { ...item, stock: Math.max(0, item.stock - input.quantity) }
                : item,
            )
          : previous.products,
        transactions: [transaction, ...previous.transactions],
        inventoryLogs: log
          ? [log, ...previous.inventoryLogs]
          : previous.inventoryLogs,
      }));
    },
    [refresh, state.products],
  );

  const recordExpense = useCallback(
    async (input: ExpenseInput): Promise<void> => {
      const description = input.description.trim();
      if (!description) throw new Error("Diga o que foi o gasto.");
      if (input.amountCents < 1) throw new Error("Informe um valor válido.");

      const active = cloudRef.current;
      if (active) {
        await registerExpense(active.client, active.businessId, {
          description,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          sourceType: input.sourceType ?? "manual",
          rawInput: input.rawInput,
        });
        await refresh();
        return;
      }

      const now = new Date().toISOString();
      const transaction: Transaction = {
        id: uid("tx"),
        kind: "expense",
        description,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        sourceType: input.sourceType ?? "manual",
        status: "processed",
        rawInput: input.rawInput,
        occurredAt: now,
        createdAt: now,
      };

      setState((previous) => ({
        ...previous,
        transactions: [transaction, ...previous.transactions],
      }));
    },
    [refresh],
  );

  const recordWithdrawal = useCallback(
    async (input: WithdrawalInput): Promise<void> => {
      const description = input.description.trim();
      if (!description) throw new Error("Diga para que foi a retirada.");
      if (input.amountCents < 1) throw new Error("Informe um valor válido.");

      const active = cloudRef.current;
      if (active) {
        await registerCloudWithdrawal(active.client, active.businessId, {
          description,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
        });
        await refresh();
        return;
      }

      const now = new Date().toISOString();
      const transaction: Transaction = {
        id: uid("tx"),
        kind: "withdrawal",
        description,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        sourceType: "manual",
        status: "processed",
        occurredAt: now,
        createdAt: now,
      };

      setState((previous) => ({
        ...previous,
        transactions: [transaction, ...previous.transactions],
      }));
    },
    [refresh],
  );

  const addStock = useCallback(
    async (
      input: StockInput,
    ): Promise<{ product: Product; transaction?: Transaction }> => {
      const cleanName = input.name.trim();
      if (!cleanName) throw new Error("Diga o nome do produto.");
      if (input.quantity < 1) throw new Error("Informe a quantidade.");

      const existing =
        state.products.find(
          (product) => product.id === input.productId && product.trackStock,
        ) ??
        state.products.find(
          (product) =>
            product.trackStock &&
            normalizeName(product.name) === normalizeName(cleanName),
        );

      const active = cloudRef.current;
      if (active) {
        const productId = await registerStockEntry(
          active.client,
          active.businessId,
          {
            productId: existing?.id,
            name: cleanName,
            quantity: input.quantity,
            totalCostCents: input.totalCostCents,
          },
        );
        const workspace = await refresh();
        const product =
          workspace?.state.products.find((item) => item.id === productId) ??
          workspace?.state.products.find(
            (item) => normalizeName(item.name) === normalizeName(cleanName),
          );
        if (!product) throw new Error("Não conseguimos carregar o item salvo.");
        const transaction = input.totalCostCents
          ? workspace?.state.transactions.find(
              (item) =>
                item.kind === "expense" &&
                item.description === `Compra: ${cleanName}`,
            )
          : undefined;
        return { product, transaction };
      }

      const now = new Date().toISOString();
      const unitCostCents = Math.round(
        input.totalCostCents / input.quantity,
      );
      let product: Product;
      let products: Product[];

      if (existing) {
        const newStock = existing.stock + input.quantity;
        const weightedCost =
          newStock > 0
            ? Math.round(
                (existing.stock * existing.costCents +
                  input.totalCostCents) /
                  newStock,
              )
            : unitCostCents;
        product = {
          ...existing,
          name: cleanName,
          stock: newStock,
          costCents: weightedCost,
        };
        products = state.products.map((item) =>
          item.id === existing.id ? product : item,
        );
      } else {
        const suggestedPrice =
          unitCostCents > 0
            ? Math.max(100, Math.ceil((unitCostCents * 1.8) / 100) * 100)
            : 0;
        product = {
          id: uid("product"),
          name: cleanName,
          unit: "un",
          unitPlural: "un",
          stock: input.quantity,
          minStock: 2,
          costCents: unitCostCents,
          priceCents: suggestedPrice,
          trackStock: true,
          createdAt: now,
        };
        products = [...state.products, product];
      }

      const logId = uid("log");
      const log: InventoryLog = {
        id: logId,
        productId: product.id,
        direction: "in",
        quantity: input.quantity,
        unitCostCents,
        sourceType: "manual",
        status: "processed",
        occurredAt: now,
      };

      let expense: Transaction | undefined;
      if (input.totalCostCents > 0) {
        expense = {
          id: uid("tx"),
          kind: "expense",
          description: `Compra: ${product.name}`,
          amountCents: input.totalCostCents,
          paymentMethod: "other",
          sourceType: "manual",
          status: "processed",
          occurredAt: now,
          createdAt: now,
          inventoryLogId: logId,
        };
        log.transactionId = expense.id;
      }

      setState((previous) => ({
        ...previous,
        products,
        transactions: expense
          ? [expense, ...previous.transactions]
          : previous.transactions,
        inventoryLogs: [log, ...previous.inventoryLogs],
      }));

      return { product, transaction: expense };
    },
    [refresh, state.products],
  );

  const registerPurchase = useCallback(
    async (input: PurchaseInput): Promise<PurchaseResult> => {
      const cleanName = input.productName.trim();
      if (!cleanName) throw new Error("Diga o nome do item comprado.");
      if (input.quantity <= 0) throw new Error("Informe a quantidade.");
      if (input.unitCostCents < 1) throw new Error("Informe o custo da compra.");
      if (!input.paidNow && !input.dueDate) {
        throw new Error("Escolha o vencimento da conta.");
      }

      const active = cloudRef.current;
      if (active) {
        const result = await registerCloudPurchase(
          active.client,
          active.businessId,
          {
            supplierId: input.supplierId,
            productId: input.productId,
            productName: cleanName,
            quantity: input.quantity,
            unitCostCents: input.unitCostCents,
            paidNow: input.paidNow,
            dueDate: input.dueDate,
            paymentMethod: input.paymentMethod,
            sourceType: input.sourceType ?? "manual",
            rawInput: input.rawInput,
          },
        );
        await refresh();
        return {
          productId: result.productId ?? undefined,
          purchaseId: result.purchaseId ?? undefined,
          billId: result.billId ?? undefined,
          transactionId: result.transactionId ?? undefined,
        };
      }

      const now = new Date().toISOString();
      const totalCents = Math.round(input.quantity * input.unitCostCents);
      const existing =
        state.products.find(
          (product) => product.id === input.productId && product.trackStock,
        ) ??
        state.products.find(
          (product) =>
            product.trackStock &&
            normalizeName(product.name) === normalizeName(cleanName),
        );

      let product: Product;
      let products: Product[];
      if (existing) {
        const newStock = existing.stock + input.quantity;
        product = {
          ...existing,
          // O nome do produto já cadastrado é preservado; a compra só soma
          // estoque e recalcula o custo médio.
          name: existing.name,
          stock: newStock,
          costCents: Math.round(
            (existing.stock * existing.costCents + totalCents) / newStock,
          ),
          supplierId: input.supplierId ?? existing.supplierId,
        };
        products = state.products.map((item) =>
          item.id === existing.id ? product : item,
        );
      } else {
        const suggestedPrice = Math.max(
          100,
          Math.ceil((input.unitCostCents * 1.8) / 100) * 100,
        );
        product = {
          id: uid("product"),
          name: cleanName,
          unit: "un",
          unitPlural: "un",
          stock: input.quantity,
          minStock: 2,
          costCents: input.unitCostCents,
          priceCents: suggestedPrice,
          trackStock: true,
          supplierId: input.supplierId,
          createdAt: now,
        };
        products = [...state.products, product];
      }

      const logId = uid("log");
      const transactionId = input.paidNow ? uid("tx") : undefined;
      const billId = input.paidNow ? undefined : uid("bill");

      const log: InventoryLog = {
        id: logId,
        productId: product.id,
        direction: "in",
        quantity: input.quantity,
        unitCostCents: input.unitCostCents,
        transactionId,
        sourceType: input.sourceType ?? "manual",
        status: "processed",
        occurredAt: now,
      };

      const purchase: Purchase = {
        id: uid("purchase"),
        supplierId: input.supplierId,
        productId: product.id,
        productName: product.name,
        quantity: input.quantity,
        unitCostCents: input.unitCostCents,
        totalCents,
        billId,
        transactionId,
        inventoryLogId: logId,
        sourceType: input.sourceType ?? "manual",
        occurredAt: now,
        createdAt: now,
      };

      const transaction: Transaction | null = transactionId
        ? {
            id: transactionId,
            kind: "expense",
            description: `Compra: ${product.name}`,
            amountCents: totalCents,
            supplierId: input.supplierId,
            paymentMethod: input.paymentMethod,
            sourceType: input.sourceType ?? "manual",
            status: "processed",
            rawInput: input.rawInput,
            occurredAt: now,
            createdAt: now,
            inventoryLogId: logId,
          }
        : null;

      const bill: Bill | null = billId
        ? {
            id: billId,
            supplierId: input.supplierId,
            description: `Compra: ${product.name}`,
            amountCents: totalCents,
            dueDate: input.dueDate ?? todayDateOnly(),
            status: "open",
            paymentMethod: input.paymentMethod,
            sourceType: input.sourceType ?? "manual",
            createdAt: now,
          }
        : null;

      setState((previous) => ({
        ...previous,
        products,
        purchases: [purchase, ...previous.purchases],
        bills: bill ? [bill, ...previous.bills] : previous.bills,
        transactions: transaction
          ? [transaction, ...previous.transactions]
          : previous.transactions,
        inventoryLogs: [log, ...previous.inventoryLogs],
      }));

      return {
        productId: product.id,
        purchaseId: purchase.id,
        billId,
        transactionId,
      };
    },
    [refresh, state.products],
  );

  const addSupplier = useCallback(
    async (input: SupplierInput): Promise<Supplier> => {
      const name = input.name.trim();
      if (!name) throw new Error("Diga o nome do fornecedor.");
      if (
        state.suppliers.some(
          (supplier) => normalizeName(supplier.name) === normalizeName(name),
        )
      ) {
        throw new Error("Já existe um fornecedor com esse nome.");
      }

      const active = cloudRef.current;
      if (active) {
        const id = await saveSupplier(active.client, active.businessId, {
          name,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
        });
        const workspace = await refresh();
        const saved = workspace?.state.suppliers.find(
          (supplier) => supplier.id === id,
        );
        if (!saved) throw new Error("Não conseguimos carregar o fornecedor.");
        return saved;
      }

      const supplier: Supplier = {
        id: uid("supplier"),
        name,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setState((previous) => ({
        ...previous,
        suppliers: [...previous.suppliers, supplier],
      }));
      return supplier;
    },
    [refresh, state.suppliers],
  );

  const updateSupplier = useCallback(
    async (supplierId: string, input: SupplierInput): Promise<void> => {
      const name = input.name.trim();
      if (!name) throw new Error("Diga o nome do fornecedor.");
      if (
        state.suppliers.some(
          (supplier) =>
            supplier.id !== supplierId &&
            normalizeName(supplier.name) === normalizeName(name),
        )
      ) {
        throw new Error("Já existe um fornecedor com esse nome.");
      }

      const active = cloudRef.current;
      if (active) {
        await saveSupplier(active.client, active.businessId, {
          id: supplierId,
          name,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
        });
        await refresh();
        return;
      }

      setState((previous) => ({
        ...previous,
        suppliers: previous.suppliers.map((supplier) =>
          supplier.id === supplierId
            ? {
                ...supplier,
                name,
                phone: input.phone?.trim() || undefined,
                email: input.email?.trim() || undefined,
                notes: input.notes?.trim() || undefined,
              }
            : supplier,
        ),
      }));
    },
    [refresh, state.suppliers],
  );

  const deleteSupplier = useCallback(
    async (supplierId: string): Promise<void> => {
      const active = cloudRef.current;
      if (active) {
        await removeCloudSupplier(active.client, supplierId);
        await refresh();
        return;
      }

      setState((previous) => ({
        ...previous,
        suppliers: previous.suppliers.filter(
          (supplier) => supplier.id !== supplierId,
        ),
        products: previous.products.map((product) =>
          product.supplierId === supplierId
            ? { ...product, supplierId: undefined }
            : product,
        ),
        purchases: previous.purchases.map((purchase) =>
          purchase.supplierId === supplierId
            ? { ...purchase, supplierId: undefined }
            : purchase,
        ),
        bills: previous.bills.map((bill) =>
          bill.supplierId === supplierId
            ? { ...bill, supplierId: undefined }
            : bill,
        ),
      }));
    },
    [refresh],
  );

  const addBill = useCallback(
    async (input: BillInput): Promise<void> => {
      const description = input.description.trim();
      if (!description) throw new Error("Diga o que é a conta.");
      if (input.amountCents < 1) throw new Error("Informe um valor válido.");
      if (!input.dueDate) throw new Error("Escolha o vencimento.");

      const active = cloudRef.current;
      if (active) {
        await createCloudBill(active.client, active.businessId, {
          description,
          amountCents: input.amountCents,
          dueDate: input.dueDate,
          supplierId: input.supplierId,
          paymentMethod: input.paymentMethod,
        });
        await refresh();
        return;
      }

      const bill: Bill = {
        id: uid("bill"),
        supplierId: input.supplierId,
        description,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        status: "open",
        paymentMethod: input.paymentMethod,
        sourceType: "manual",
        createdAt: new Date().toISOString(),
      };
      setState((previous) => ({
        ...previous,
        bills: [bill, ...previous.bills],
      }));
    },
    [refresh],
  );

  const payBill = useCallback(
    async (billId: string, paymentMethod: PaymentMethod): Promise<void> => {
      const bill = state.bills.find((item) => item.id === billId);
      if (!bill) throw new Error("Conta não encontrada.");
      if (bill.status !== "open") throw new Error("Esta conta já foi paga.");

      const active = cloudRef.current;
      if (active) {
        await payCloudBill(active.client, {
          billId,
          paymentMethod,
        });
        await refresh();
        return;
      }

      const now = new Date().toISOString();
      const transactionId = uid("tx");
      const transaction: Transaction = {
        id: transactionId,
        kind: "expense",
        description: `Conta: ${bill.description}`,
        amountCents: bill.amountCents,
        supplierId: bill.supplierId,
        paymentMethod,
        sourceType: bill.sourceType,
        status: "processed",
        occurredAt: now,
        createdAt: now,
      };

      setState((previous) => ({
        ...previous,
        bills: previous.bills.map((item) =>
          item.id === billId
            ? {
                ...item,
                status: "paid",
                paidAt: now,
                paymentMethod,
                transactionId,
              }
            : item,
        ),
        transactions: [transaction, ...previous.transactions],
      }));
    },
    [refresh, state.bills],
  );

  const deleteBill = useCallback(
    async (billId: string): Promise<void> => {
      const bill = state.bills.find((item) => item.id === billId);
      if (!bill) throw new Error("Conta não encontrada.");
      if (bill.status !== "open") {
        throw new Error("Só é possível apagar contas em aberto.");
      }

      const active = cloudRef.current;
      if (active) {
        await removeCloudBill(active.client, billId);
        await refresh();
        return;
      }

      setState((previous) => ({
        ...previous,
        bills: previous.bills.filter((item) => item.id !== billId),
        purchases: previous.purchases.map((purchase) =>
          purchase.billId === billId
            ? { ...purchase, billId: undefined }
            : purchase,
        ),
      }));
    },
    [refresh, state.bills],
  );

  const importRows = useCallback(
    async (rows: ImportRow[]): Promise<ImportSummary> => {
      const active = cloudRef.current;
      if (active) {
        const summary = await importSpreadsheetRows(
          active.client,
          active.businessId,
          rows,
        );
        await refresh();
        return summary;
      }

      const now = new Date().toISOString();
      const suppliers = [...state.suppliers];
      const products = [...state.products];
      const supplierIdByName = new Map(
        suppliers.map((supplier) => [
          normalizeName(supplier.name),
          supplier.id,
        ]),
      );
      const productIdByName = new Map(
        state.products.map((product) => [
          normalizeName(product.name),
          product.id,
        ]),
      );
      const transactions = [...state.transactions];
      const bills = [...state.bills];
      const purchases = [...state.purchases];
      const inventoryLogs = [...state.inventoryLogs];
      let imported = 0;

      const ensureSupplier = (name?: string): string | undefined => {
        if (!name?.trim()) return undefined;
        const key = normalizeName(name);
        const existing = supplierIdByName.get(key);
        if (existing) return existing;
        const supplier: Supplier = {
          id: uid("supplier"),
          name: name.trim(),
          createdAt: now,
        };
        suppliers.push(supplier);
        supplierIdByName.set(key, supplier.id);
        return supplier.id;
      };

      const applyStockToProduct = (
        row: ImportRow,
        supplierId?: string,
      ): string | undefined => {
        if (!row.applyStock) return undefined;
        const name = (row.productName ?? row.description).trim();
        if (!name) return undefined;
        const key = normalizeName(name);
        const quantity = row.quantity ?? 1;
        const existingId = productIdByName.get(key);
        const product = existingId
          ? products.find((item) => item.id === existingId)
          : undefined;

        if (product) {
          if (!product.trackStock) return product.id;
          const newStock = product.stock + quantity;
          const updated: Product = {
            ...product,
            stock: newStock,
            costCents: Math.round(
              (product.stock * product.costCents + row.amountCents) /
                Math.max(0.0001, newStock),
            ),
            supplierId: supplierId ?? product.supplierId,
          };
          const index = products.findIndex((item) => item.id === product.id);
          products[index] = updated;
          return updated.id;
        }

        const unit = row.unit?.trim() || "un";
        const unitCost = Math.round(
          row.amountCents / Math.max(0.0001, quantity),
        );
        const created: Product = {
          id: uid("product"),
          name,
          unit,
          unitPlural: unit,
          stock: quantity,
          minStock: 2,
          costCents: unitCost,
          priceCents: Math.max(100, Math.ceil((unitCost * 1.8) / 100) * 100),
          trackStock: true,
          supplierId,
          createdAt: now,
        };
        products.push(created);
        productIdByName.set(key, created.id);
        return created.id;
      };

      const addTransaction = (
        row: ImportRow,
        description: string,
        kind: Transaction["kind"],
        supplierId?: string,
        productId?: string,
      ): string => {
        const id = uid("tx");
        transactions.unshift({
          id,
          kind,
          description,
          amountCents: row.amountCents,
          quantity: kind === "sale" ? row.quantity : undefined,
          productId,
          supplierId,
          paymentMethod: row.paymentMethod,
          sourceType: row.sourceType ?? "spreadsheet_import",
          status: "processed",
          occurredAt: row.occurredAt,
          createdAt: now,
        });
        return id;
      };

      for (const row of rows) {
        if (
          row.kind === "sale" ||
          row.kind === "expense" ||
          row.kind === "withdrawal"
        ) {
          addTransaction(
            row,
            row.description,
            row.kind,
            undefined,
            row.kind === "sale" && row.productName
              ? productIdByName.get(normalizeName(row.productName))
              : undefined,
          );
          imported += 1;
          continue;
        }

        if (row.kind === "purchase") {
          const supplierId = ensureSupplier(row.supplierName);
          const productName = row.productName ?? row.description;
          const productId =
            applyStockToProduct(row, supplierId) ??
            productIdByName.get(normalizeName(productName));
          const quantity = row.quantity ?? 1;
          const transactionId = row.paid
            ? addTransaction(
                row,
                `Compra: ${productName}`,
                "expense",
                supplierId,
                productId,
              )
            : undefined;
          let billId: string | undefined;
          if (!row.paid) {
            billId = uid("bill");
            bills.unshift({
              id: billId,
              supplierId,
              description: `Compra: ${productName}`,
              amountCents: row.amountCents,
              // Mesmo prazo padrão da compra lançada pela interface.
              dueDate:
                row.dueDate ?? addDaysToDateOnly(todayDateOnly(), 14),
              status: "open",
              paymentMethod: row.paymentMethod,
              sourceType: row.sourceType ?? "spreadsheet_import",
              createdAt: now,
            });
          }
          purchases.unshift({
            id: uid("purchase"),
            supplierId,
            productId,
            productName,
            quantity,
            unitCostCents: Math.round(row.amountCents / quantity),
            totalCents: row.amountCents,
            billId,
            transactionId,
            sourceType: row.sourceType ?? "spreadsheet_import",
            occurredAt: row.occurredAt,
            createdAt: now,
          });
          if (row.applyStock && productId) {
            inventoryLogs.unshift({
              id: uid("log"),
              productId,
              direction: "in",
              quantity,
              unitCostCents: Math.round(row.amountCents / quantity),
              transactionId,
              sourceType: row.sourceType ?? "spreadsheet_import",
              status: "processed",
              occurredAt: row.occurredAt,
            });
          }
          imported += 1;
          continue;
        }

        if (row.kind === "bill") {
          const supplierId = ensureSupplier(row.supplierName);
          const transactionId = row.paid
            ? addTransaction(
                row,
                `Conta: ${row.description}`,
                "expense",
                supplierId,
              )
            : undefined;
          bills.unshift({
            id: uid("bill"),
            supplierId,
            description: row.description,
            amountCents: row.amountCents,
            // Mesmo prazo padrão da conta criada pela interface.
            dueDate: row.dueDate ?? addDaysToDateOnly(todayDateOnly(), 7),
            status: row.paid ? "paid" : "open",
            paidAt: row.paid ? row.occurredAt : undefined,
            paymentMethod: row.paymentMethod,
            transactionId,
            sourceType: row.sourceType ?? "spreadsheet_import",
            createdAt: now,
          });
          imported += 1;
        }
      }

      setState((previous) => ({
        ...previous,
        products,
        suppliers,
        transactions,
        bills,
        purchases,
        inventoryLogs,
      }));

      return {
        imported,
        skipped: Math.max(0, rows.length - imported),
        errors: [],
      };
    },
    [refresh, state.bills, state.products, state.purchases, state.suppliers, state.transactions],
  );

  const reviewPending = useCallback(
    async (input: ReviewInput): Promise<void> => {
      const pending = state.transactions.find(
        (transaction) =>
          transaction.id === input.transactionId &&
          transaction.status === "pending_review",
      );
      if (!pending) throw new Error("Este rascunho não existe mais.");
      const product = state.products.find(
        (item) => item.id === input.productId,
      );
      if (!product) throw new Error("Escolha o produto para confirmar.");
      if (input.quantity < 1) throw new Error("Informe a quantidade.");
      if (product.trackStock && input.quantity > product.stock) {
        throw new Error("Essa quantidade não está disponível no estoque.");
      }
      if (input.amountCents < 1) throw new Error("Informe um valor válido.");

      const active = cloudRef.current;
      if (active) {
        await confirmPendingSale(active.client, {
          transactionId: pending.id,
          productId: product.id,
          quantity: input.quantity,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
        });
        await refresh();
        return;
      }

      const now = new Date().toISOString();
      const logId = product.trackStock ? uid("log") : undefined;
      const transaction: Transaction = {
        ...pending,
        description: product.name,
        productId: product.id,
        quantity: input.quantity,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        status: "processed",
        reviewedAt: now,
        inventoryLogId: logId,
      };
      const log: InventoryLog | null = logId
        ? {
            id: logId,
            productId: product.id,
            direction: "out",
            quantity: input.quantity,
            transactionId: pending.id,
            sourceType: pending.sourceType,
            status: "processed",
            occurredAt: now,
          }
        : null;

      setState((previous) => ({
        ...previous,
        products: product.trackStock
          ? previous.products.map((item) =>
              item.id === product.id
                ? { ...item, stock: Math.max(0, item.stock - input.quantity) }
                : item,
            )
          : previous.products,
        transactions: previous.transactions.map((item) =>
          item.id === pending.id ? transaction : item,
        ),
        inventoryLogs: log
          ? [log, ...previous.inventoryLogs]
          : previous.inventoryLogs,
      }));
    },
    [refresh, state.products, state.transactions],
  );

  const discardPending = useCallback(
    async (transactionId: string): Promise<void> => {
      const active = cloudRef.current;
      if (active) {
        await removeTransaction(active.client, transactionId);
        await refresh();
        return;
      }

      setState((previous) => ({
        ...previous,
        transactions: previous.transactions.filter(
          (transaction) =>
            !(
              transaction.id === transactionId &&
              transaction.status === "pending_review"
            ),
        ),
      }));
    },
    [refresh],
  );

  const updateProduct = useCallback(
    async (
      productId: string,
      input: { name: string; priceCents: number; minStock: number },
    ): Promise<void> => {
      const cleanName = input.name.trim();
      if (!cleanName) throw new Error("Diga o nome do produto.");

      const active = cloudRef.current;
      if (active) {
        await updateCloudProduct(active.client, {
          productId,
          name: cleanName,
          priceCents: Math.max(0, input.priceCents),
          minStock: Math.max(0, Math.round(input.minStock)),
        });
        await refresh();
        return;
      }

      setState((previous) => ({
        ...previous,
        products: previous.products.map((product) =>
          product.id === productId
            ? {
                ...product,
                name: cleanName,
                priceCents: Math.max(0, input.priceCents),
                minStock: Math.max(0, Math.round(input.minStock)),
              }
            : product,
        ),
      }));
    },
    [refresh],
  );

  const setProductSupplier = useCallback(
    async (productId: string, supplierId?: string): Promise<void> => {
      const active = cloudRef.current;
      if (active) {
        await setCloudProductSupplier(
          active.client,
          productId,
          supplierId ?? null,
        );
        await refresh();
        return;
      }

      setState((previous) => ({
        ...previous,
        products: previous.products.map((product) =>
          product.id === productId
            ? { ...product, supplierId }
            : product,
        ),
      }));
    },
    [refresh],
  );

  const deleteTransaction = useCallback(
    async (transactionId: string): Promise<void> => {
      const active = cloudRef.current;
      if (active) {
        await removeTransaction(active.client, transactionId);
        await refresh();
        return;
      }

      setState((previous) => {
        const transaction = previous.transactions.find(
          (item) => item.id === transactionId,
        );
        if (!transaction) return previous;

        let products = previous.products;
        let inventoryLogs = previous.inventoryLogs;

        if (transaction.inventoryLogId) {
          const log = previous.inventoryLogs.find(
            (item) => item.id === transaction.inventoryLogId,
          );
          if (log) {
            products = products.map((product) => {
              if (product.id !== log.productId) return product;
              if (transaction.kind === "sale") {
                return { ...product, stock: product.stock + log.quantity };
              }
              if (log.direction === "in") {
                return {
                  ...product,
                  stock: Math.max(0, product.stock - log.quantity),
                };
              }
              return product;
            });
            inventoryLogs = inventoryLogs.filter(
              (item) => item.id !== transaction.inventoryLogId,
            );
          }
        }

        return {
          ...previous,
          products,
          inventoryLogs,
          bills: previous.bills.map((bill) =>
            bill.transactionId === transactionId && bill.status === "paid"
              ? {
                  ...bill,
                  status: "open",
                  paidAt: undefined,
                  paymentMethod: undefined,
                  transactionId: undefined,
                }
              : bill,
          ),
          transactions: previous.transactions.filter(
            (item) => item.id !== transactionId,
          ),
        };
      });
    },
    [refresh],
  );

  const setSegment = useCallback(
    async (segmentId: SegmentId): Promise<void> => {
      const active = cloudRef.current;
      if (!active) {
        setState(createSeedState(segmentId));
        return;
      }

      try {
        const workspace = await replaceWorkspace(
          active.client,
          active.businessId,
          segmentId,
        );
        cloudRef.current = {
          client: active.client,
          businessId: workspace.business.id,
        };
        setCloudBusiness(workspace.business);
        setState(workspace.state);
        setCloudMessage(null);
      } catch (error) {
        setCloudMessage(describeCloudError(error));
        throw error;
      }
    },
    [],
  );

  const resetDemo = useCallback(async (): Promise<void> => {
    const active = cloudRef.current;
    if (!active) {
      setState((previous) => createSeedState(previous.segmentId));
      return;
    }

    try {
      const workspace = await replaceWorkspace(
        active.client,
        active.businessId,
        state.segmentId,
      );
      cloudRef.current = {
        client: active.client,
        businessId: workspace.business.id,
      };
      setCloudBusiness(workspace.business);
      setState(workspace.state);
      setCloudMessage(null);
    } catch (error) {
      setCloudMessage(describeCloudError(error));
      throw error;
    }
  }, [state.segmentId]);

  const entrarNaLojaWhatsapp = useCallback(async (): Promise<void> => {
    const active = cloudRef.current;
    if (!active) {
      throw new Error("Conecte à nuvem para abrir a loja do WhatsApp.");
    }

    try {
      const workspace = await abrirLojaWhatsapp(active.client);
      cloudRef.current = {
        client: active.client,
        businessId: workspace.business.id,
      };
      lembrarLojaWhatsapp(true);
      setCloudBusiness(workspace.business);
      setState(workspace.state);
      setCloudMessage(null);
    } catch (error) {
      setCloudMessage(describeCloudError(error));
      throw error;
    }
  }, []);

  const voltarParaMinhaLoja = useCallback(async (): Promise<void> => {
    const active = cloudRef.current;
    if (!active) return;

    try {
      const workspace = await openWorkspace(active.client, state.segmentId);
      cloudRef.current = {
        client: active.client,
        businessId: workspace.business.id,
      };
      lembrarLojaWhatsapp(false);
      setCloudBusiness(workspace.business);
      setState(workspace.state);
      setCloudMessage(null);
    } catch (error) {
      setCloudMessage(describeCloudError(error));
      throw error;
    }
  }, [state.segmentId]);

  const carregarWhatsapp = useCallback(async (): Promise<DadosWhatsapp> => {
    const active = cloudRef.current;
    if (!active) return { movimentos: [], ofertas: [] };
    return carregarDadosWhatsapp(active.client, active.businessId);
  }, []);

  const createAudioDraft = useCallback(
    async (input: AudioDraftInput): Promise<Transaction> => {
      const product = state.products.find(
        (item) => item.id === input.productId,
      );
      if (!product) throw new Error("Escolha o item que você vendeu.");
      if (input.quantity < 1) throw new Error("Informe a quantidade.");
      if (product.trackStock && input.quantity > product.stock) {
        throw new Error("Essa quantidade não está disponível no estoque.");
      }
      if (input.amountCents < 1) throw new Error("Informe um valor válido.");

      const rawInput =
        input.transcript.trim() ||
        "Áudio gravado no navegador sem transcrição automática.";

      const active = cloudRef.current;
      if (active) {
        const transactionId = await createPendingSale(
          active.client,
          active.businessId,
          {
            productId: product.id,
            productName: product.name,
            quantity: input.quantity,
            amountCents: input.amountCents,
            paymentMethod: input.paymentMethod,
            sourceType: "audio_transcription",
            rawInput,
            aiConfidence: input.aiConfidence,
          },
        );
        const workspace = await refresh();
        const created = workspace?.state.transactions.find(
          (transaction) => transaction.id === transactionId,
        );
        if (!created) {
          throw new Error(
            "O rascunho foi criado, mas não conseguimos carregá-lo agora.",
          );
        }
        return created;
      }

      const now = new Date().toISOString();
      const transaction: Transaction = {
        id: uid("tx"),
        kind: "sale",
        description: product.name,
        productId: product.id,
        quantity: input.quantity,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        sourceType: "audio_transcription",
        status: "pending_review",
        aiConfidence: input.aiConfidence,
        rawInput,
        occurredAt: now,
        createdAt: now,
      };
      setState((previous) => ({
        ...previous,
        transactions: [transaction, ...previous.transactions],
      }));
      return transaction;
    },
    [refresh, state.products],
  );

  const simulatePending = useCallback(async (): Promise<Transaction | null> => {
    const segment = SEGMENTS[state.segmentId];
    const preferredId = `${state.segmentId}-${segment.pending.productKey}`;
    const available = state.products.filter(
      (product) => !product.trackStock || product.stock > 0,
    );
    const product =
      available.find((item) => item.id === preferredId) ?? available[0];
    if (!product) return null;

    const quantity = product.trackStock
      ? Math.min(segment.pending.quantity, product.stock)
      : segment.pending.quantity;
    const amountCents =
      product.id === preferredId
        ? segment.pending.amountCents
        : product.priceCents * quantity;

    return createAudioDraft({
      productId: product.id,
      quantity,
      amountCents,
      transcript: segment.pending.rawInput,
      aiConfidence: segment.pending.aiConfidence,
    });
  }, [createAudioDraft, state.products, state.segmentId]);

  const pendingTransactions = useMemo(
    () =>
      state.transactions
        .filter((transaction) => transaction.status === "pending_review")
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [state.transactions],
  );

  const lowStockProducts = useMemo(
    () =>
      state.products
        .filter(
          (product) =>
            product.trackStock && product.stock <= product.minStock,
        )
        .sort((a, b) => {
          const aRatio = a.minStock > 0 ? a.stock / a.minStock : a.stock;
          const bRatio = b.minStock > 0 ? b.stock / b.minStock : b.stock;
          return aRatio - bRatio;
        }),
    [state.products],
  );

  const openBills = useMemo(
    () =>
      state.bills
        .filter((bill) => bill.status === "open")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [state.bills],
  );

  const totals = useMemo(() => {
    let todayInCents = 0;
    let todayOutCents = 0;
    let cashCents = 0;
    let todayCount = 0;

    for (const transaction of state.transactions) {
      if (transaction.status !== "processed") continue;
      if (transaction.kind === "sale") {
        cashCents += transaction.amountCents;
      } else {
        cashCents -= transaction.amountCents;
      }

      if (isToday(new Date(transaction.occurredAt))) {
        todayCount += 1;
        if (transaction.kind === "sale") {
          todayInCents += transaction.amountCents;
        } else {
          todayOutCents += transaction.amountCents;
        }
      }
    }

    return { todayInCents, todayOutCents, cashCents, todayCount };
  }, [state.transactions]);

  const segment = useMemo(
    () => SEGMENTS[state.segmentId],
    [state.segmentId],
  );

  const business = useMemo(
    () =>
      cloudBusiness && cloudBusiness.segment === state.segmentId
        ? cloudBusiness
        : createBusiness(state.segmentId),
    [cloudBusiness, state.segmentId],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      business,
      segment,
      segments: SEGMENT_LIST,
      products: state.products,
      transactions: state.transactions,
      inventoryLogs: state.inventoryLogs,
      suppliers: state.suppliers,
      purchases: state.purchases,
      bills: state.bills,
      openBills,
      pendingTransactions,
      lowStockProducts,
      todayInCents: totals.todayInCents,
      todayOutCents: totals.todayOutCents,
      cashCents: totals.cashCents,
      todayCount: totals.todayCount,
      mode: cloudStatus === "ready" ? "cloud" : "local",
      cloudStatus,
      cloudMessage,
      ready,
      retryCloud,
      recordSale,
      recordExpense,
      recordWithdrawal,
      addStock,
      reviewPending,
      discardPending,
      updateProduct,
      setProductSupplier,
      deleteTransaction,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      registerPurchase,
      addBill,
      payBill,
      deleteBill,
      importRows,
      setSegment,
      resetDemo,
      createAudioDraft,
      simulatePending,
      naLojaWhatsapp: business.id === LOJA_WHATSAPP_ID,
      entrarNaLojaWhatsapp,
      voltarParaMinhaLoja,
      carregarWhatsapp,
    }),
    [
      business,
      segment,
      state.products,
      state.transactions,
      state.inventoryLogs,
      state.suppliers,
      state.purchases,
      state.bills,
      openBills,
      pendingTransactions,
      lowStockProducts,
      totals,
      cloudStatus,
      cloudMessage,
      ready,
      retryCloud,
      recordSale,
      recordExpense,
      recordWithdrawal,
      addStock,
      reviewPending,
      discardPending,
      updateProduct,
      setProductSupplier,
      deleteTransaction,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      registerPurchase,
      addBill,
      payBill,
      deleteBill,
      importRows,
      setSegment,
      resetDemo,
      createAudioDraft,
      simulatePending,
      entrarNaLojaWhatsapp,
      voltarParaMinhaLoja,
      carregarWhatsapp,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp precisa estar dentro de AppProvider.");
  }
  return context;
}
