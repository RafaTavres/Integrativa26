"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Mic, PackageOpen } from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { QuantityStepper } from "./quantity-stepper";
import { useToast } from "./toast";
import { useApp } from "@/lib/store";
import { formatBRL, formatBRLInput, parseMoneyInput } from "@/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type Product,
} from "@/lib/types";
import { cn } from "@/lib/cn";

interface SaleSheetProps {
  onClose: () => void;
  pendingId?: string;
}

interface SuccessData {
  productName: string;
  quantity: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
}

function ProductTile({
  product,
  selected,
  onSelect,
  disabled,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "relative min-h-[4rem] rounded-[4px] border p-2.5 text-left transition-colors",
        selected
          ? "border-terracotta bg-terracotta-soft"
          : "border-line bg-paper hover:border-sand-dark hover:bg-cream",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span className="block truncate pr-5 text-[0.8125rem] font-bold leading-tight text-ink">
        {product.name}
      </span>
      <span className="mt-1 block text-xs font-semibold text-terracotta-dark">
        {formatBRL(product.priceCents)}
      </span>
      {!product.trackStock ? (
        <span className="mt-0.5 block text-[0.625rem] text-muted">
          Serviço
        </span>
      ) : product.stock <= product.minStock ? (
        <span className="mt-0.5 block text-[0.625rem] text-mustard-dark">
          {product.stock === 0 ? "Sem estoque" : `Restam ${product.stock}`}
        </span>
      ) : null}
      {selected ? (
        <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-[2px] bg-terracotta text-cream">
          <Check className="size-2.5" strokeWidth={3.2} />
        </span>
      ) : null}
    </button>
  );
}

