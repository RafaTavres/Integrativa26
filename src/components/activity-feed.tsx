"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ReceiptText,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { dayKey, dayLabel, formatBRL, formatTime } from "@/lib/format";
import type { SourceType, Transaction } from "@/lib/types";

const SHORT_SOURCE: Record<SourceType, string> = {
  manual: "",
  audio_transcription: "áudio",
  image_recognition: "foto",
  whatsapp_import: "WhatsApp",
};

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { openTransaction } = useActions();
  const isSale = transaction.kind === "sale";
  const meta = [
    transaction.quantity && transaction.quantity > 1
      ? `${transaction.quantity}×`
      : null,
    formatTime(transaction.occurredAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => openTransaction(transaction.id)}
      className="group flex w-full items-center gap-3 rounded-[4px] border border-line bg-paper p-3 text-left transition-colors hover:border-sand-dark hover:bg-[#fffaf3]"
    >
      <span
        className={
          isSale
            ? "grid size-9 flex-none place-items-center rounded-[4px] bg-sage-soft text-sage-dark"
            : "grid size-9 flex-none place-items-center rounded-[4px] bg-terracotta-soft text-terracotta-dark"
        }
      >
        {isSale ? (
          <ArrowDownLeft className="size-4" strokeWidth={2.1} />
        ) : (
          <ArrowUpRight className="size-4" strokeWidth={2.1} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-semibold leading-tight text-ink">
          {transaction.description}
        </span>
        <span className="mt-0.5 block truncate text-[0.6875rem] text-muted">
          {meta}
        </span>
      </span>
      <span className="flex-none text-right">
        <span
          className={
            isSale
              ? "block text-[0.875rem] font-bold tracking-tight text-sage-dark tabular"
              : "block text-[0.875rem] font-bold tracking-tight text-ink tabular"
          }
        >
          {isSale ? "+" : "−"} {formatBRL(transaction.amountCents)}
        </span>
        {transaction.sourceType !== "manual" ? (
          <span className="mt-0.5 block text-[0.625rem] font-medium text-terracotta-dark">
            via {SHORT_SOURCE[transaction.sourceType]}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function ActivityFeed() {
  const { transactions, lowStockProducts } = useApp();
  const { openSale } = useActions();
  const [expanded, setExpanded] = useState(false);

  const processed = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.status === "processed")
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [transactions],
  );

  const visible = expanded ? processed : processed.slice(0, 6);
  const hiddenCount = processed.length - visible.length;

  const groups = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      items: Transaction[];
    }> = [];

    for (const transaction of visible) {
      const key = dayKey(transaction.occurredAt);
      const last = result[result.length - 1];
      if (last && last.key === key) {
        last.items.push(transaction);
      } else {
        result.push({
          key,
          label: dayLabel(transaction.occurredAt),
          items: [transaction],
        });
      }
    }
    return result;
  }, [visible]);

  const lowStockNames = lowStockProducts
    .slice(0, 2)
    .map((product) => product.name)
    .join(", ");
  const extraLowStock = lowStockProducts.length - 2;

  return (
    <section aria-labelledby="feed-title" className="animate-rise">
      <div className="flex items-end justify-between gap-3 pb-3">
        <h2
          id="feed-title"
          className="display text-[1.65rem] leading-none text-ink"
        >
          Movimentações
        </h2>
        <span className="pb-0.5 text-[0.6875rem] text-muted">
          {processed.length} no total
        </span>
      </div>

      <div className="space-y-4">
        {lowStockProducts.length > 0 ? (
          <Link
            href="/estoque"
            className="flex items-center gap-3 rounded-[4px] border border-mustard/45 border-l-[3px] border-l-mustard bg-mustard-soft p-3 transition-colors hover:bg-[#f6e2c4]"
          >
            <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-mustard text-ink">
              <AlertTriangle className="size-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] font-bold leading-tight text-ink">
                {lowStockProducts.length}{" "}
                {lowStockProducts.length === 1 ? "item" : "itens"} para repor
              </span>
              <span className="mt-0.5 block truncate text-[0.6875rem] text-mustard-dark">
                {lowStockNames}
                {extraLowStock > 0 ? ` +${extraLowStock}` : ""}
              </span>
            </span>
            <span className="badge flex-none bg-ink text-cream">Ver</span>
          </Link>
        ) : null}

        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[0.625rem] font-bold uppercase tracking-[0.13em] text-muted">
                {group.label}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
            {group.items.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </div>
        ))}

        {processed.length === 0 && lowStockProducts.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-8 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-[4px] bg-sand text-ink">
              <ReceiptText className="size-5" strokeWidth={1.8} />
            </span>
            <h3 className="display mt-3 text-xl text-ink">
              Nada por aqui ainda
            </h3>
            <p className="mx-auto mt-1 max-w-[18rem] text-xs leading-relaxed text-muted">
              Registre a primeira venda para começar.
            </p>
            <button
              type="button"
              onClick={openSale}
              className="btn btn-primary mt-4"
            >
              Registrar venda
            </button>
          </div>
        ) : null}

        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="btn btn-secondary w-full text-xs"
          >
            Ver mais {hiddenCount}
            <ChevronDown className="size-4" strokeWidth={2} />
          </button>
        ) : null}

        {expanded && processed.length > 6 ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="btn btn-ghost w-full text-xs"
          >
            Mostrar menos
            <ChevronUp className="size-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </section>
  );
}
