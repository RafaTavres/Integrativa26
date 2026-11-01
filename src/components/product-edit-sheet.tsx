"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { formatBRLInput, parseMoneyInput } from "@/lib/format";

interface ProductEditSheetProps {
  productId: string;
  onClose: () => void;
}

export function ProductEditSheet({
  productId,
  onClose,
}: ProductEditSheetProps) {
  const { products, updateProduct } = useApp();
  const { toast } = useToast();
  const product = products.find((item) => item.id === productId);

  const [name, setName] = useState(product?.name ?? "");
  const [priceInput, setPriceInput] = useState(
    product ? formatBRLInput(product.priceCents) : "",
  );
  const [minStock, setMinStock] = useState(String(product?.minStock ?? 0));
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!product) return null;

  const priceCents = parseMoneyInput(priceInput);
  const nameError = attempted && !name.trim() ? "Diga o nome." : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    try {
      await updateProduct(productId, {
        name,
        priceCents,
        minStock: Number.parseInt(minStock || "0", 10) || 0,
      });
      toast("Item atualizado.");
      onClose();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
        "info",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      title={product.trackStock ? "Ajustar item" : "Ajustar serviço"}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="product-form"
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
        id="product-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <label htmlFor="product-name" className="field-label">
            Nome
          </label>
          <input
            id="product-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="text-input"
            maxLength={70}
            aria-invalid={Boolean(nameError) || undefined}
          />
          {nameError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {nameError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="product-price" className="field-label">
            Preço
          </label>
          <MoneyInput
            id="product-price"
            value={priceInput}
            onChange={setPriceInput}
            ariaLabel="Preço de venda"
          />
        </div>

        {product.trackStock ? (
          <div>
            <label htmlFor="product-min" className="field-label">
              Avisar quando chegar em
            </label>
            <div className="flex items-center gap-3">
              <input
                id="product-min"
                inputMode="numeric"
                value={minStock}
                onChange={(event) =>
                  setMinStock(event.target.value.replace(/\D/g, ""))
                }
                className="text-input w-24 text-center font-bold"
              />
              <span className="text-sm text-muted">
                {product.unitPlural}
              </span>
            </div>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
