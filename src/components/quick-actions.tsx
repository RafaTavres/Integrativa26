"use client";

import { ArrowUpRight, PackagePlus, Plus } from "lucide-react";
import { useActions } from "./action-provider";
import { useApp } from "@/lib/store";

export function QuickActions() {
  const { segment } = useApp();
  const { openSale, openExpense, openStock } = useActions();

  return (
    <section aria-label="Ações rápidas" className="grid gap-2.5">
      <button
        type="button"
        onClick={openSale}
        className="flex min-h-[5rem] items-center justify-between gap-4 rounded-[4px] border-b-[3px] border-terracotta-deep bg-terracotta-dark px-5 text-left text-cream transition-colors hover:bg-terracotta-deep active:translate-y-[1px]"
      >
        <span className="display text-[1.75rem] leading-none">
          {segment.saleAction}
        </span>
        <span className="grid size-11 flex-none place-items-center rounded-[4px] border border-cream/35 bg-cream/10">
          <Plus className="size-6" strokeWidth={2.4} />
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={openExpense}
          className="flex min-h-[4.25rem] items-center gap-2.5 rounded-[4px] border border-line bg-paper px-3.5 text-left transition-colors hover:border-sand-dark hover:bg-sand/40 active:translate-y-[1px]"
        >
          <span className="grid size-9 flex-none place-items-center rounded-[3px] bg-terracotta-soft text-terracotta-dark">
            <ArrowUpRight className="size-[1.05rem]" strokeWidth={2} />
          </span>
          <span className="text-[0.8125rem] font-bold text-ink">Gasto</span>
        </button>

        <button
          type="button"
          onClick={() => openStock()}
          className="flex min-h-[4.25rem] items-center gap-2.5 rounded-[4px] border border-line bg-paper px-3.5 text-left transition-colors hover:border-sand-dark hover:bg-sand/40 active:translate-y-[1px]"
        >
          <span className="grid size-9 flex-none place-items-center rounded-[3px] bg-sage-soft text-sage-dark">
            <PackagePlus className="size-[1.1rem]" strokeWidth={2} />
          </span>
          <span className="text-[0.8125rem] font-bold text-ink">
            {segment.stockLabel}
          </span>
        </button>
      </div>
    </section>
  );
}
