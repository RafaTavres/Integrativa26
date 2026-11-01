"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Trash2, Undo2 } from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { dayLabel, formatBRL, formatTime } from "@/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  SOURCE_TYPE_LABELS,
} from "@/lib/types";

interface TransactionDetailSheetProps {
  transactionId: string;
  onClose: () => void;
}

export function TransactionDetailSheet({
  transactionId,
  onClose,
}: TransactionDetailSheetProps) {
  const { transactions, deleteTransaction } = useApp();
  const { toast } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const transaction = transactions.find((item) => item.id === transactionId);
  if (!transaction) return null;

  const isSale = transaction.kind === "sale";
  const canRestoreStock =
    isSale &&
    transaction.status === "processed" &&
    Boolean(transaction.inventoryLogId);
  const showPayment =
    transaction.paymentMethod && transaction.paymentMethod !== "other";
  const showSource = transaction.sourceType !== "manual";
  const showQuantity = Boolean(transaction.quantity && transaction.quantity > 1);

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

  return (
    <Sheet title={isSale ? "Venda" : "Gasto"} onClose={onClose}>
      <div className="animate-rise">
        <div className="flex items-start gap-3">
          <span
            className={
              isSale
                ? "grid size-11 flex-none place-items-center rounded-[4px] bg-sage-soft text-sage-dark"
                : "grid size-11 flex-none place-items-center rounded-[4px] bg-terracotta-soft text-terracotta-dark"
            }
          >
            {isSale ? (
              <ArrowDownLeft className="size-5" strokeWidth={1.9} />
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
          className={
            isSale
              ? "mt-5 text-[2.5rem] font-extrabold leading-none tracking-tight text-sage-dark tabular"
              : "mt-5 text-[2.5rem] font-extrabold leading-none tracking-tight text-ink tabular"
          }
        >
          {isSale ? "+" : "−"} {formatBRL(transaction.amountCents)}
        </p>

        {showQuantity || showPayment || showSource ? (
          <dl className="mt-5 divide-y divide-line rounded-[4px] border border-line bg-cream text-sm">
            {showQuantity ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Quantidade</dt>
                <dd className="font-semibold text-ink">
                  {transaction.quantity}
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
