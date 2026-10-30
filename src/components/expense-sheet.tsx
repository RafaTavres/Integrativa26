"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { useApp } from "@/lib/store";
import { formatBRL, parseMoneyInput } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

interface ExpenseSheetProps {
  onClose: () => void;
}

interface SuccessData {
  description: string;
  amountCents: number;
}

export function ExpenseSheet({ onClose }: ExpenseSheetProps) {
  const { recordExpense, segment } = useApp();
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    PaymentMethod | undefined
  >();
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const amountCents = parseMoneyInput(amountInput);
  const descriptionError =
    attempted && !description.trim() ? "Diga o que foi o gasto." : null;
  const amountError =
    attempted && amountCents < 1 ? "Informe quanto saiu." : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (!description.trim() || amountCents < 1) return;

    try {
      recordExpense({
        description,
        amountCents,
        paymentMethod: paymentMethod ?? "other",
      });
      setSuccess({
        description: description.trim(),
        amountCents,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
    }
  }

  if (success) {
    return (
      <Sheet
        title="Tudo certo"
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
            {success.description}
          </p>
          <p className="mt-1 text-[2.25rem] font-extrabold leading-none tracking-tight text-ink tabular">
            − {formatBRL(success.amountCents)}
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Novo gasto"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="expense-form"
          className="btn btn-primary h-14 w-full text-base"
        >
          Salvar
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form
        id="expense-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <label htmlFor="expense-description" className="field-label">
            O que foi?
          </label>
          <input
            id="expense-description"
            autoFocus
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setSubmitError(null);
            }}
            placeholder={segment.expensePlaceholder}
            maxLength={90}
            className="text-input text-[0.9375rem]"
            aria-invalid={Boolean(descriptionError) || undefined}
          />
          {descriptionError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {descriptionError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="expense-amount" className="field-label">
            Quanto saiu?
          </label>
          <MoneyInput
            id="expense-amount"
            value={amountInput}
            onChange={(value) => {
              setAmountInput(value);
              setSubmitError(null);
            }}
            ariaLabel="Quanto saiu"
            invalid={Boolean(amountError)}
          />
          {amountError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {amountError}
            </p>
          ) : null}
        </div>

        <div>
          <span className="field-label">
            Como pagou?{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </span>
          <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} />
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
