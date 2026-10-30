"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { formatBRL } from "@/lib/format";

export function BalanceCard() {
  const { cashCents, todayInCents, todayOutCents } = useApp();

  return (
    <section
      aria-label="Resumo do caixa"
      className="animate-rise rounded-[4px] bg-ink p-5 text-cream shadow-[3px_3px_0_#e4d8c9] sm:p-6"
    >
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-cream/60">
        Sobrou no caixa
      </p>
      <p className="mt-2 text-[clamp(2.5rem,8.5vw,3.1rem)] font-extrabold leading-none tracking-[-0.035em] text-cream tabular">
        {formatBRL(cashCents)}
      </p>

      <div className="mt-5 grid grid-cols-2 divide-x divide-cream/15 border-t border-cream/15 pt-4">
        <div className="pr-4">
          <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.09em] text-cream/55">
            <ArrowDownLeft className="size-3.5 text-[#b7cdaf]" strokeWidth={2.4} />
            Entrou hoje
          </p>
          <p className="mt-1.5 text-xl font-bold leading-none tracking-tight text-[#b7cdaf] tabular sm:text-[1.35rem]">
            {formatBRL(todayInCents)}
          </p>
        </div>
        <div className="pl-4">
          <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.09em] text-cream/55">
            <ArrowUpRight className="size-3.5 text-[#f1b49e]" strokeWidth={2.4} />
            Saiu hoje
          </p>
          <p className="mt-1.5 text-xl font-bold leading-none tracking-tight text-[#f1b49e] tabular sm:text-[1.35rem]">
            {formatBRL(todayOutCents)}
          </p>
        </div>
      </div>
    </section>
  );
}
