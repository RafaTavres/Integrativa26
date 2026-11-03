"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  HandCoins,
  PackageX,
  PiggyBank,
  ReceiptText,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import {
  buildPriceComparisons,
  dueDateLabel,
  formatDateOnly,
  summarizeDeadStock,
  summarizePayables,
  summarizeWithdrawals,
} from "@/lib/analytics";
import { dayLabel, formatBRL } from "@/lib/format";

export function AnalyticsView() {
  const {
    bills,
    suppliers,
    purchases,
    products,
    transactions,
    openBills,
  } = useApp();
  const { openTransaction } = useActions();

  const payables = useMemo(
    () => summarizePayables(bills, suppliers),
    [bills, suppliers],
  );
  const deadStock = useMemo(
    () => summarizeDeadStock(products, transactions),
    [products, transactions],
  );
  const comparisons = useMemo(
    () => buildPriceComparisons(purchases, products, suppliers),
    [purchases, products, suppliers],
  );
  const withdrawals = useMemo(
    () => summarizeWithdrawals(transactions),
    [transactions],
  );

  const multiSupplier = comparisons.filter(
    (comparison) => comparison.suppliers.length > 1,
  );
  const savingsOpportunities = multiSupplier.reduce(
    (total, comparison) => total + comparison.savingsPerUnitCents,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise">
        <h1 className="display text-[1.75rem] leading-[1.05] text-ink sm:text-[2rem]">
          Análises
        </h1>
        <p className="mt-1.5 max-w-[40rem] text-[0.8125rem] text-muted">
          O que pesa no caixa e no estoque.
        </p>
      </header>

      <div className="animate-rise mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[4px] border border-line bg-paper px-3 py-2.5 text-[0.75rem] text-muted">
        <span>
          <strong className="text-terracotta-dark tabular">
            {formatBRL(payables.openTotalCents)}
          </strong>{" "}
          em aberto
        </span>
        <span>
          <strong className="text-mustard-dark tabular">
            {formatBRL(deadStock.totalTiedUpCents)}
          </strong>{" "}
          parado
        </span>
        <span>
          <strong className="text-sage-dark tabular">
            {formatBRL(withdrawals.last30TotalCents)}
          </strong>{" "}
          retirado
        </span>
        <span>
          <strong className="text-ink tabular">
            {formatBRL(savingsOpportunities)}
          </strong>{" "}
          de diferença
        </span>
      </div>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
        <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <CalendarClock className="size-4 text-terracotta-dark" strokeWidth={2} />
                Previsão de pagamento
              </p>
            </div>
            <Link
              href="/contas"
              className="flex flex-none items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
            >
              Ver contas
              <ArrowRight className="size-3" strokeWidth={2.4} />
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-[4px] border border-line bg-cream">
            <div className="px-3 py-2.5">
              <p className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted">
                Atrasado
              </p>
              <p className="mt-1 text-sm font-bold text-terracotta-dark tabular">
                {formatBRL(payables.overdueTotalCents)}
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted">
                7 dias
              </p>
              <p className="mt-1 text-sm font-bold text-ink tabular">
                {formatBRL(payables.next7TotalCents)}
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted">
                30 dias
              </p>
              <p className="mt-1 text-sm font-bold text-ink tabular">
                {formatBRL(payables.next30TotalCents)}
              </p>
            </div>
          </div>

          {payables.timeline.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {payables.timeline.slice(0, 6).map((item) => (
                <div
                  key={item.dueDate}
                  className="flex items-center gap-3 rounded-[4px] border border-line/70 px-3 py-2"
                >
                  <span className="w-[4.5rem] flex-none text-[0.6875rem] font-bold text-ink">
                    {formatDateOnly(item.dueDate)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.625rem] text-muted">
                    {dueDateLabel(item.dueDate)} · {item.bills.length}{" "}
                    {item.bills.length === 1 ? "conta" : "contas"}
                  </span>
                  <span className="flex-none text-[0.8125rem] font-bold text-ink tabular">
                    {formatBRL(item.totalCents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[4px] border border-dashed border-line bg-cream p-3 text-center text-xs text-muted">
              Nenhuma conta em aberto. Bom sinal.
            </p>
          )}
        </section>

        <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <Truck className="size-4 text-mustard-dark" strokeWidth={2} />
                Fornecedores
              </p>
            </div>
            <Link
              href="/fornecedores"
              className="flex flex-none items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
            >
              Ver todos
              <ArrowRight className="size-3" strokeWidth={2.4} />
            </Link>
          </div>

          {payables.bySupplier.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {payables.bySupplier.slice(0, 6).map((supplier) => (
                <div
                  key={supplier.supplierId ?? "none"}
                  className="flex items-center gap-3 rounded-[4px] border border-line/70 px-3 py-2"
                >
                  <span className="display grid size-7 flex-none place-items-center rounded-[3px] bg-sand text-[0.625rem] font-bold text-ink">
                    {supplier.supplierName
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((word) => word[0]?.toUpperCase())
                      .join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">
                      {supplier.supplierName}
                    </p>
                    <p className="mt-0.5 text-[0.625rem] text-muted">
                      {supplier.count}{" "}
                      {supplier.count === 1 ? "conta" : "contas"}
                      {supplier.nextDueDate
                        ? ` · próxima ${formatDateOnly(supplier.nextDueDate)}`
                        : ""}
                    </p>
                  </div>
                  <span className="flex-none text-[0.8125rem] font-bold text-ink tabular">
                    {formatBRL(supplier.totalCents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[4px] border border-dashed border-line bg-cream p-3 text-center text-xs text-muted">
              Sem contas em aberto por fornecedor.
            </p>
          )}
        </section>

        <section className="animate-rise rounded-[4px] border border-line bg-paper p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <PiggyBank className="size-4 text-sage-dark" strokeWidth={2} />
                Preço por fornecedor
              </p>
            </div>
            <Link
              href="/importar"
              className="hidden flex-none items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2 sm:flex"
            >
              Importar histórico
              <ArrowRight className="size-3" strokeWidth={2.4} />
            </Link>
          </div>

          {multiSupplier.length > 0 ? (
            <div className="mt-4 grid gap-2.5 md:grid-cols-2">
              {multiSupplier.slice(0, 6).map((comparison) => (
                <div
                  key={comparison.key}
                  className="rounded-[4px] border border-line bg-cream p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold text-ink">
                      {comparison.productName}
                    </p>
                    {comparison.spreadPct > 0 ? (
                      <span className="badge flex-none bg-sage-soft text-sage-dark">
                        até {comparison.spreadPct}% mais barato
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-1">
                    {comparison.suppliers.map((supplier) => {
                      const isBest =
                        supplier.unitCostCents ===
                        comparison.best?.unitCostCents;
                      return (
                        <div
                          key={supplier.supplierId ?? "none"}
                          className="flex items-center gap-2 text-[0.6875rem]"
                        >
                          <span
                            className={
                              isBest
                                ? "size-1.5 flex-none rounded-full bg-sage-dark"
                                : "size-1.5 flex-none rounded-full bg-line"
                            }
                          />
                          <span
                            className={
                              isBest
                                ? "min-w-0 flex-1 truncate font-bold text-sage-dark"
                                : "min-w-0 flex-1 truncate text-muted"
                            }
                          >
                            {supplier.supplierName}
                          </span>
                          <span
                            className={
                              isBest
                                ? "flex-none font-bold text-sage-dark tabular"
                                : "flex-none text-muted tabular"
                            }
                          >
                            {formatBRL(supplier.unitCostCents)}/un
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {comparison.best &&
                  comparison.best.unitCostCents <
                    (comparison.worst?.unitCostCents ?? 0) ? (
                    <p className="mt-2 border-t border-line pt-2 text-[0.625rem] leading-snug text-muted">
                      Comprando de{" "}
                      <strong className="text-ink">
                        {comparison.best.supplierName}
                      </strong>{" "}
                      você economiza{" "}
                      <strong className="text-sage-dark">
                        {formatBRL(comparison.savingsPerUnitCents)}
                      </strong>{" "}
                      por unidade.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[4px] border border-dashed border-line bg-cream p-4 text-center text-xs leading-relaxed text-muted">
              Registre compras do mesmo item com dois fornecedores diferentes.
              Aí a comparação de preço aparece aqui.
            </p>
          )}
        </section>

        <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <PackageX className="size-4 text-mustard-dark" strokeWidth={2} />
                Encalhados
              </p>
            </div>
            <Link
              href="/estoque"
              className="flex flex-none items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
            >
              Ver estoque
              <ArrowRight className="size-3" strokeWidth={2.4} />
            </Link>
          </div>

          {deadStock.items.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {deadStock.items.slice(0, 7).map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-3 rounded-[4px] border border-line/70 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">
                      {item.product.name}
                    </p>
                    <p className="mt-0.5 text-[0.625rem] text-muted">
                      {item.product.stock}{" "}
                      {item.product.stock === 1
                        ? item.product.unit
                        : item.product.unitPlural}{" "}
                      · {item.daysWithoutSale} dias sem venda
                    </p>
                  </div>
                  <span className="flex-none text-[0.8125rem] font-bold text-mustard-dark tabular">
                    {formatBRL(item.tiedUpCents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[4px] border border-dashed border-line bg-cream p-3 text-center text-xs text-muted">
              Nenhum item parado. Estoque girando bem.
            </p>
          )}
        </section>

        <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <HandCoins className="size-4 text-terracotta-dark" strokeWidth={2} />
                Retiradas
              </p>
            </div>
            <span className="badge flex-none bg-blush text-terracotta-dark">
              não é gasto
            </span>
          </div>

          <p className="mt-2 text-[0.75rem] text-muted">
            Este mês{" "}
            <strong className="text-ink tabular">
              {formatBRL(withdrawals.monthTotalCents)}
            </strong>
            {" · "}30 dias{" "}
            <strong className="text-ink tabular">
              {formatBRL(withdrawals.last30TotalCents)}
            </strong>
          </p>

          {withdrawals.items.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {withdrawals.items.slice(0, 5).map((transaction) => (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => openTransaction(transaction.id)}
                  className="flex w-full items-center gap-3 rounded-[4px] border border-line/70 px-3 py-2 text-left transition-colors hover:bg-cream"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">
                      {transaction.description}
                    </p>
                    <p className="mt-0.5 text-[0.625rem] text-muted">
                      {dayLabel(transaction.occurredAt)}
                    </p>
                  </div>
                  <span className="flex-none text-[0.8125rem] font-bold text-terracotta-dark tabular">
                    − {formatBRL(transaction.amountCents)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[4px] border border-dashed border-line bg-cream p-3 text-center text-xs text-muted">
              Nenhuma retirada registrada.
            </p>
          )}
        </section>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-line bg-cream p-3.5">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink">
          <TrendingUp className="size-4 text-sage-dark" strokeWidth={2} />
          {openBills.length > 0
            ? `${openBills.length} ${openBills.length === 1 ? "conta em aberto" : "contas em aberto"} no total.`
            : "Nenhuma conta em aberto no momento."}
        </p>
        <Link
          href="/importar"
          className="btn btn-secondary h-9 px-3 text-xs"
        >
          <ReceiptText className="size-3.5" strokeWidth={2} />
          Importar planilha
        </Link>
      </div>
    </div>
  );
}
