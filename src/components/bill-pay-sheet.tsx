"use client";

import { useState } from "react";
import { ArrowRight, Check, HandCoins, Truck } from "lucide-react";
import { Sheet } from "./sheet";
import { PaymentPicker } from "./payment-picker";
import { useApp } from "@/lib/store";
import { formatBRL } from "@/lib/format";
import { dueDateLabel } from "@/lib/analytics";
import type { PaymentMethod } from "@/lib/types";

interface BillPaySheetProps {
  billId: string;
  onClose: () => void;
}

export function BillPaySheet({ billId, onClose }: BillPaySheetProps) {
  const { bills, suppliers, payBill } = useApp();
  const bill = bills.find((item) => item.id === billId);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    bill?.paymentMethod ?? "pix",
  );
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!bill) return null;

  const supplier = bill.supplierId
    ? suppliers.find((item) => item.id === bill.supplierId)
    : undefined;
  const paymentError = attempted && !paymentMethod ? "Escolha como pagou." : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting || !paymentMethod) return;

    setSubmitting(true);
    try {
      await payBill(billId, paymentMethod);
      setSuccess(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos pagar.",
      );
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Sheet
        title="Conta paga"
        onClose={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary h-14 w-full text-base"
          >
            Fechar
          </button>
        }
      >
        <div className="animate-pop py-4 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-[4px] border border-sage/30 bg-sage-soft text-sage-dark">
            <Check className="size-7" strokeWidth={2.4} />
          </div>
          <p className="mt-4 text-sm font-medium text-muted">
            {bill.description}
          </p>
          <p className="mt-1 text-[2.25rem] font-extrabold leading-none tracking-tight text-ink tabular">
            − {formatBRL(bill.amountCents)}
          </p>
          <p className="mt-3 text-xs text-muted">
            A saída entrou no caixa de hoje.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Pagar conta"
      description="Ao confirmar, a despesa entra no caixa e a conta sai do que falta pagar."
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="bill-pay-form"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary h-14 w-full text-base"
        >
          {submitting ? "Pagando…" : "Confirmar pagamento"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form
        id="bill-pay-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div className="rounded-[4px] border border-line bg-cream p-4">
          <p className="text-sm font-bold leading-tight text-ink">
            {bill.description}
          </p>
          <p className="mt-1 text-xs text-muted">
            {dueDateLabel(bill.dueDate)}
            {supplier ? ` · ${supplier.name}` : ""}
          </p>
          <p className="mt-3 text-[2rem] font-extrabold leading-none tracking-tight text-ink tabular">
            {formatBRL(bill.amountCents)}
          </p>
        </div>

        {supplier ? (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Truck className="size-3.5" strokeWidth={2} />
            Vai para {supplier.name}
          </p>
        ) : null}

        <div>
          <span className="field-label">Como pagou?</span>
          <PaymentPicker
            value={paymentMethod}
            onChange={(value) => {
              setPaymentMethod(value);
              setSubmitError(null);
            }}
            invalid={Boolean(paymentError)}
          />
          {paymentError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {paymentError}
            </p>
          ) : null}
        </div>

        {submitError ? (
          <p
            role="alert"
            className="rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium text-terracotta-dark"
          >
            {submitError}
          </p>
        ) : null}

        <div className="flex items-start gap-2 rounded-[4px] border border-mustard/35 bg-mustard-soft/60 p-3">
          <HandCoins
            className="mt-0.5 size-4 flex-none text-mustard-dark"
            strokeWidth={2}
          />
          <p className="text-[0.6875rem] leading-relaxed text-ink/75">
            Se apagar esse pagamento depois, a conta volta para em aberto.
          </p>
        </div>
      </form>
    </Sheet>
  );
}
