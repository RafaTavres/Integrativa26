"use client";

import { ArrowRight, Mic } from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { formatBRL } from "@/lib/format";

export function PendingReviewCard() {
  const { pendingTransactions } = useApp();
  const { openReview } = useActions();
  const first = pendingTransactions[0];

  if (!first) return null;

  return (
    <button
      type="button"
      onClick={() => openReview(first.id)}
      className="animate-rise group flex w-full items-center gap-3 rounded-[4px] border border-mustard/45 border-l-[3px] border-l-mustard bg-mustard-soft p-3.5 text-left transition-colors hover:bg-[#f6e2c4]"
    >
      <span className="grid size-10 flex-none place-items-center rounded-[4px] bg-mustard text-ink">
        <Mic className="size-[1.1rem]" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-bold leading-tight text-ink">
          Confira o último áudio
        </span>
        <span className="mt-1 block text-[0.6875rem] text-muted">
          Faltou identificar alguns dados
          {pendingTransactions.length > 1
            ? ` · +${pendingTransactions.length - 1} esperando`
            : ""}
        </span>
      </span>
      <span className="flex flex-none items-center gap-1.5 text-sm font-bold text-ink tabular">
        {formatBRL(first.amountCents)}
        <ArrowRight
          className="size-4 text-mustard-dark transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.2}
        />
      </span>
    </button>
  );
}
