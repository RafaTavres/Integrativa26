"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  ReceiptText,
  Trash2,
  Undo2,
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
import { PAYMENT_METHOD_LABELS, type Bill } from "@/lib/types";

function BillCard({ bill }: { bill: Bill }) {
  const { suppliers, deleteBill } = useApp();
  const { openPayBill, openTransaction } = useActions();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const supplier = bill.supplierId
    ? suppliers.find((item) => item.id === bill.supplierId)
    : undefined;
  const diff = daysUntil(bill.dueDate);
  const overdue = diff < 0;

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
    <div className="rounded-[4px] border border-line bg-paper">
      <div className="flex items-start gap-3 p-3">
        <span
          className={
            overdue
              ? "grid size-9 flex-none place-items-center rounded-[4px] bg-terracotta-soft text-terracotta-dark"
              : "grid size-9 flex-none place-items-center rounded-[4px] bg-mustard-soft text-mustard-dark"
          }
        >
          {overdue ? (
            <AlertTriangle className="size-4" strokeWidth={2.1} />
          ) : (
            <ReceiptText className="size-4" strokeWidth={2} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-bold leading-tight text-ink">
            {bill.description}
          </p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-muted">
            {supplier ? `${supplier.name} · ` : ""}
            {dueDateLabel(bill.dueDate)} · {formatDateOnly(bill.dueDate)}
          </p>
          {bill.paymentMethod ? (
            <p className="mt-0.5 text-[0.625rem] text-muted">
              Pretendido: {PAYMENT_METHOD_LABELS[bill.paymentMethod]}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <span className="text-[0.9375rem] font-bold text-ink tabular">
            {formatBRL(bill.amountCents)}
          </span>
          <button
            type="button"
            onClick={() => openPayBill(bill.id)}
            className="btn btn-secondary h-8 px-2.5 text-[0.6875rem]"
          >
            Pagar
          </button>
        </div>
      </div>

      {confirming ? (
        <div className="animate-rise border-t border-terracotta/20 bg-terracotta-soft p-3">
          <p className="text-xs font-semibold text-terracotta-dark">
            Apagar esta conta?
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-ink/75">
            Só contas em aberto podem ser apagadas.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn btn-secondary h-9 flex-1 text-xs"
            >
              <Undo2 className="size-3.5" strokeWidth={2} />
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="btn h-9 flex-1 bg-terracotta-dark text-xs text-cream"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              {deleting ? "Apagando…" : "Apagar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex w-full items-center gap-1.5 border-t border-line/70 px-3 py-2 text-[0.625rem] font-bold text-muted transition-colors hover:bg-cream hover:text-terracotta-dark"
        >
          <Trash2 className="size-3" strokeWidth={2.2} />
          Apagar conta
        </button>
      )}
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
    const today: Bill[] = [];
    const week: Bill[] = [];
    const later: Bill[] = [];
    for (const bill of open) {
      const diff = daysUntil(bill.dueDate);
      if (diff < 0) overdue.push(bill);
      else if (diff === 0) today.push(bill);
      else if (diff <= 7) week.push(bill);
      else later.push(bill);
    }
    return { open, overdue, today, week, later };
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
      description: "Melhor resolver primeiro.",
      items: groups.overdue,
      tone: "text-terracotta-dark",
    },
    {
      key: "today",
      title: "Vencem hoje",
      description: "Pagamento para hoje.",
      items: groups.today,
      tone: "text-mustard-dark",
    },
    {
      key: "week",
      title: "Próximos 7 dias",
      description: "Dá para se organizar.",
      items: groups.week,
      tone: "text-ink",
    },
    {
      key: "later",
      title: "Mais para frente",
      description: "Sem pressa, mas no radar.",
      items: groups.later,
      tone: "text-ink",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Previsão de pagamento</p>
          <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
            Contas a pagar
          </h1>
          <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-muted">
            A conta entra aqui quando você compra a prazo. O caixa só muda no
            dia do pagamento.
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

      <div className="animate-rise mt-6 grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-[4px] border border-line bg-paper p-4">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Em aberto
          </p>
          <p className="mt-1 text-[1.65rem] font-extrabold tracking-tight text-ink tabular">
            {formatBRL(summary.openTotalCents)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted">
            {summary.openCount}{" "}
            {summary.openCount === 1 ? "conta" : "contas"}
          </p>
        </div>
        <div className="rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-4">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-terracotta-dark">
            Atrasado
          </p>
          <p className="mt-1 text-[1.65rem] font-extrabold tracking-tight text-terracotta-dark tabular">
            {formatBRL(summary.overdueTotalCents)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-terracotta-dark/80">
            {summary.overdueCount}{" "}
            {summary.overdueCount === 1 ? "conta" : "contas"}
          </p>
        </div>
        <div className="rounded-[4px] border border-mustard/40 bg-mustard-soft p-4">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-mustard-dark">
            Próximos 7 dias
          </p>
          <p className="mt-1 text-[1.65rem] font-extrabold tracking-tight text-mustard-dark tabular">
            {formatBRL(summary.next7TotalCents)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-mustard-dark/80">
            {summary.next7Count}{" "}
            {summary.next7Count === 1 ? "conta" : "contas"}
          </p>
        </div>
      </div>

      {summary.nextPayment ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-[4px] border border-line bg-cream p-3">
          <CalendarClock
            className="size-4 flex-none text-muted"
            strokeWidth={2}
          />
          <p className="min-w-0 flex-1 text-xs text-ink">
            Próximo pagamento:{" "}
            <strong>
              {formatBRL(summary.nextPayment.totalCents)}
            </strong>{" "}
            em {formatDateOnly(summary.nextPayment.dueDate)}
            {summary.nextPayment.count > 1
              ? ` (${summary.nextPayment.count} contas)`
              : ""}
          </p>
          <Link
            href="/analises"
            className="flex-none text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
          >
            Ver previsão
          </Link>
        </div>
      ) : null}

      {groups.open.length > 0 ? (
        <div className="mt-6 space-y-6">
          {sections.map((section) =>
            section.items.length > 0 ? (
              <section key={section.key} className="animate-rise">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <h2 className={`display text-xl leading-none ${section.tone}`}>
                      {section.title}
                    </h2>
                    <p className="mt-1 text-[0.6875rem] text-muted">
                      {section.description}
                    </p>
                  </div>
                  <span className="pb-0.5 text-[0.6875rem] font-semibold text-muted">
                    {formatBRL(
                      section.items.reduce(
                        (total, bill) => total + bill.amountCents,
                        0,
                      ),
                    )}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {section.items.map((bill) => (
                    <BillCard key={bill.id} bill={bill} />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <div className="animate-rise mt-6 rounded-[4px] border border-sage/35 bg-sage-soft p-5 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-[4px] bg-paper text-sage-dark">
            <CheckCircle2 className="size-6" strokeWidth={2} />
          </span>
          <h2 className="display mt-3 text-xl text-ink">Tudo em dia</h2>
          <p className="mx-auto mt-1 max-w-[22rem] text-xs leading-relaxed text-muted">
            Nenhuma conta em aberto. Quando comprar a prazo, ela aparece aqui
            com o vencimento.
          </p>
          <button
            type="button"
            onClick={() => openBill()}
            className="btn btn-primary mt-4"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Adicionar conta
          </button>
        </div>
      )}

      {paid.length > 0 ? (
        <section className="mt-7">
          <button
            type="button"
            onClick={() => setShowPaid((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded-[4px] border border-line bg-paper px-3.5 py-3 text-left"
            aria-expanded={showPaid}
          >
            <span>
              <span className="block text-sm font-bold text-ink">
                Contas pagas
              </span>
              <span className="mt-0.5 block text-[0.6875rem] text-muted">
                Últimas {paid.length} pagas
              </span>
            </span>
            {showPaid ? (
              <ChevronUp className="size-4 text-muted" strokeWidth={2} />
            ) : (
              <ChevronDown className="size-4 text-muted" strokeWidth={2} />
            )}
          </button>

          {showPaid ? (
            <div className="animate-rise mt-2 divide-y divide-line overflow-hidden rounded-[4px] border border-line bg-paper">
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
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-cream disabled:hover:bg-transparent"
                  >
                    <span className="grid size-8 flex-none place-items-center rounded-[3px] bg-sage-soft text-sage-dark">
                      <CheckCircle2 className="size-4" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold text-ink">
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
                    <span className="flex-none text-[0.8125rem] font-bold text-muted tabular line-through">
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
