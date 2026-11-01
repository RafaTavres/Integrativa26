"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/store";
import { formatLongDate } from "@/lib/format";
import { BalanceCard } from "./balance-card";
import { QuickActions } from "./quick-actions";
import { PendingReviewCard } from "./pending-review-card";
import { ActivityFeed } from "./activity-feed";

export function HomeView() {
  const { business, cloudStatus, cloudMessage, retryCloud } = useApp();

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise">
        <p className="eyebrow">{formatLongDate()}</p>
        <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
          Oi, {business.ownerName}.
        </h1>
      </header>

      {cloudStatus === "error" ? (
        <div className="animate-rise mt-4 flex items-start gap-3 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3">
          <CloudOff
            className="mt-0.5 size-4 flex-none text-terracotta-dark"
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink">
              Salvando só neste navegador
            </p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink/75">
              {cloudMessage ??
                "Não conseguimos conectar ao Supabase. O que você registrar fica neste aparelho."}
            </p>
            <button
              type="button"
              onClick={() => void retryCloud()}
              className="mt-2 inline-flex items-center gap-1.5 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2 transition-colors hover:text-ink"
            >
              <RefreshCw className="size-3" strokeWidth={2.4} />
              Tentar conectar de novo
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-5 lg:mt-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-8">
        <div className="space-y-3 lg:sticky lg:top-[6.25rem]">
          <BalanceCard />
          <PendingReviewCard />
          <QuickActions />
        </div>

        <ActivityFeed />
      </div>
    </div>
  );
}
