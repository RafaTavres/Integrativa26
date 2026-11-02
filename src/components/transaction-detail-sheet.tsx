"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  Trash2,
  Undo2,
} from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { dayLabel, formatBRL, formatTime } from "@/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  SOURCE_TYPE_LABELS,
  TRANSACTION_KIND_LABELS,
} from "@/lib/types";

interface TransactionDetailSheetProps {
  transactionId: string;
  onClose: () => void;
}

export function TransactionDetailSheet({
  transactionId,
  onClose,
}: TransactionDetailSheetProps) {
  const { transactions, suppliers, deleteTransaction } = useApp();
  const { toast } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const transaction = transactions.find((item) => item.id === transactionId);
  if (!transaction) return null;

  const isSale = transaction.kind === "sale";
  const isWithdrawal = transaction.kind === "withdrawal";
  const supplier = transaction.supplierId
    ? suppliers.find((item) => item.id === transaction.supplierId)
    : undefined;
  const canRestoreStock =
    isSale &&
    transaction.status === "processed" &&
    Boolean(transaction.inventoryLogId);
  const showPayment =
    transaction.paymentMethod && transaction.paymentMethod !== "other";
  const showSource = transaction.sourceType !== "manual";
  const showQuantity = Boolean(transaction.quantity && transaction.quantity > 1);
  const showRows =
    showQuantity || showPayment || showSource || Boolean(supplier);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteTransaction(transactionId);
      toast("Registro apagado.");
      onClose();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não conseguimos apagar.",
        "info",
      );
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const iconTone = isSale
    ? "bg-sage-soft text-sage-dark"
    : isWithdrawal
      ? "bg-mustard-soft text-mustard-dark"
      : "bg-terracotta-soft text-terracotta-dark";
  const amountTone = isSale
    ? "text-sage-dark"
    : isWithdrawal
      ? "text-mustard-dark"
      : "text-ink";

  return (
    <Sheet
      title={TRANSACTION_KIND_LABELS[transaction.kind]}
      eyebrow={isWithdrawal ? "Retirada" : undefined}
      onClose={onClose}
    >
      <div className="animate-rise">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-11 flex-none place-items-center rounded-[4px] ${iconTone}`}
          >
            {isSale ? (
              <ArrowDownLeft className="size-5" strokeWidth={1.9} />
            ) : isWithdrawal ? (
              <HandCoins className="size-5" strokeWidth={1.9} />
            ) : (
              <ArrowUpRight className="size-5" strokeWidth={1.9} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold leading-tight text-ink">
              {transaction.description}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {dayLabel(transaction.occurredAt)},{" "}
              {formatTime(transaction.occurredAt)}
            </p>
          </div>
        </div>

        <p
          className={`mt-5 text-[2.5rem] font-extrabold leading-none tracking-tight tabular ${amountTone}`}
        >
          {isSale ? "+" : "−"} {formatBRL(transaction.amountCents)}
        </p>

        {isWithdrawal ? (
          <p className="mt-3 rounded-[4px] border border-mustard/35 bg-mustard-soft/70 p-3 text-[0.6875rem] leading-relaxed text-ink/80">
            Retirada é dinheiro que saiu do caixa para você. Não entra como
            gasto do negócio nem vira conta a pagar, mas aparece nas análises.
          </p>
        ) : null}

        {showRows ? (
          <dl className="mt-5 divide-y divide-line rounded-[4px] border border-line bg-cream text-sm">
            {showQuantity ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Quantidade</dt>
                <dd className="font-semibold text-ink">
                  {transaction.quantity}
                </dd>
              </div>
            ) : null}
            {supplier ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Fornecedor</dt>
                <dd className="text-right font-semibold text-ink">
                  {supplier.name}
                </dd>
              </div>
            ) : null}
            {showPayment && transaction.paymentMethod ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Pagamento</dt>
                <dd className="font-semibold text-ink">
                  {PAYMENT_METHOD_LABELS[transaction.paymentMethod]}
                </dd>
              </div>
            ) : null}
            {showSource ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Origem</dt>
                <dd className="text-right font-semibold text-ink">
                  {SOURCE_TYPE_LABELS[transaction.sourceType]}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-6 border-t border-line pt-4">
          {confirmingDelete ? (
            <div className="animate-rise rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3">
              <p className="text-sm font-semibold text-terracotta-dark">
                Apagar este registro?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/75">
                Não dá para desfazer.
                {canRestoreStock ? " O estoque volta." : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="btn btn-secondary h-10 flex-1 text-xs"
                >
                  <Undo2 className="size-4" strokeWidth={2} />
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-busy={deleting || undefined}
                  className="btn h-10 flex-1 bg-terracotta-dark text-xs text-cream"
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                  {deleting ? "Apagando…" : "Apagar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="btn btn-ghost h-10 px-2 text-xs font-semibold text-terracotta-dark"
            >
              <Trash2 className="size-4" strokeWidth={2} />
              Apagar registro
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
