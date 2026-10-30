"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createBusiness, createSeedState } from "./seed";
import { SEGMENTS, SEGMENT_LIST, isSegmentId } from "./segments";
import type { SegmentProfile } from "./segments";
import type {
  Business,
  DemoState,
  InventoryLog,
  PaymentMethod,
  Product,
  SegmentId,
  Transaction,
} from "./types";

const STORAGE_KEY = "meu-caixa:demo:v2";

interface SaleInput {
  productId: string;
  quantity: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
}

interface ExpenseInput {
  description: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
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
  recordSale: (input: SaleInput) => Transaction;
  recordExpense: (input: ExpenseInput) => Transaction;
  addStock: (input: StockInput) => {
    product: Product;
    transaction?: Transaction;
  };
  reviewPending: (input: ReviewInput) => Transaction;
  discardPending: (transactionId: string) => void;
  updateProduct: (
    productId: string,
    input: { name: string; priceCents: number; minStock: number },
  ) => void;
  deleteTransaction: (transactionId: string) => void;
  setSegment: (segmentId: SegmentId) => void;
  resetDemo: () => void;
  simulatePending: () => Transaction | null;
}

const AppContext = createContext<AppContextValue | null>(null);

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() =>
    createSeedState("confeitaria"),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.removeItem("meu-caixa:demo:v1");
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isDemoState(parsed)) setState(parsed);
      }
    } catch {
      // Um storage corrompido não deve impedir o app de abrir.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Modo privado ou storage cheio: o app continua funcionando só na sessão.
    }
  }, [state, hydrated]);

  const recordSale = useCallback((input: SaleInput): Transaction => {
    const product = state.products.find((item) => item.id === input.productId);
    if (!product) throw new Error("Produto não encontrado.");
    if (input.quantity < 1) throw new Error("Informe a quantidade.");
    if (product.trackStock && input.quantity > product.stock) {
      throw new Error("Essa quantidade não está disponível no estoque.");
    }
    if (input.amountCents < 1) throw new Error("Informe um valor válido.");

    const now = new Date().toISOString();
    const logId = product.trackStock ? uid("log") : undefined;
    const transactionId = uid("tx");
    const transaction: Transaction = {
      id: transactionId,
      kind: "sale",
      description: product.name,
      productId: product.id,
      quantity: input.quantity,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      sourceType: "manual",
      status: "processed",
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
          sourceType: "manual",
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

    return transaction;
  }, [state.products]);

  const recordExpense = useCallback((input: ExpenseInput): Transaction => {
    if (!input.description.trim()) throw new Error("Diga o que foi o gasto.");
    if (input.amountCents < 1) throw new Error("Informe um valor válido.");

    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: uid("tx"),
      kind: "expense",
      description: input.description.trim(),
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

    return transaction;
  }, []);

  const addStock = useCallback(
    (input: StockInput): { product: Product; transaction?: Transaction } => {
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

      const now = new Date().toISOString();
      const unitCostCents = Math.round(input.totalCostCents / input.quantity);
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
    [state.products],
  );

  const reviewPending = useCallback(
    (input: ReviewInput): Transaction => {
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

      return transaction;
    },
    [state.products, state.transactions],
  );

  const discardPending = useCallback((transactionId: string) => {
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
  }, []);

  const updateProduct = useCallback(
    (
      productId: string,
      input: { name: string; priceCents: number; minStock: number },
    ) => {
      const cleanName = input.name.trim();
      if (!cleanName) throw new Error("Diga o nome do produto.");
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
    [],
  );

  const deleteTransaction = useCallback((transactionId: string) => {
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
  }, []);

  const setSegment = useCallback((segmentId: SegmentId) => {
    setState(createSeedState(segmentId));
  }, []);

  const resetDemo = useCallback(() => {
    setState((previous) => createSeedState(previous.segmentId));
  }, []);

  const simulatePending = useCallback((): Transaction | null => {
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
  }, [state.products, state.segmentId]);

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
    () => createBusiness(state.segmentId),
    [state.segmentId],
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