export function SaleSheet({ onClose, pendingId }: SaleSheetProps) {
  const {
    products,
    transactions,
    recordSale,
    reviewPending,
    discardPending,
    segment,
  } = useApp();
  const { toast } = useToast();
  const pending = pendingId
    ? transactions.find(
        (transaction) =>
          transaction.id === pendingId &&
          transaction.status === "pending_review",
      )
    : undefined;
  // Guarda o modo do primeiro render: depois de confirmar, o registro deixa
  // de ser "pending" e não pode mudar a tela de sucesso.
  const [isReview] = useState(() => Boolean(pendingId && pending));

  const initialProduct = pending?.productId
    ? products.find((product) => product.id === pending.productId)
    : undefined;

  const [productId, setProductId] = useState<string | undefined>(
    initialProduct?.id,
  );
  const [quantity, setQuantity] = useState(pending?.quantity ?? 1);
  const [amountInput, setAmountInput] = useState(
    pending ? formatBRLInput(pending.amountCents) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState<
    PaymentMethod | undefined
  >(pending?.paymentMethod);
  const [showPicker, setShowPicker] = useState(!initialProduct);
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );
  const amountCents = parseMoneyInput(amountInput);
  const availableProducts = useMemo(
    () =>
      [...products].sort((a, b) => {
        const aAvailable = !a.trackStock || a.stock > 0;
        const bAvailable = !b.trackStock || b.stock > 0;
        if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [products],
  );

  const productError =
    attempted && !selectedProduct ? "Escolha o que você vendeu." : null;
  const amountError =
    attempted && amountCents < 1 ? "Informe quanto entrou." : null;
  const paymentError =
    attempted && !paymentMethod ? "Escolha como pagou." : null;

  function chooseProduct(product: Product) {
    setProductId(product.id);
    setQuantity(1);
    setAmountInput(formatBRLInput(product.priceCents));
    setShowPicker(false);
    setSubmitError(null);
  }

  function changeQuantity(next: number) {
    setQuantity(next);
    if (selectedProduct) {
      setAmountInput(formatBRLInput(selectedProduct.priceCents * next));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (!selectedProduct || amountCents < 1 || !paymentMethod) return;

    try {
      if (pending) {
        reviewPending({
          transactionId: pending.id,
          productId: selectedProduct.id,
          quantity,
          amountCents,
          paymentMethod,
        });
      } else {
        recordSale({
          productId: selectedProduct.id,
          quantity,
          amountCents,
          paymentMethod,
        });
      }
      setSuccess({
        productName: selectedProduct.name,
        quantity,
        amountCents,
        paymentMethod,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
    }
  }

  function sellAnother() {
    setSuccess(null);
    setProductId(undefined);
    setQuantity(1);
    setAmountInput("");
    setPaymentMethod(undefined);
    setShowPicker(true);
    setAttempted(false);
    setSubmitError(null);
  }

  function handleDiscard() {
    if (!pending) return;
    discardPending(pending.id);
    toast("Rascunho descartado.", "info");
    onClose();
  }

  if (success) {
    return (
      <Sheet
        title={isReview ? "Confirmado" : "Tudo certo"}
        onClose={onClose}
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Fechar
            </button>
            {!isReview ? (
              <button
                type="button"
                onClick={sellAnother}
                className="btn btn-primary flex-1"
              >
                Registrar outra
              </button>
            ) : null}
          </div>
        }
      >
        <div className="animate-pop py-4 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-[4px] border border-sage/30 bg-sage-soft text-sage-dark">
            <Check className="size-7" strokeWidth={2.4} />
          </div>
          <p className="mt-4 text-sm font-medium text-muted">
            {success.quantity > 1 ? `${success.quantity}× ` : ""}
            {success.productName}
          </p>
          <p className="mt-1 text-[2.25rem] font-extrabold leading-none tracking-tight text-sage-dark tabular">
            + {formatBRL(success.amountCents)}
          </p>
          <p className="mt-3 text-xs text-muted">
            {PAYMENT_METHOD_LABELS[success.paymentMethod]}
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={isReview ? "Confira a venda" : segment.saleTitle}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="sale-form"
          className="btn btn-primary h-14 w-full text-base"
        >
          {isReview ? "Confirmar" : "Salvar"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form id="sale-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {isReview && pending ? (
          <div className="rounded-[4px] border border-mustard/35 bg-mustard-soft/70 p-3">
            <div className="flex items-center gap-2 text-mustard-dark">
              <Mic className="size-4" strokeWidth={2.1} />
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em]">
                O que ouvimos
              </span>
            </div>
            <p className="mt-1.5 text-[0.8125rem] italic leading-relaxed text-ink/85">
              “{pending.rawInput}”
            </p>
            <button
              type="button"
              onClick={handleDiscard}
              className="mt-2 text-[0.6875rem] font-bold text-mustard-dark underline underline-offset-2 transition-colors hover:text-ink"
            >
              Não foi venda? Descartar
            </button>
          </div>
        ) : null}

        <div>
          <label className="field-label">{segment.saleQuestion}</label>

          {products.length > 0 ? (
            showPicker || !selectedProduct ? (
              <div className="max-h-[13.5rem] overflow-y-auto pr-0.5">
                <div className="grid grid-cols-2 gap-2">
                  {availableProducts.map((product) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      selected={product.id === productId}
                      onSelect={() => chooseProduct(product)}
                      disabled={product.trackStock && product.stock < 1}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 rounded-[4px] border border-terracotta/60 bg-terracotta-soft p-3">
                  <span className="grid size-8 flex-none place-items-center rounded-[3px] bg-terracotta text-cream">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-bold leading-tight text-ink">
                      {selectedProduct.name}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] text-muted">
                      {formatBRL(selectedProduct.priceCents)}
                      {selectedProduct.trackStock
                        ? ` · ${selectedProduct.stock} em estoque`
                        : " · serviço"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="flex-none rounded-[3px] border border-terracotta/30 bg-paper px-2.5 py-1.5 text-[0.6875rem] font-bold text-terracotta-dark transition-colors hover:bg-paper/70"
                  >
                    Trocar
                  </button>
                </div>

                {selectedProduct.trackStock ? (
                  <div className="flex items-center justify-between gap-2 rounded-[4px] border border-line bg-cream px-3 py-2">
                    <span className="text-[0.8125rem] font-semibold">
                      Quantidade
                    </span>
                    <QuantityStepper
                      value={quantity}
                      onChange={changeQuantity}
                      min={1}
                      max={Math.max(1, selectedProduct.stock)}
                      label="Quantidade vendida"
                    />
                  </div>
                ) : null}
              </div>
            )
          ) : (
            <div className="rounded-[4px] border border-dashed border-line bg-cream p-4 text-center">
              <PackageOpen className="mx-auto size-6 text-muted" />
              <p className="mt-2 text-sm font-medium">
                Nenhum item cadastrado.
              </p>
            </div>
          )}

          {productError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {productError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="sale-amount" className="field-label">
            Quanto entrou?
          </label>
          <MoneyInput
            id="sale-amount"
            value={amountInput}
            onChange={(value) => {
              setAmountInput(value);
              setSubmitError(null);
            }}
            ariaLabel="Quanto entrou"
            invalid={Boolean(amountError)}
            describedBy={amountError ? "sale-amount-error" : undefined}
          />
          {amountError ? (
            <p
              id="sale-amount-error"
              className="mt-2 text-xs font-medium text-terracotta-dark"
            >
              {amountError}
            </p>
          ) : null}
        </div>

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
      </form>
    </Sheet>
  );
}
