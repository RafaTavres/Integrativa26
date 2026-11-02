"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, PackageX, PiggyBank, TrendingUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { buildPriceComparisons, summarizeDeadStock } from "@/lib/analytics";
import { formatBRL } from "@/lib/format";

export function InsightsCard() {
  const { products, transactions, purchases, suppliers } = useApp();

  const deadStock = useMemo(
    () => summarizeDeadStock(products, transactions),
    [products, transactions],
  );
  const comparisons = useMemo(
    () => buildPriceComparisons(purchases, products, suppliers),
    [purchases, products, suppliers],
  );

  const multiSupplier = comparisons.filter(
    (comparison) => comparison.suppliers.length > 1,
  );
  const savings = multiSupplier.reduce(
    (total, comparison) => total + comparison.savingsPerUnitCents,
    0,
  );

  return (
    <section
      aria-labelledby="insights-title"
      className="animate-rise rounded-[4px] border border-line bg-paper p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p
          id="insights-title"
          className="flex items-center gap-2 text-[0.8125rem] font-bold text-ink"
        >
          <TrendingUp className="size-4 text-sage-dark" strokeWidth={2.1} />
          Análises rápidas
        </p>
        <Link
          href="/analises"
          className="flex items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
        >
          Ver tudo
          <ArrowRight className="size-3" strokeWidth={2.4} />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/analises"
          className="rounded-[4px] border border-line bg-cream p-2.5 transition-colors hover:bg-sand/60"
        >
          <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-mustard-dark">
            <PackageX className="size-3" strokeWidth={2.2} />
            Parado
          </p>
          <p className="mt-1 text-[0.9375rem] font-bold leading-none text-ink tabular">
            {formatBRL(deadStock.totalTiedUpCents)}
          </p>
          <p className="mt-1 text-[0.5625rem] leading-snug text-muted">
            {deadStock.items.length === 0
              ? "nada encalhado"
              : `${deadStock.items.length} ${deadStock.items.length === 1 ? "item sem venda" : "itens sem venda"}`}
          </p>
        </Link>

        <Link
          href="/analises"
          className="rounded-[4px] border border-line bg-cream p-2.5 transition-colors hover:bg-sand/60"
        >
          <p className="flex items-center gap-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-sage-dark">
            <PiggyBank className="size-3" strokeWidth={2.2} />
            Economia
          </p>
          <p className="mt-1 text-[0.9375rem] font-bold leading-none text-ink tabular">
            {formatBRL(savings)}
          </p>
          <p className="mt-1 text-[0.5625rem] leading-snug text-muted">
            {multiSupplier.length === 0
              ? "por unidade, no melhor fornecedor"
              : `${multiSupplier.length} ${multiSupplier.length === 1 ? "item comparado" : "itens comparados"}`}
          </p>
        </Link>
      </div>
    </section>
  );
}
