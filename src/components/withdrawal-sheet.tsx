"use client";

import { useState } from "react";
import { ArrowRight, Check, HandCoins } from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { useApp } from "@/lib/store";
import { formatBRL, parseMoneyInput } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

interface WithdrawalSheetProps {
  onClose: () => void;
}

interface SuccessData {
  amountCents: number;
  description: string;
}

export function WithdrawalSheet({ onClose }: WithdrawalSheetProps) {
  const { recordWithdrawal } = useApp();
  const [description, setDescription] = useState("Retirada para casa");
  const [amountInput, setAmountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    PaymentMethod | undefined
  >();
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const amountCents = parseMoneyInput(amountInput);
  const descriptionError =
    attempted && !description.trim() ? "Diga para que foi a retirada." : null;
  const amountError =
    attempted && amountCents < 1 ? "Informe quanto você tirou." : null;
  const paymentError =
    attempted && !paymentMethod ? "Escolha de onde saiu." : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting || !description.trim() || amountCents < 1 || !paymentMethod) {
      return;
    }

    setSubmitting(true);
    try {
      await recordWithdrawal({
        description,
        amountCents,
        paymentMethod,
      });
      setSuccess({ amountCents, description: description.trim() });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Sheet
        title="Retirada registrada"
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
          <div className="mx-auto grid size-16 place-items-center rounded-[4px] border border-mustard/40 bg-mustard-soft text-mustard-dark">
            <HandCoins className="size-7" strokeWidth={2.2} />
          </div>
          <p className="mt-4 text-sm font-medium text-muted">
            {success.description}
          </p>
          <p className="mt-1 text-[2.25rem] font-extrabold leading-none tracking-tight text-mustard-dark tabular">
            − {formatBRL(success.amountCents)}
          </p>
          <p className="mx-auto mt-3 max-w-[16rem] text-xs leading-relaxed text-muted">
            Entrou em “Saiu” hoje, mas não é gasto do negócio. Aparece nas
            análises de retirada.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Retirada"
      description="Dinheiro que você tira do caixa para usar como quiser."
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="withdrawal-form"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary h-14 w-full text-base"
        >
          {submitting ? "Salvando…" : "Registrar retirada"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form
        id="withdrawal-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <label htmlFor="withdrawal-amount" className="field-label">
            Quanto você tirou?
          </label>
          <MoneyInput
            id="withdrawal-amount"
            autoFocus
            value={amountInput}
            onChange={(value) => {
              setAmountInput(value);
              setSubmitError(null);
            }}
            ariaLabel="Quanto você tirou"
            invalid={Boolean(amountError)}
          />
          {amountError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {amountError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="withdrawal-description" className="field-label">
            Para quê?
          </label>
          <input
            id="withdrawal-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setSubmitError(null);
            }}
            placeholder="Ex.: mercado, escola, casa"
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
          <span className="field-label">De onde saiu?</span>
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

        <div className="rounded-[4px] border border-mustard/35 bg-mustard-soft/60 p-3">
          <p className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-mustard-dark">
            <Check className="size-3.5" strokeWidth={2.6} />
            Sem confusão
          </p>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink/75">
            Retirada não vira despesa nem conta a pagar. Só sai do caixa e entra
            no seu histórico de retiradas.
          </p>
        </div>
      </form>
    </Sheet>
  );
}
