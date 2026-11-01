"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { QuantityStepper } from "./quantity-stepper";
import { useApp } from "@/lib/store";
import { formatBRL, formatBRLInput, parseMoneyInput } from "@/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  SOURCE_TYPE_LABELS,
  type PaymentMethod,
} from "@/lib/types";
import { cn } from "@/lib/cn";

interface ReceiptSheetProps {
  onClose: () => void;
}

interface SuccessData {
  kind: "sale" | "expense";
  description: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  hasPhoto: boolean;
}

export function ReceiptSheet({ onClose }: ReceiptSheetProps) {
  const { products, recordSale, recordExpense, segment } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<"sale" | "expense">("sale");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const [amountInput, setAmountInput] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    PaymentMethod | undefined
  >();
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const selectedProduct = products.find((item) => item.id === productId);
  const amountCents = parseMoneyInput(amountInput);

  const saleProducts = useMemo(
    () =>
      [...products].sort((a, b) => {
        const aAvailable = !a.trackStock || a.stock > 0;
        const bAvailable = !b.trackStock || b.stock > 0;
        if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [products],
  );

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const photoError = attempted && !file ? "Anexe a foto da nota." : null;
  const productError =
    attempted && kind === "sale" && !selectedProduct
      ? "Escolha o que foi vendido."
      : null;
  const descriptionError =
    attempted && kind === "expense" && !description.trim()
      ? "Diga o que foi comprado."
      : null;
  const amountError =
    attempted && amountCents < 1 ? "Informe o valor da nota." : null;
  const paymentError =
    attempted && kind === "sale" && !paymentMethod
      ? "Escolha como pagou."
      : null;

  function chooseKind(next: "sale" | "expense") {
    setKind(next);
    setSubmitError(null);
    setAttempted(false);
  }

  function chooseProduct(id: string) {
    const product = products.find((item) => item.id === id);
    setProductId(id);
    setQuantity(1);
    setSubmitError(null);
    if (product) setAmountInput(formatBRLInput(product.priceCents));
  }

  function changeQuantity(next: number) {
    setQuantity(next);
    if (selectedProduct) {
      setAmountInput(formatBRLInput(selectedProduct.priceCents * next));
    }
  }

  function clearPhoto() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting) return;
    if (!file || amountCents < 1) return;
    if (kind === "sale" && (!selectedProduct || !paymentMethod)) return;
    if (kind === "expense" && !description.trim()) return;

    const rawInput = `Foto: ${file.name.trim() || "nota"}`;
    setSubmitting(true);
    try {
      if (kind === "sale" && selectedProduct && paymentMethod) {
        await recordSale({
          productId: selectedProduct.id,
          quantity,
          amountCents,
          paymentMethod,
          sourceType: "image_recognition",
          rawInput,
        });
        setSuccess({
          kind: "sale",
          description: selectedProduct.name,
          amountCents,
          paymentMethod,
          hasPhoto: true,
        });
      } else {
        const method = paymentMethod ?? "other";
        await recordExpense({
          description: description.trim(),
          amountCents,
          paymentMethod: method,
          sourceType: "image_recognition",
          rawInput,
        });
        setSuccess({
          kind: "expense",
          description: description.trim(),
          amountCents,
          paymentMethod: method,
          hasPhoto: true,
        });
      }
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
            {success.description}
          </p>
          <p
            className={cn(
              "mt-1 text-[2.25rem] font-extrabold leading-none tracking-tight tabular",
              success.kind === "sale" ? "text-sage-dark" : "text-ink",
            )}
          >
            {success.kind === "sale" ? "+" : "−"}{" "}
            {formatBRL(success.amountCents)}
          </p>
          <p className="mt-3 text-xs text-muted">
            {PAYMENT_METHOD_LABELS[success.paymentMethod]}
          </p>
          {success.hasPhoto ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-[3px] bg-cream px-2 py-1 text-[0.6875rem] font-medium text-muted">
              <Camera className="size-3" strokeWidth={2} />
              {SOURCE_TYPE_LABELS.image_recognition}
            </p>
          ) : null}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Foto da nota"
      description="Anexe o cupom e confira os valores antes de salvar."
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="receipt-form"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary h-14 w-full text-base"
        >
          {submitting ? "Salvando…" : "Salvar registro"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form
        id="receipt-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <span className="field-label">O que é essa nota?</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "sale", label: "Venda" },
                { value: "expense", label: "Compra" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseKind(option.value)}
                aria-pressed={kind === option.value}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-[4px] border text-sm font-bold transition-colors",
                  kind === option.value
                    ? "border-terracotta bg-terracotta-soft text-terracotta-dark"
                    : "border-line bg-paper text-ink hover:border-sand-dark hover:bg-cream",
                )}
              >
                {kind === option.value ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : null}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Foto da nota</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Escolher foto da nota"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setSubmitError(null);
            }}
          />

          {previewUrl ? (
            <div className="overflow-hidden rounded-[4px] border border-line bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Prévia da nota anexada"
                className="max-h-52 w-full object-contain"
              />
              <div className="flex items-center gap-2 border-t border-line p-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="btn btn-secondary h-9 flex-1 text-xs"
                >
                  <RefreshCw className="size-3.5" strokeWidth={2.2} />
                  Trocar
                </button>
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="btn btn-ghost h-9 px-3 text-xs font-semibold text-terracotta-dark"
                >
                  <Trash2 className="size-3.5" strokeWidth={2} />
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[8rem] w-full flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed border-sand-dark bg-cream px-4 text-center transition-colors hover:border-terracotta hover:bg-terracotta-soft/50"
            >
              <span className="grid size-11 place-items-center rounded-[4px] bg-paper text-terracotta-dark">
                <ImagePlus className="size-5" strokeWidth={1.9} />
              </span>
              <span className="text-sm font-bold text-ink">
                Tirar foto ou escolher
              </span>
              <span className="text-[0.6875rem] text-muted">
                JPG, PNG ou o que a câmera do celular gerar
              </span>
            </button>
          )}

          {photoError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {photoError}
            </p>
          ) : null}
        </div>

        {kind === "sale" ? (
          <>
            <div>
              <label htmlFor="receipt-product" className="field-label">
                O que vendeu?
              </label>
              <select
                id="receipt-product"
                value={productId ?? ""}
                onChange={(event) => chooseProduct(event.target.value)}
                className="text-input"
                aria-invalid={Boolean(productError) || undefined}
              >
                <option value="" disabled>
                  Escolha o item
                </option>
                {saleProducts.map((product) => (
                  <option
                    key={product.id}
                    value={product.id}
                    disabled={product.trackStock && product.stock < 1}
                  >
                    {product.name} · {formatBRL(product.priceCents)}
                    {product.trackStock
                      ? product.stock < 1
                        ? " · sem estoque"
                        : ` · restam ${product.stock}`
                      : " · serviço"}
                  </option>
                ))}
              </select>
              {productError ? (
                <p className="mt-2 text-xs font-medium text-terracotta-dark">
                  {productError}
                </p>
              ) : null}
            </div>

            {selectedProduct?.trackStock ? (
              <div className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3 py-2">
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
          </>
        ) : (
          <div>
            <label htmlFor="receipt-description" className="field-label">
              O que foi comprado?
            </label>
            <input
              id="receipt-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setSubmitError(null);
              }}
              placeholder={segment.expensePlaceholder}
              maxLength={90}
              className="text-input"
              aria-invalid={Boolean(descriptionError) || undefined}
            />
            {descriptionError ? (
              <p className="mt-2 text-xs font-medium text-terracotta-dark">
                {descriptionError}
              </p>
            ) : null}
          </div>
        )}

        <div>
          <label htmlFor="receipt-amount" className="field-label">
            Valor da nota
          </label>
          <MoneyInput
            id="receipt-amount"
            value={amountInput}
            onChange={(value) => {
              setAmountInput(value);
              setSubmitError(null);
            }}
            ariaLabel="Valor da nota"
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
            {kind === "expense" ? (
              <span className="font-normal text-muted">(opcional)</span>
            ) : null}
          </span>
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

        <p className="rounded-[4px] border border-line bg-cream p-3 text-[0.6875rem] leading-relaxed text-muted">
          A foto ajuda você a conferir na hora. Nesta versão ela não é enviada
          para o servidor: o registro fica marcado como vindo de uma foto.
        </p>

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
