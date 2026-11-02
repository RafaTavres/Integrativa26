"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Mail,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  ShoppingBasket,
  Truck,
} from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { dayLabel, formatBRL } from "@/lib/format";
import { dueDateLabel, formatDateOnly } from "@/lib/analytics";

interface SupplierSheetDetailProps {
  supplierId: string;
  onClose: () => void;
}

export function SupplierDetailSheet({
  supplierId,
  onClose,
}: SupplierSheetDetailProps) {
  const { suppliers, purchases, bills } = useApp();
  const { openSupplierForm, openPurchase, openBill, openPayBill } = useActions();

  const supplier = suppliers.find((item) => item.id === supplierId);
  const supplierPurchases = useMemo(
    () =>
      purchases
        .filter((purchase) => purchase.supplierId === supplierId)
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [purchases, supplierId],
  );
  const openBills = useMemo(
    () =>
      bills
        .filter(
          (bill) => bill.supplierId === supplierId && bill.status === "open",
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [bills, supplierId],
  );

  if (!supplier) return null;

  const totalPurchased = supplierPurchases.reduce(
    (total, purchase) => total + purchase.totalCents,
    0,
  );
  const openTotal = openBills.reduce((total, bill) => total + bill.amountCents, 0);
  const productNames = [
    ...new Set(supplierPurchases.map((purchase) => purchase.productName)),
  ];
  const latestPrices = new Map<string, (typeof supplierPurchases)[number]>();
  for (const purchase of supplierPurchases) {
    if (!latestPrices.has(purchase.productName)) {
      latestPrices.set(purchase.productName, purchase);
    }
  }

  return (
    <Sheet
      title={supplier.name}
      eyebrow="Fornecedor"
      onClose={onClose}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => openSupplierForm(supplier.id)}
            className="btn btn-secondary flex-1 text-xs"
          >
            <Pencil className="size-4" strokeWidth={2} />
            Editar
          </button>
          <button
            type="button"
            onClick={() => openPurchase({ supplierId: supplier.id })}
            className="btn btn-primary flex-1 text-xs"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Nova compra
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[4px] border border-line bg-cream p-3">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
              Falta pagar
            </p>
            <p className="mt-1 text-lg font-bold tracking-tight text-ink tabular">
              {formatBRL(openTotal)}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted">
              {openBills.length}{" "}
              {openBills.length === 1 ? "conta em aberto" : "contas em aberto"}
            </p>
          </div>
          <div className="rounded-[4px] border border-line bg-cream p-3">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
              Já comprado
            </p>
            <p className="mt-1 text-lg font-bold tracking-tight text-ink tabular">
              {formatBRL(totalPurchased)}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted">
              {supplierPurchases.length}{" "}
              {supplierPurchases.length === 1 ? "compra" : "compras"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            openPurchase({ supplierId: supplier.id, withReceipt: true })
          }
          className="flex w-full items-center gap-3 rounded-[4px] border border-line bg-cream p-3 text-left transition-colors hover:border-sand-dark hover:bg-sand/60"
        >
          <span className="grid size-10 flex-none place-items-center rounded-[4px] bg-paper text-terracotta-dark">
            <Camera className="size-5" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-bold text-ink">
              Registrar compra pela nota
            </span>
            <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted">
              Fotografe o cupom e confira item, quantidade e valor.
            </span>
          </span>
          <ArrowRight className="size-4 flex-none text-muted" strokeWidth={2.2} />
        </button>

        {supplier.phone || supplier.email || supplier.notes ? (
          <div className="space-y-2 rounded-[4px] border border-line bg-paper p-3 text-xs">
            {supplier.phone ? (
              <p className="flex items-center gap-2 text-ink">
                <Phone className="size-3.5 flex-none text-muted" strokeWidth={2} />
                {supplier.phone}
              </p>
            ) : null}
            {supplier.email ? (
              <p className="flex items-center gap-2 break-all text-ink">
                <Mail className="size-3.5 flex-none text-muted" strokeWidth={2} />
                {supplier.email}
              </p>
            ) : null}
            {supplier.notes ? (
              <p className="flex items-start gap-2 text-muted">
                <Truck className="mt-0.5 size-3.5 flex-none" strokeWidth={2} />
                {supplier.notes}
              </p>
            ) : null}
          </div>
        ) : null}

        {openBills.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="eyebrow">Contas em aberto</p>
              <button
                type="button"
                onClick={() => openBill(supplier.id)}
                className="text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
              >
                Nova conta
              </button>
            </div>
            <div className="space-y-2">
              {openBills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center gap-3 rounded-[4px] border border-line bg-paper p-3"
                >
                  <span className="grid size-8 flex-none place-items-center rounded-[3px] bg-terracotta-soft text-terracotta-dark">
                    <ReceiptText className="size-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">
                      {bill.description}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted">
                      {dueDateLabel(bill.dueDate)} ·{" "}
                      {formatDateOnly(bill.dueDate)}
                    </p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1">
                    <span className="text-[0.8125rem] font-bold text-ink tabular">
                      {formatBRL(bill.amountCents)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openPayBill(bill.id)}
                      className="text-[0.625rem] font-bold text-sage-dark underline underline-offset-2"
                    >
                      Pagar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="eyebrow">Últimos preços</p>
            <span className="text-[0.6875rem] text-muted">
              {productNames.length}{" "}
              {productNames.length === 1 ? "item" : "itens"}
            </span>
          </div>
          {supplierPurchases.length > 0 ? (
            <div className="divide-y divide-line overflow-hidden rounded-[4px] border border-line bg-paper">
              {[...latestPrices.values()].slice(0, 6).map((purchase) => (
                <div
                  key={purchase.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <ShoppingBasket
                    className="size-4 flex-none text-muted"
                    strokeWidth={1.9}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">
                      {purchase.productName}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[0.625rem] text-muted">
                      <CalendarDays className="size-3" strokeWidth={2} />
                      {dayLabel(purchase.occurredAt)} · {purchase.quantity}{" "}
                      un
                    </p>
                  </div>
                  <span className="flex-none text-[0.8125rem] font-bold text-ink tabular">
                    {formatBRL(purchase.unitCostCents)}
                    <span className="text-[0.625rem] font-medium text-muted">
                      /un
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[4px] border border-dashed border-line bg-cream p-4 text-center">
              <p className="text-xs text-muted">
                Nenhuma compra registrada com este fornecedor ainda.
              </p>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
