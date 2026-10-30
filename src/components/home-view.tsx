"use client";

import { useApp } from "@/lib/store";
import { formatLongDate } from "@/lib/format";
import { BalanceCard } from "./balance-card";
import { QuickActions } from "./quick-actions";
import { PendingReviewCard } from "./pending-review-card";
import { ActivityFeed } from "./activity-feed";

export function HomeView() {
  const { business } = useApp();

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise">
        <p className="eyebrow">{formatLongDate()}</p>
        <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
          Oi, {business.ownerName}.
        </h1>
      </header>

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
