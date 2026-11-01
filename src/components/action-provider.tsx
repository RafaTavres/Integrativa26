"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SaleSheet } from "./sale-sheet";
import { ExpenseSheet } from "./expense-sheet";
import { StockEntrySheet } from "./stock-entry-sheet";
import { TransactionDetailSheet } from "./transaction-detail-sheet";
import { ProductEditSheet } from "./product-edit-sheet";
import { MoreSheet } from "./more-sheet";
import { RegisterSheet } from "./register-sheet";
import { ReceiptSheet } from "./receipt-sheet";

type SheetState =
  | { type: "none" }
  | { type: "register" }
  | { type: "receipt" }
  | { type: "sale"; pendingId?: string }
  | { type: "expense" }
  | { type: "stock"; productId?: string }
  | { type: "review"; transactionId: string }
  | { type: "transaction"; transactionId: string }
  | { type: "edit-product"; productId: string }
  | { type: "more" };

interface ActionsContextValue {
  openRegister: () => void;
  openReceipt: () => void;
  openSale: () => void;
  openExpense: () => void;
  openStock: (productId?: string) => void;
  openReview: (transactionId: string) => void;
  openTransaction: (transactionId: string) => void;
  openEditProduct: (productId: string) => void;
  openMore: () => void;
  close: () => void;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

export function ActionProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetState>({ type: "none" });

  const close = useCallback(() => setSheet({ type: "none" }), []);
  const openRegister = useCallback(() => setSheet({ type: "register" }), []);
  const openReceipt = useCallback(() => setSheet({ type: "receipt" }), []);
  const openSale = useCallback(() => setSheet({ type: "sale" }), []);
  const openExpense = useCallback(() => setSheet({ type: "expense" }), []);
  const openStock = useCallback(
    (productId?: string) => setSheet({ type: "stock", productId }),
    [],
  );
  const openReview = useCallback(
    (transactionId: string) => setSheet({ type: "review", transactionId }),
    [],
  );
  const openTransaction = useCallback(
    (transactionId: string) => setSheet({ type: "transaction", transactionId }),
    [],
  );
  const openEditProduct = useCallback(
    (productId: string) => setSheet({ type: "edit-product", productId }),
    [],
  );
  const openMore = useCallback(() => setSheet({ type: "more" }), []);

  const value = useMemo(
    () => ({
      openRegister,
      openReceipt,
      openSale,
      openExpense,
      openStock,
      openReview,
      openTransaction,
      openEditProduct,
      openMore,
      close,
    }),
    [
      openRegister,
      openReceipt,
      openSale,
      openExpense,
      openStock,
      openReview,
      openTransaction,
      openEditProduct,
      openMore,
      close,
    ],
  );

  return (
    <ActionsContext.Provider value={value}>
      {children}

      {sheet.type === "register" ? (
        <RegisterSheet onClose={close} />
      ) : null}
      {sheet.type === "receipt" ? <ReceiptSheet onClose={close} /> : null}
      {sheet.type === "sale" ? (
        <SaleSheet onClose={close} pendingId={sheet.pendingId} />
      ) : null}
      {sheet.type === "review" ? (
        <SaleSheet onClose={close} pendingId={sheet.transactionId} />
      ) : null}
      {sheet.type === "expense" ? <ExpenseSheet onClose={close} /> : null}
      {sheet.type === "stock" ? (
        <StockEntrySheet onClose={close} initialProductId={sheet.productId} />
      ) : null}
      {sheet.type === "transaction" ? (
        <TransactionDetailSheet
          transactionId={sheet.transactionId}
          onClose={close}
        />
      ) : null}
      {sheet.type === "edit-product" ? (
        <ProductEditSheet productId={sheet.productId} onClose={close} />
      ) : null}
      {sheet.type === "more" ? <MoreSheet onClose={close} /> : null}
    </ActionsContext.Provider>
  );
}

export function useActions(): ActionsContextValue {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error("useActions precisa estar dentro de ActionProvider.");
  }
  return context;
}
