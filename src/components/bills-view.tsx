"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { useToast } from "./toast";
import {
  daysUntil,
  dueDateLabel,
  formatDateOnly,
  summarizePayables,
} from "@/lib/analytics";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Bill } from "@/lib/types";

function BillRow({ bill }: { bill: Bill }) {
  const { suppliers, deleteBill } = useApp();
  const { openPayBill } = useActions();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const supplier = bill.supplierId
    ? suppliers.find((item) => item.id === bill.supplierId)
    : undefined;
  const overdue = daysUntil(bill.dueDate) < 0;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteBill(bill.id);
      toast("Conta apagada.", "info");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não conseguimos apagar.",
        "info",
      );
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-bold leading-tight text-ink">
            {bill.description}
          </p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-muted">
            {supplier ? `${supplier.name} · ` : ""}
            {dueDateLabel(bill.dueDate)} · {formatDateOnly(bill.dueDate)}
          </p>
        </div>
        <span
          className={cn(
            "flex-none text-[0.8125rem] font-bold tabular",
            overdue ? "text-terracotta-dark" : "text-ink",
          )}
        >
          {formatBRL(bill.amountCents)}
        </span>
        <button
          type="button"
          onClick={() => openPayBill(bill.id)}
          className="btn btn-secondary h-8 flex-none px-2.5 text-[0.6875rem]"
        >
          Pagar
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Apagar ${bill.description}`}
          className="grid size-8 flex-none place-items-center rounded-[3px] text-muted transition-colors hover:bg-cream hover:text-terracotta-dark"
        >
          <Trash2 className="size-3.5" strokeWidth={2} />
        </button>
      </div>

      {confirming ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-[3px] bg-terracotta-soft px-2 py-1.5">
          <span className="text-[0.625rem] font-semibold text-terracotta-dark">
            Apagar esta conta?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[0.625rem] font-bold text-muted"
            >
              Não
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="text-[0.625rem] font-bold text-terracotta-dark"
            >
              {deleting ? "Apagando…" : "Apagar"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BillsView() {
  const { bills, suppliers } = useApp();
  const { openBill, openTransaction } = useActions();
  const [showPaid, setShowPaid] = useState(false);

  const summary = useMemo(
    () => summarizePayables(bills, suppliers),
    [bills, suppliers],
  );

  const groups = useMemo(() => {
    const open = bills
      .filter((bill) => bill.status === "open")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const overdue: Bill[] = [];
    const next7: Bill[] = [];
    const later: Bill[] = [];
    for (const bill of open) {
      const diff = daysUntil(bill.dueDate);
      if (diff < 0) overdue.push(bill);
      else if (diff <= 7) next7.push(bill);
      else later.push(bill);
    }
    return { open, overdue, next7, later };
  }, [bills]);

  const paid = useMemo(
    () =>
      bills
        .filter((bill) => bill.status === "paid")
        .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))
        .slice(0, 10),
    [bills],
  );

  const sections = [
    {
      key: "overdue",
      title: "Atrasadas",
      items: groups.overdue,
      tone: "text-terracotta-dark",
    },
    {
      key: "next7",
      title: "Próximos 7 dias",
      items: groups.next7,
      tone: "text-ink",
    },
    {
      key: "later",
      title: "Mais para frente",
      items: groups.later,
      tone: "text-ink",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[1.75rem] leading-[1.05] text-ink sm:text-[2rem]">
            Contas a pagar
          </h1>
          <p className="mt-1.5 text-[0.8125rem] text-muted">
            O caixa só muda quando você paga.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openBill()}
          className="btn btn-primary h-11 px-4 text-sm"
        >
          <Plus className="size-4" strokeWidth={2.4} />
          Nova conta
        </button>
      </header>

      <div className="animate-rise mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[4px] border border-line bg-paper px-3 py-2.5 text-[0.75rem] text-muted">
        <span>
          <strong className="text-ink tabular">
            {formatBRL(summary.openTotalCents)}
          </strong>{" "}
          em aberto
        </span>
        {summary.overdueTotalCents > 0 ? (
          <span className="text-terracotta-dark">
            <strong className="tabular">
              {formatBRL(summary.overdueTotalCents)}
            </strong>{" "}
            atrasado
          </span>
        ) : null}
        {summary.next7TotalCents > 0 ? (
          <span className="text-mustard-dark">
            <strong className="tabular">
              {formatBRL(summary.next7TotalCents)}
            </strong>{" "}
            nos próximos 7 dias
          </span>
        ) : null}
      </div>

      {groups.open.length > 0 ? (
        <div className="mt-5 space-y-5">
          {sections.map((section) =>
            section.items.length > 0 ? (
              <section key={section.key} className="animate-rise">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2
                    className={cn(
                      "text-[0.6875rem] font-bold uppercase tracking-[0.1em]",
                      section.tone,
                    )}
                  >
                    {section.title}
                  </h2>
                  <span className="text-[0.6875rem] font-semibold text-muted">
                    {formatBRL(
                      section.items.reduce(
                        (total, bill) => total + bill.amountCents,
                        0,
                      ),
                    )}
                  </span>
                </div>
                <div className="divide-y divide-line rounded-[4px] border border-line bg-paper">
                  {section.items.map((bill) => (
                    <BillRow key={bill.id} bill={bill} />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <div className="animate-rise mt-5 rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-6 text-center">
          <h2 className="text-sm font-bold text-ink">
            Nenhuma conta em aberto
          </h2>
          <p className="mt-1 text-xs text-muted">
            Quando comprar a prazo, ela aparece aqui.
          </p>
          <button
            type="button"
            onClick={() => openBill()}
            className="btn btn-primary mt-3 h-10 px-4 text-xs"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Adicionar conta
          </button>
        </div>
      )}

      {paid.length > 0 ? (
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setShowPaid((value) => !value)}
            className="flex w-full items-center justify-between gap-3 py-2 text-left"
            aria-expanded={showPaid}
          >
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
              Contas pagas
            </span>
            <span className="flex items-center gap-1 text-[0.6875rem] text-muted">
              {paid.length}
              {showPaid ? (
                <ChevronUp className="size-3.5" strokeWidth={2} />
              ) : (
                <ChevronDown className="size-3.5" strokeWidth={2} />
              )}
            </span>
          </button>

          {showPaid ? (
            <div className="animate-rise divide-y divide-line rounded-[4px] border border-line bg-paper">
              {paid.map((bill) => {
                const supplier = bill.supplierId
                  ? suppliers.find((item) => item.id === bill.supplierId)
                  : undefined;
                return (
                  <button
                    key={bill.id}
                    type="button"
                    onClick={() =>
                      bill.transactionId
                        ? openTransaction(bill.transactionId)
                        : undefined
                    }
                    disabled={!bill.transactionId}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream disabled:hover:bg-transparent"
                  >
                    <CheckCircle2
                      className="size-3.5 flex-none text-sage-dark"
                      strokeWidth={2}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.75rem] font-semibold text-ink">
                        {bill.description}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.625rem] text-muted">
                        {supplier ? `${supplier.name} · ` : ""}
                        paga em{" "}
                        {bill.paidAt
                          ? new Date(bill.paidAt).toLocaleDateString("pt-BR")
                          : formatDateOnly(bill.dueDate)}
                      </span>
                    </span>
                    <span className="flex-none text-[0.75rem] font-bold text-muted tabular line-through">
                      {formatBRL(bill.amountCents)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
