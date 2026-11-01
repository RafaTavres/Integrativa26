"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Search } from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { QuantityStepper } from "./quantity-stepper";
import { useApp } from "@/lib/store";
import { formatBRL, formatBRLInput, parseMoneyInput } from "@/lib/format";
import type { Product } from "@/lib/types";

interface StockEntrySheetProps {
  onClose: () => void;
  initialProductId?: string;
}

interface SuccessData {
  product: Product;
  quantity: number;
  totalCostCents: number;
}

export function StockEntrySheet({
  onClose,
  initialProductId,
}: StockEntrySheetProps) {
  const { products, addStock, segment } = useApp();
  const initialProduct = initialProductId
    ? products.find(
        (product) => product.id === initialProductId && product.trackStock,
      )
    : undefined;

  const [name, setName] = useState(initialProduct?.name ?? "");
  const [selectedProductId, setSelectedProductId] = useState<
    string | undefined
  >(initialProduct?.id);
  const [quantity, setQuantity] = useState(1);
  const [costInput, setCostInput] = useState(
    initialProduct ? formatBRLInput(initialProduct.costCents) : "",
  );
  const [costTouched, setCostTouched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId && product.trackStock,
  );
  const totalCostCents = parseMoneyInput(costInput);

  useEffect(() => {
    if (costTouched) return;
    if (selectedProduct) {
      setCostInput(formatBRLInput(selectedProduct.costCents * quantity));
    }
  }, [selectedProduct, quantity, costTouched]);

  const suggestions = useMemo(() => {
    const clean = name.trim().toLowerCase();
    return products
      .filter(
        (product) =>
          product.trackStock &&
          (!clean ||
            product.name.toLowerCase().includes(clean) ||
            clean.includes(product.name.toLowerCase())),
      )
      .slice(0, 5);
  }, [name, products]);

  const nameError = attempted && !name.trim() ? "Diga o que chegou." : null;
  const costError =
    attempted && costInput.trim() && totalCostCents < 1
      ? "Informe um valor válido."
      : null;

  function chooseProduct(product: Product) {
    setName(product.name);
    setSelectedProductId(product.id);
    setShowSuggestions(false);
    setCostTouched(false);
    setSubmitError(null);
  }

  function handleNameChange(value: string) {
    setName(value);
    setSelectedProductId(undefined);
    setCostTouched(false);
    setShowSuggestions(true);
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting) return;
    if (!name.trim()) return;
    if (costInput.trim() && totalCostCents < 1) return;

    setSubmitting(true);
    try {
      const result = await addStock({
        productId: selectedProduct?.id,
        name,
        quantity,
        totalCostCents,
      });
      setSuccess({
        product: result.product,
        quantity,
        totalCostCents,
      });
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
            {success.product.name}
          </p>
          <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-tight text-ink">
            +{success.quantity}{" "}
            {success.quantity === 1
              ? success.product.unit
              : success.product.unitPlural}
          </p>
          {success.totalCostCents > 0 ? (
            <p className="mt-3 text-xs text-muted">
              Custo {formatBRL(success.totalCostCents)}
            </p>
          ) : null}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={selectedProduct ? "Repor" : segment.stockQuestion}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="stock-form"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary h-14 w-full text-base"
        >
          {submitting ? "Salvando…" : "Salvar"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form
        id="stock-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div className="relative">
          <label htmlFor="stock-name" className="field-label">
            {segment.stockQuestion}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              strokeWidth={1.9}
            />
            <input
              id="stock-name"
              autoFocus={!initialProduct}
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                window.setTimeout(() => setShowSuggestions(false), 120);
              }}
              placeholder={segment.stockPlaceholder}
              className="text-input pl-10"
              autoComplete="off"
              aria-invalid={Boolean(nameError) || undefined}
            />
          </div>

          {showSuggestions && suggestions.length > 0 && !selectedProduct ? (
            <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[4px] border border-line bg-paper shadow-[0_12px_40px_rgba(51,45,43,0.14)]">
              {suggestions.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseProduct(product)}
                  className="flex w-full items-center justify-between gap-3 border-b border-line/70 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-cream"
                >
                  <span className="truncate text-[0.8125rem] font-semibold text-ink">
                    {product.name}
                  </span>
                  <span className="text-[0.6875rem] font-bold text-terracotta-dark">
                    Repor
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {nameError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3 py-2">
          <span className="text-[0.8125rem] font-semibold">Quantidade</span>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={999}
            label="Quantidade que chegou"
          />
        </div>

        <div>
          <label htmlFor="stock-cost" className="field-label">
            Quanto custou?{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <MoneyInput
            id="stock-cost"
            value={costInput}
            onChange={(value) => {
              setCostInput(value);
              setCostTouched(true);
              setSubmitError(null);
            }}
            ariaLabel="Quanto custou no total"
            invalid={Boolean(costError)}
          />
          {costError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {costError}
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
      </form>
    </Sheet>
  );
}
