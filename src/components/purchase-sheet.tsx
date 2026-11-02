"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { QuantityStepper } from "./quantity-stepper";
import { useApp } from "@/lib/store";
import { formatBRL, formatBRLInput, parseMoneyInput } from "@/lib/format";
import { addDaysToDateOnly, formatDateOnly, todayDateOnly } from "@/lib/analytics";
import type { PaymentMethod, Product } from "@/lib/types";

interface PurchaseSheetProps {
  onClose: () => void;
  initialProductId?: string;
  initialSupplierId?: string;
  /** Abre com a foto da nota em destaque (compra registrada pelo fornecedor). */
  initialWithReceipt?: boolean;
}

interface SuccessData {
  productName: string;
  supplierName?: string;
  quantity: number;
  totalCents: number;
  paidNow: boolean;
  dueDate?: string;
  hasReceipt: boolean;
}

export function PurchaseSheet({
  onClose,
  initialProductId,
  initialSupplierId,
  initialWithReceipt = false,
}: PurchaseSheetProps) {
  const { products, suppliers, registerPurchase, addSupplier } = useApp();
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const initialProduct = initialProductId
    ? products.find((product) => product.id === initialProductId)
    : undefined;

  const [productName, setProductName] = useState(initialProduct?.name ?? "");
  const [productId, setProductId] = useState<string | undefined>(
    initialProduct?.id,
  );
  const [quantity, setQuantity] = useState(1);
  const [unitCostInput, setUnitCostInput] = useState(
    initialProduct ? formatBRLInput(initialProduct.costCents) : "",
  );
  const [costTouched, setCostTouched] = useState(false);
  const [supplierId, setSupplierId] = useState<string | undefined>(
    initialSupplierId,
  );
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [paidNow, setPaidNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [dueDate, setDueDate] = useState(addDaysToDateOnly(todayDateOnly(), 14));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(initialWithReceipt);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const selectedProduct = products.find(
    (product) => product.id === productId && product.trackStock,
  );
  const unitCostCents = parseMoneyInput(unitCostInput);
  const totalCents = Math.round(quantity * unitCostCents);
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId,
  );

  const suggestions = useMemo(() => {
    const clean = productName.trim().toLowerCase();
    return products
      .filter(
        (product) =>
          product.trackStock &&
          (!clean ||
            product.name.toLowerCase().includes(clean) ||
            clean.includes(product.name.toLowerCase())),
      )
      .slice(0, 5);
  }, [productName, products]);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreview(null);
      return;
    }
    const url = URL.createObjectURL(receiptFile);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  function clearReceipt() {
    setReceiptFile(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  }

  const nameError = attempted && !productName.trim() ? "Diga o que comprou." : null;
  const costError =
    attempted && unitCostCents < 1 ? "Informe o custo por unidade." : null;
  const supplierError =
    attempted && addingSupplier && !newSupplierName.trim()
      ? "Diga o nome do novo fornecedor."
      : null;
  const paymentError =
    attempted && paidNow && !paymentMethod ? "Escolha como pagou." : null;
  const dateError =
    attempted && !paidNow && !dueDate ? "Escolha o vencimento." : null;

  function chooseProduct(product: Product) {
    setProductName(product.name);
    setProductId(product.id);
    setShowSuggestions(false);
    if (!costTouched) setUnitCostInput(formatBRLInput(product.costCents));
    setSubmitError(null);
  }

  function handleNameChange(value: string) {
    setProductName(value);
    setProductId(undefined);
    setShowSuggestions(true);
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting) return;

    if (
      !productName.trim() ||
      unitCostCents < 1 ||
      (addingSupplier && !newSupplierName.trim()) ||
      (paidNow && !paymentMethod) ||
      (!paidNow && !dueDate)
    ) {
      return;
    }

    setSubmitting(true);
    try {
      let finalSupplierId = supplierId;
      let supplierName = selectedSupplier?.name;

      if (addingSupplier && newSupplierName.trim()) {
        const supplier = await addSupplier({ name: newSupplierName });
        finalSupplierId = supplier.id;
        supplierName = supplier.name;
      }

      const hasReceipt = receiptFile !== null;
      await registerPurchase({
        supplierId: finalSupplierId,
        productId: selectedProduct?.id,
        productName,
        quantity,
        unitCostCents,
        paidNow,
        dueDate: paidNow ? undefined : dueDate,
        paymentMethod: paymentMethod ?? "other",
        sourceType: receiptFile ? "image_recognition" : "manual",
        rawInput: receiptFile
          ? `Nota: ${receiptFile.name.trim() || "foto da nota"}`
          : undefined,
      });

      setSuccess({
        productName: productName.trim(),
        supplierName,
        quantity,
        totalCents,
        paidNow,
        dueDate: paidNow ? undefined : dueDate,
        hasReceipt,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function buyAnother() {
    setSuccess(null);
    setProductName("");
    setProductId(undefined);
    setQuantity(1);
    setUnitCostInput("");
    setCostTouched(false);
    setPaidNow(true);
    setPaymentMethod(undefined);
    setAttempted(false);
    setSubmitError(null);
    clearReceipt();
    setReceiptOpen(initialWithReceipt);
  }

  if (success) {
    return (
      <Sheet
        title={success.paidNow ? "Compra lançada" : "Conta agendada"}
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
            <button
              type="button"
              onClick={buyAnother}
              className="btn btn-primary flex-1"
            >
              Comprar outro
            </button>
          </div>
        }
      >
        <div className="animate-pop py-4 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-[4px] border border-sage/30 bg-sage-soft text-sage-dark">
            <Check className="size-7" strokeWidth={2.4} />
          </div>
          <p className="mt-4 text-sm font-medium text-muted">
            {success.quantity}× {success.productName}
          </p>
          <p className="mt-1 text-[2.25rem] font-extrabold leading-none tracking-tight text-ink tabular">
            {formatBRL(success.totalCents)}
          </p>
          <p className="mt-3 text-xs text-muted">
            {success.paidNow
              ? "Saiu do caixa agora"
              : `Ficou para pagar em ${formatDateOnly(success.dueDate ?? todayDateOnly())}`}
            {success.supplierName ? ` · ${success.supplierName}` : ""}
          </p>
          {success.hasReceipt ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-[3px] bg-cream px-2 py-1 text-[0.6875rem] font-medium text-muted">
              <Camera className="size-3" strokeWidth={2} />
              Registro marcado como vindo de uma nota
            </p>
          ) : null}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={initialWithReceipt ? "Compra pela nota" : "Compra de mercadoria"}
      description={
        initialWithReceipt
          ? "Anexe o cupom e confira o fornecedor, o item e o valor antes de salvar."
          : "A entrada no estoque e o custo do item são atualizados juntos."
      }
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="purchase-form"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary h-14 w-full text-base"
        >
          {submitting
            ? "Salvando…"
            : paidNow
              ? "Salvar compra"
              : "Salvar e agendar"}
          <ArrowRight className="size-5" strokeWidth={2.2} />
        </button>
      }
    >
      <form
        id="purchase-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        {receiptOpen || receiptFile ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="field-label mb-0 flex items-center gap-1.5">
                <Camera
                  className="size-4 flex-none text-terracotta-dark"
                  strokeWidth={2}
                />
                Foto da nota{" "}
                <span className="font-normal text-muted">(opcional)</span>
              </span>
              {!receiptFile ? (
                <button
                  type="button"
                  onClick={() => setReceiptOpen(false)}
                  className="text-[0.6875rem] font-bold text-muted underline underline-offset-2 transition-colors hover:text-ink"
                >
                  Ocultar
                </button>
              ) : null}
            </div>

            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Escolher foto da nota da compra"
              onChange={(event) => {
                setReceiptFile(event.target.files?.[0] ?? null);
                setSubmitError(null);
              }}
            />

            {receiptPreview ? (
              <div className="overflow-hidden rounded-[4px] border border-line bg-cream">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptPreview}
                  alt="Prévia da nota da compra"
                  className="max-h-52 w-full object-contain"
                />
                <div className="flex items-center gap-2 border-t border-line p-2">
                  <button
                    type="button"
                    onClick={() => receiptInputRef.current?.click()}
                    className="btn btn-secondary h-9 flex-1 text-xs"
                  >
                    <RefreshCw className="size-3.5" strokeWidth={2.2} />
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={clearReceipt}
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
                onClick={() => receiptInputRef.current?.click()}
                className="flex min-h-[6.75rem] w-full flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed border-sand-dark bg-cream px-4 text-center transition-colors hover:border-terracotta hover:bg-terracotta-soft/50"
              >
                <span className="grid size-10 place-items-center rounded-[4px] bg-paper text-terracotta-dark">
                  <ImagePlus className="size-5" strokeWidth={1.9} />
                </span>
                <span className="text-sm font-bold text-ink">
                  Tirar foto ou escolher
                </span>
                <span className="text-[0.6875rem] text-muted">
                  Cupom, nota fiscal ou comprovante
                </span>
              </button>
            )}

            <p className="field-hint">
              Nesta versão a foto não é enviada para o servidor. O registro fica
              marcado como vindo de uma nota para você conferir depois.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReceiptOpen(true)}
            className="flex w-full items-center gap-3 rounded-[4px] border border-dashed border-sand-dark bg-cream p-3 text-left transition-colors hover:border-terracotta hover:bg-terracotta-soft/40"
          >
            <span className="grid size-10 flex-none place-items-center rounded-[4px] bg-paper text-terracotta-dark">
              <Camera className="size-5" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] font-bold text-ink">
                Registrar pela nota
              </span>
              <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted">
                Anexe o cupom ou a nota fiscal (opcional)
              </span>
            </span>
            <Plus className="size-4 flex-none text-muted" strokeWidth={2.2} />
          </button>
        )}

        <div className="relative">
          <label htmlFor="purchase-item" className="field-label">
            O que você comprou?
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              strokeWidth={1.9}
            />
            <input
              id="purchase-item"
              autoFocus={!initialProduct && !initialWithReceipt}
              value={productName}
              onChange={(event) => handleNameChange(event.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                window.setTimeout(() => setShowSuggestions(false), 120);
              }}
              placeholder="Ex.: Pão de queijo"
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
                    {formatBRL(product.costCents)} / {product.unit}
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
          {selectedProduct ? (
            <p className="field-hint">
              {selectedProduct.stock}{" "}
              {selectedProduct.stock === 1
                ? selectedProduct.unit
                : selectedProduct.unitPlural}{" "}
              em estoque hoje
            </p>
          ) : (
            <p className="field-hint">
              Item novo? Ele entra no estoque com o custo desta compra.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3 py-2">
          <span className="text-[0.8125rem] font-semibold">Quantidade</span>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={9999}
            label="Quantidade comprada"
          />
        </div>

        <div>
          <label htmlFor="purchase-cost" className="field-label">
            Custo por unidade
          </label>
          <MoneyInput
            id="purchase-cost"
            value={unitCostInput}
            onChange={(value) => {
              setUnitCostInput(value);
              setCostTouched(true);
              setSubmitError(null);
            }}
            ariaLabel="Custo por unidade"
            invalid={Boolean(costError)}
          />
          {costError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {costError}
            </p>
          ) : (
            <p className="field-hint">
              Total da compra:{" "}
              <strong className="text-ink">{formatBRL(totalCents)}</strong>
              {selectedProduct && selectedProduct.costCents > 0
                ? ` · custo médio atual ${formatBRL(selectedProduct.costCents)}`
                : ""}
            </p>
          )}
        </div>

        <div>
          <span className="field-label">Fornecedor</span>
          {addingSupplier ? (
            <div className="rounded-[4px] border border-line bg-cream p-3">
              <label htmlFor="purchase-new-supplier" className="sr-only">
                Nome do novo fornecedor
              </label>
              <input
                id="purchase-new-supplier"
                value={newSupplierName}
                onChange={(event) => {
                  setNewSupplierName(event.target.value);
                  setSubmitError(null);
                }}
                placeholder="Nome do novo fornecedor"
                className="text-input"
                autoComplete="off"
                aria-invalid={Boolean(supplierError) || undefined}
              />
              {supplierError ? (
                <p className="mt-2 text-xs font-medium text-terracotta-dark">
                  {supplierError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setAddingSupplier(false);
                  setNewSupplierName("");
                }}
                className="mt-2 text-[0.6875rem] font-bold text-muted underline underline-offset-2 hover:text-ink"
              >
                Escolher um fornecedor já salvo
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={supplierId ?? ""}
                onChange={(event) => {
                  setSupplierId(event.target.value || undefined);
                  setSubmitError(null);
                }}
                className="text-input min-w-0 flex-1"
                aria-label="Fornecedor da compra"
              >
                <option value="">Sem fornecedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAddingSupplier(true)}
                className="btn btn-secondary h-[3.25rem] flex-none px-3 text-xs"
              >
                <Plus className="size-4" strokeWidth={2.2} />
                Novo
              </button>
            </div>
          )}
          <p className="field-hint">
            <Truck className="mr-1 inline size-3.5 align-[-2px]" strokeWidth={2} />
            O fornecedor alimenta a comparação de preços.
          </p>
        </div>

        <div>
          <span className="field-label">Como ficou o pagamento?</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPaidNow(true);
                setSubmitError(null);
              }}
              aria-pressed={paidNow}
              data-selected={paidNow}
              className="option-tile min-h-[3.25rem] text-xs"
            >
              Paguei agora
            </button>
            <button
              type="button"
              onClick={() => {
                setPaidNow(false);
                setSubmitError(null);
              }}
              aria-pressed={!paidNow}
              data-selected={!paidNow}
              className="option-tile min-h-[3.25rem] text-xs"
            >
              Ficou para pagar
            </button>
          </div>

          {paidNow ? (
            <div className="mt-4">
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
          ) : (
            <div className="mt-4">
              <label htmlFor="purchase-due" className="field-label">
                Vencimento da conta
              </label>
              <input
                id="purchase-due"
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
              ) : null}
              <p className="field-hint">
                A saída do caixa só acontece quando você pagar a conta.
              </p>
            </div>
          )}
        </div>

        {submitError ? (
          <p
            role="alert"
            className="rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium text-terracotta-dark"
          >
            {submitError}
          </p>
        ) : null}

        <div className="flex items-start gap-2 rounded-[4px] border border-line bg-cream p-3">
          <PackageSearch
            className="mt-0.5 size-4 flex-none text-sage-dark"
            strokeWidth={2}
          />
          <p className="text-[0.6875rem] leading-relaxed text-muted">
            A quantidade entra no estoque agora. O preço de venda não muda
            sozinho — você continua no controle.
          </p>
        </div>
      </form>
    </Sheet>
  );
}
