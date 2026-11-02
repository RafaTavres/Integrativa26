"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { formatBRL, parseMoneyInput } from "@/lib/format";
import { addDaysToDateOnly, dueDateLabel, todayDateOnly } from "@/lib/analytics";
import type { PaymentMethod } from "@/lib/types";

interface BillSheetProps {
  onClose: () => void;
  initialSupplierId?: string;
}

export function BillSheet({ onClose, initialSupplierId }: BillSheetProps) {
  const { suppliers, addBill } = useApp();
  const { toast } = useToast();

  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dueDate, setDueDate] = useState(addDaysToDateOnly(todayDateOnly(), 7));
  const [supplierId, setSupplierId] = useState<string | undefined>(
    initialSupplierId,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amountCents = parseMoneyInput(amountInput);
  const descriptionError =
    attempted && !description.trim() ? "Diga o que é essa conta." : null;
  const amountError =
    attempted && amountCents < 1 ? "Informe o valor da conta." : null;
  const dateError = attempted && !dueDate ? "Escolha o vencimento." : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting || !description.trim() || amountCents < 1 || !dueDate) {
      return;
    }

    setSubmitting(true);
    try {
      await addBill({
        description,
        amountCents,
        dueDate,
        supplierId,
        paymentMethod,
      });
      toast("Conta adicionada.");
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      title="Nova conta a pagar"
      description="Boleto, carnê, aluguel ou compra a prazo. O caixa só muda quando você pagar."
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="bill-form"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary h-14 w-full text-base"
        >
          {submitting ? "Salvando…" : "Salvar conta"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form id="bill-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="bill-description" className="field-label">
            O que é essa conta?
          </label>
          <input
            id="bill-description"
            autoFocus
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setSubmitError(null);
            }}
            placeholder="Ex.: Embalagens e sacolas"
            className="text-input"
            autoComplete="off"
            aria-invalid={Boolean(descriptionError) || undefined}
          />
          {descriptionError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {descriptionError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="bill-amount" className="field-label">
            Quanto vai pagar?
          </label>
          <MoneyInput
            id="bill-amount"
            value={amountInput}
            onChange={(value) => {
              setAmountInput(value);
              setSubmitError(null);
            }}
            ariaLabel="Valor da conta"
            invalid={Boolean(amountError)}
          />
          {amountError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {amountError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="bill-due" className="field-label">
            Vencimento
          </label>
          <input
            id="bill-due"
            type="date"
            value={dueDate}
            onChange={(event) => {
              setDueDate(event.target.value);
              setSubmitError(null);
            }}
            className="text-input"
            aria-invalid={Boolean(dateError) || undefined}
          />
          {dateError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {dateError}
            </p>
          ) : (
            <p className="field-hint flex items-center gap-1.5">
              <CalendarClock className="size-3.5" strokeWidth={2} />
              {dueDateLabel(dueDate)} · {formatBRL(amountCents)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="bill-supplier" className="field-label">
            Fornecedor <span className="font-normal text-muted">(opcional)</span>
          </label>
          <select
            id="bill-supplier"
            value={supplierId ?? ""}
            onChange={(event) => setSupplierId(event.target.value || undefined)}
            className="text-input"
          >
            <option value="">Sem fornecedor</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="field-label">
            Como pretende pagar?{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </span>
          <PaymentPicker
            value={paymentMethod}
            onChange={setPaymentMethod}
          />
        </div>

        {submitError ? (
          <p
            role="alert"
            className="rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium text-terracotta-dark"
          >
            {submitError}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
