"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { summarizePayables } from "@/lib/analytics";
import { formatBRL } from "@/lib/format";

export function PayablesCard() {
  const { openBills, suppliers } = useApp();
  const summary = useMemo(
    () => summarizePayables(openBills, suppliers),
    [openBills, suppliers],
  );

  if (summary.openCount === 0) {
    return (
      <Link
        href="/contas"
        className="animate-rise flex items-center gap-3 rounded-[4px] border border-sage/35 bg-sage-soft p-3.5 transition-colors hover:bg-[#dfe9db]"
      >
        <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-paper text-sage-dark">
          <CheckCircle2 className="size-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] font-bold text-ink">
            Nenhuma conta em aberto
          </span>
          <span className="mt-0.5 block text-[0.6875rem] text-sage-dark">
            Compras a prazo aparecem aqui.
          </span>
        </span>
        <ChevronRight className="size-4 flex-none text-sage-dark" strokeWidth={2} />
      </Link>
    );
  }

  return (
    <Link
      href="/contas"
      className="animate-rise block rounded-[4px] border border-line bg-paper p-4 transition-colors hover:border-sand-dark hover:bg-[#fffaf3]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-terracotta-soft text-terracotta-dark">
          <CalendarClock className="size-4" strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.8125rem] font-bold text-ink">Contas a pagar</p>
            {summary.overdueCount > 0 ? (
              <span className="badge flex-none bg-terracotta text-cream">
                {summary.overdueCount} atrasada
                {summary.overdueCount > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[1.55rem] font-extrabold leading-none tracking-tight text-ink tabular">
            {formatBRL(summary.openTotalCents)}
          </p>
          <p className="mt-1 text-[0.6875rem] text-muted">
            {summary.openCount}{" "}
            {summary.openCount === 1 ? "conta em aberto" : "contas em aberto"}
            {summary.next7TotalCents > 0
              ? ` · ${formatBRL(summary.next7TotalCents)} nos próximos 7 dias`
              : ""}
          </p>
        </div>
        <ChevronRight
          className="mt-1 size-4 flex-none text-muted"
          strokeWidth={2}
        />
      </div>
    </Link>
  );
}
