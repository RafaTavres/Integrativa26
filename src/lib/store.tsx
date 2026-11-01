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
import {
  CloudError,
  confirmPendingSale,
  createPendingSale,
  ensureAnonymousSession,
  loadWorkspace,
  openWorkspace,
  registerExpense,
  registerSale,
  registerStockEntry,
  removeTransaction,
  replaceWorkspace,
  updateProduct as updateCloudProduct,
  type Workspace,
} from "./supabase/workspace";
import type {
  Business,
  DemoState,
  InventoryLog,
  PaymentMethod,
  Product,
  SegmentId,
  SourceType,
  Transaction,
} from "./types";

const STORAGE_KEY = "meu-caixa:demo:v2";
const LEGACY_STORAGE_KEY = "meu-caixa:demo:v1";

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

export type StoreMode = "local" | "cloud";
export type CloudStatus = "off" | "connecting" | "ready" | "error";

interface AppContextValue {
  business: Business;
  segment: SegmentProfile;
  segments: SegmentProfile[];
  products: Product[];
  transactions: Transaction[];
  inventoryLogs: InventoryLog[];
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
  deleteTransaction: (transactionId: string) => Promise<void>;
  setSegment: (segmentId: SegmentId) => Promise<void>;
  resetDemo: () => Promise<void>;
  simulatePending: () => Promise<Transaction | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

interface CloudConnection {
  client: SupabaseClient;
  businessId: string;
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
    state.version === 2 &&
    isSegmentId(state.segmentId) &&
    Array.isArray(state.products) &&
    Array.isArray(state.transactions) &&
    Array.isArray(state.inventoryLogs) &&
    state.products.every(
      (product) =>
        product && typeof product === "object" && "trackStock" in product,
    )
  );
}

function readStoredState(): DemoState | null {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isDemoState(parsed) ? parsed : null;
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
        const workspace = await openWorkspace(client, preferredSegment);
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
            product.name.toLowerCase() === cleanName.toLowerCase(),
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
            (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
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

    const active = cloudRef.current;
    if (active) {
      const transactionId = await createPendingSale(
        active.client,
        active.businessId,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          amountCents,
          sourceType: "audio_transcription",
          rawInput: segment.pending.rawInput,
          aiConfidence: segment.pending.aiConfidence,
        },
      );
      const workspace = await refresh();
      return (
        workspace?.state.transactions.find(
          (transaction) => transaction.id === transactionId,
        ) ?? null
      );
    }

    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: uid("tx"),
      kind: "sale",
      description: product.name,
      productId: product.id,
      quantity,
      amountCents,
      sourceType: "audio_transcription",
      status: "pending_review",
      aiConfidence: segment.pending.aiConfidence,
      rawInput: segment.pending.rawInput,
      occurredAt: now,
      createdAt: now,
    };
    setState((previous) => ({
      ...previous,
      transactions: [transaction, ...previous.transactions],
    }));
    return transaction;
  }, [refresh, state.products, state.segmentId]);

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
      addStock,
      reviewPending,
      discardPending,
      updateProduct,
      deleteTransaction,
      setSegment,
      resetDemo,
      simulatePending,
    }),
    [
      business,
      segment,
      state.products,
      state.transactions,
      state.inventoryLogs,
      pendingTransactions,
      lowStockProducts,
      totals,
      cloudStatus,
      cloudMessage,
      ready,
      retryCloud,
      recordSale,
      recordExpense,
      addStock,
      reviewPending,
      discardPending,
      updateProduct,
      deleteTransaction,
      setSegment,
      resetDemo,
      simulatePending,
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
