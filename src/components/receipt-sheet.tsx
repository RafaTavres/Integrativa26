"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { QuantityStepper } from "./quantity-stepper";
import { useApp } from "@/lib/store";
import { addDaysToDateOnly, todayDateOnly } from "@/lib/analytics";
import { formatBRL, formatBRLInput, parseMoneyInput } from "@/lib/format";
import {
  isAbortError,
  matchProductByName,
  matchSupplierByName,
  readReceiptPhoto,
  tidyItemName,
  type ReceiptDraft,
} from "@/lib/ocr";
import {
  PAYMENT_METHOD_LABELS,
  SOURCE_TYPE_LABELS,
  type PaymentMethod,
} from "@/lib/types";
import { cn } from "@/lib/cn";

interface ReceiptSheetProps {
  onClose: () => void;
}

type Phase = "capture" | "processing" | "review" | "success";
type Kind = "purchase" | "sale";

interface EditableItem {
  key: string;
  name: string;
  quantity: number;
  unitCostInput: string;
  /** Produto existente que recebe a entrada. Vazio cria um produto novo. */
  productId?: string;
  /** A pessoa escolheu o produto; não sobrescrever com a identificação automática. */
  manualMatch?: boolean;
}

interface SuccessData {
  kind: Kind;
  description: string;
  detail: string;
  totalCents: number;
  paymentMethod: PaymentMethod;
}

function emptyDraft(): ReceiptDraft {
  return {
    kind: "purchase",
    items: [],
    rawText: "",
    confidence: 0,
    warnings: [],
  };
}

function formatCnpj(digits: string): string {
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

function formatReceiptDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function productUnit(
  product: { unit: string; unitPlural: string },
  quantity: number,
): string {
  return quantity === 1 ? product.unit : product.unitPlural || product.unit;
}

export function ReceiptSheet({ onClose }: ReceiptSheetProps) {
  const {
    products,
    suppliers,
    recordSale,
    registerPurchase,
    addSupplier,
  } = useApp();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemCounterRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("capture");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [progress, setProgress] = useState({ value: 0, status: "" });
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("purchase");
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [supplierName, setSupplierName] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<
    PaymentMethod | undefined
  >();
  const [paidNow, setPaidNow] = useState(true);
  const [dueDate, setDueDate] = useState(addDaysToDateOnly(todayDateOnly(), 14));
  const [productId, setProductId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const [amountInput, setAmountInput] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const selectedProduct = products.find((product) => product.id === productId);
  const saleAmountCents = parseMoneyInput(amountInput);
  const purchaseTotalCents = items.reduce(
    (total, item) =>
      total + item.quantity * parseMoneyInput(item.unitCostInput),
    0,
  );
  const reviewTotalCents =
    kind === "purchase" ? purchaseTotalCents : saleAmountCents;

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

  const stockProducts = useMemo(
    () =>
      products
        .filter((product) => product.trackStock)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [products],
  );

  useEffect(() => {
    if (!photoFile) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function nextItemKey(): string {
    itemCounterRef.current += 1;
    return `photo-item-${itemCounterRef.current}`;
  }

  function blankItem(): EditableItem {
    return {
      key: nextItemKey(),
      name: "",
      quantity: 1,
      unitCostInput: "",
    };
  }

  function hydrateReview(result: ReceiptDraft) {
    const matchedSupplier = matchSupplierByName(
      result.supplierName,
      suppliers,
    );
    const firstItem = result.items[0];
    const matchedProduct = firstItem
      ? matchProductByName(firstItem.name, products)
      : undefined;
    const nextItems = result.items.length
      ? result.items.map((item) => {
          const matched = matchProductByName(item.name, products);
          return {
            key: nextItemKey(),
            // Se o produto já existe, usa o nome cadastrado. Senão, organiza o
            // nome lido: "FARINHA DE TRIGO" vira "Farinha de trigo".
            name: matched ? matched.name : tidyItemName(item.name),
            quantity: Math.max(1, item.quantity),
            unitCostInput: formatBRLInput(item.unitCostCents),
            productId: matched?.trackStock ? matched.id : undefined,
            manualMatch: false,
          };
        })
      : [blankItem()];

    setKind(result.kind);
    setSupplierId(matchedSupplier?.id);
    setSupplierName(
      matchedSupplier ? matchedSupplier.name : (result.supplierName ?? ""),
    );
    setItems(nextItems);
    setPaymentMethod(result.paymentMethod);
    setPaidNow(true);
    setDueDate(addDaysToDateOnly(todayDateOnly(), 14));
    setProductId(matchedProduct?.id);
    // Numa venda, a quantidade lida só faz sentido se o item da nota já era
    // um produto cadastrado. Caso contrário, começa em 1 para não bloquear a
    // escolha de itens com pouco estoque.
    setQuantity(matchedProduct ? (firstItem?.quantity ?? 1) : 1);
    setAmountInput(
      result.totalCents
        ? formatBRLInput(result.totalCents)
        : matchedProduct
          ? formatBRLInput(matchedProduct.priceCents)
          : "",
    );
    setAttempted(false);
    setSaveError(null);
  }

  async function runOcr(file: File, nextRotation: number) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("processing");
    setOcrError(null);
    setProgress({ value: 0.02, status: "Preparando a foto" });

    try {
      const result = await readReceiptPhoto(file, {
        rotation: nextRotation,
        signal: controller.signal,
        onProgress: ({ progress: value, status }) =>
          setProgress({ value, status }),
      });
      if (controller.signal.aborted) return;
      setDraft(result);
      hydrateReview(result);
      setPhase("review");
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setOcrError(
        error instanceof Error
          ? error.message
          : "Não conseguimos ler esta foto agora.",
      );
      setPhase("capture");
    }
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setPhotoFile(file);
    setRotation(0);
    setDraft(null);
    void runOcr(file, 0);
  }

  function cancelReading() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("capture");
    setProgress({ value: 0, status: "" });
  }

  function changePhoto() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhotoFile(null);
    setDraft(null);
    setOcrError(null);
    setProgress({ value: 0, status: "" });
    setPhase("capture");
  }

  function rotatePhoto() {
    if (!photoFile || phase === "processing") return;
    const next = (rotation + 90) % 360;
    setRotation(next);
    void runOcr(photoFile, next);
  }

  function startManual() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhotoFile(null);
    setRotation(0);
    const manual = emptyDraft();
    setDraft(manual);
    hydrateReview(manual);
    setPhase("review");
  }

  function chooseKind(next: Kind) {
    setKind(next);
    setAttempted(false);
    setSaveError(null);
    if (next === "sale" && !amountInput && draft?.totalCents) {
      setAmountInput(formatBRLInput(draft.totalCents));
    }
  }

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
    setSaveError(null);
  }

  function removeItem(key: string) {
    setItems((current) => {
      const next = current.filter((item) => item.key !== key);
      return next.length ? next : [blankItem()];
    });
    setSaveError(null);
  }

  function chooseItemProduct(key: string, id: string) {
    const product = products.find(
      (candidate) => candidate.id === id && candidate.trackStock,
    );
    updateItem(key, {
      productId: product?.id,
      ...(product ? { name: product.name } : {}),
      // A escolha foi consciente: a identificação automática não deve
      // desfazer nem "Criar produto novo" nem um produto escolhido à mão.
      manualMatch: true,
    });
  }

  function identifyItem(key: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key || item.manualMatch) return item;
        const name = tidyItemName(item.name);
        if (!name) return item;
        const matched = matchProductByName(name, products);
        return {
          ...item,
          name: matched ? matched.name : name,
          productId: matched?.trackStock ? matched.id : undefined,
        };
      }),
    );
    setSaveError(null);
  }

  function chooseSaleProduct(id: string) {
    const product = products.find((item) => item.id === id);
    setProductId(id);
    setSaveError(null);
    if (product && !amountInput) {
      setAmountInput(formatBRLInput(product.priceCents * quantity));
    }
  }

  function changeSaleQuantity(next: number) {
    setQuantity(next);
    if (!amountInput && selectedProduct) {
      setAmountInput(formatBRLInput(selectedProduct.priceCents * next));
    }
  }

  const validItems = items.filter(
    (item) =>
      item.name.trim().length > 0 && parseMoneyInput(item.unitCostInput) > 0,
  );

  const namedItems = items.filter((item) => item.name.trim().length > 0);
  const linkedItemCount = namedItems.filter(
    (item) =>
      item.productId &&
      products.some(
        (product) => product.id === item.productId && product.trackStock,
      ),
  ).length;
  const newItemCount = namedItems.length - linkedItemCount;

  const itemNameError =
    attempted && kind === "purchase" && validItems.length === 0
      ? "Dê um nome e um custo para pelo menos um item."
      : null;
  const productError =
    attempted && kind === "sale" && !selectedProduct
      ? "Escolha o que foi vendido."
      : null;
  const amountError =
    attempted && kind === "sale" && saleAmountCents < 1
      ? "Informe quanto entrou."
      : null;
  const paymentError =
    attempted &&
    !paymentMethod &&
    (kind === "sale" || paidNow)
      ? "Escolha como pagou."
      : null;
  const dateError =
    attempted && kind === "purchase" && !paidNow && !dueDate
      ? "Escolha o vencimento."
      : null;

  const totalMismatch =
    draft?.totalCents &&
    kind === "purchase" &&
    purchaseTotalCents > 0 &&
    Math.abs(purchaseTotalCents - draft.totalCents) >
      Math.max(5, draft.totalCents * 0.02)
      ? draft.totalCents
      : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSaveError(null);
    if (saving) return;

    if (kind === "sale") {
      if (!selectedProduct || !paymentMethod || saleAmountCents < 1) return;
    } else if (
      validItems.length === 0 ||
      (!paidNow && !dueDate) ||
      (paidNow && !paymentMethod)
    ) {
      return;
    }

    const rawInput = photoFile
      ? `Foto: ${photoFile.name.trim() || "nota"}${
          draft?.rawText
            ? ` · ${draft.rawText.slice(0, 1500).replace(/\s+/g, " ").trim()}`
            : ""
        }`
      : "Registro preenchido sem foto";
    const sourceType = photoFile ? "image_recognition" : "manual";

    setSaving(true);
    try {
      if (kind === "sale" && selectedProduct && paymentMethod) {
        await recordSale({
          productId: selectedProduct.id,
          quantity,
          amountCents: saleAmountCents,
          paymentMethod,
          sourceType,
          rawInput,
        });
        setSuccess({
          kind: "sale",
          description: selectedProduct.name,
          detail:
            quantity === 1 ? "1 unidade" : `${quantity} unidades`,
          totalCents: saleAmountCents,
          paymentMethod,
        });
        setPhase("success");
        return;
      }

      let finalSupplierId = supplierId;
      const typedSupplier = supplierName.trim();
      if (!finalSupplierId && typedSupplier) {
        const existing = matchSupplierByName(typedSupplier, suppliers);
        if (existing) {
          finalSupplierId = existing.id;
        } else {
          const created = await addSupplier({ name: typedSupplier });
          finalSupplierId = created.id;
        }
      }

      let saved = 0;
      const savedKeys = new Set<string>();
      try {
        for (const item of validItems) {
          const matched = item.productId
            ? products.find(
                (product) => product.id === item.productId && product.trackStock,
              )
            : undefined;
          await registerPurchase({
            supplierId: finalSupplierId,
            productId: matched?.id,
            productName: item.name.trim(),
            quantity: item.quantity,
            unitCostCents: parseMoneyInput(item.unitCostInput),
            paidNow,
            dueDate: paidNow ? undefined : dueDate,
            paymentMethod: paymentMethod ?? "other",
            sourceType,
            rawInput,
          });
          saved += 1;
          savedKeys.add(item.key);
        }
      } catch (error) {
        if (savedKeys.size > 0) {
          // Remove da conferência o que já entrou, para uma nova tentativa não
          // duplicar a compra dos itens que deram certo.
          setItems((current) => {
            const remaining = current.filter(
              (item) => !savedKeys.has(item.key),
            );
            return remaining.length ? remaining : [blankItem()];
          });
        }
        throw new Error(
          saved > 0
            ? `Salvamos ${saved} de ${validItems.length} itens. ${
                error instanceof Error ? error.message : "Tente os restantes de novo."
              }`
            : error instanceof Error
              ? error.message
              : "Não conseguimos salvar a compra.",
        );
      }

      const supplierLabel =
        suppliers.find((supplier) => supplier.id === finalSupplierId)?.name ??
        typedSupplier;

      setSuccess({
        kind: "purchase",
        description:
          validItems.length === 1
            ? validItems[0].name.trim()
            : `${validItems.length} itens`,
        detail: supplierLabel
          ? `${supplierLabel} · ${
              paidNow ? "pago agora" : `para pagar em ${dueDate}`
            }`
          : paidNow
            ? "pago agora"
            : `para pagar em ${dueDate}`,
        totalCents: purchaseTotalCents,
        paymentMethod: paymentMethod ?? "other",
      });
      setPhase("success");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (phase === "success" && success) {
    return (
      <Sheet
        title="Registro concluído"
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
            {success.kind === "sale" ? "+" : "−"} {formatBRL(success.totalCents)}
          </p>
          <p className="mt-3 text-xs text-muted">{success.detail}</p>
          <p className="mt-1 text-xs text-muted">
            {PAYMENT_METHOD_LABELS[success.paymentMethod]}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-[3px] bg-cream px-2 py-1 text-[0.6875rem] font-medium text-muted">
            {photoFile ? (
              <>
                <Camera className="size-3" strokeWidth={2} />
                {SOURCE_TYPE_LABELS.image_recognition}
              </>
            ) : (
              <>
                <PenLine className="size-3" strokeWidth={2} />
                {SOURCE_TYPE_LABELS.manual}
              </>
            )}
          </p>
        </div>
      </Sheet>
    );
  }

  if (phase === "processing") {
    return (
      <Sheet
        title="Lendo a foto"
        description="O app está procurando fornecedor, itens e valores. Nada é salvo ainda."
        onClose={cancelReading}
        footer={
          <button
            type="button"
            onClick={cancelReading}
            className="btn btn-secondary h-14 w-full text-sm"
          >
            Cancelar
          </button>
        }
      >
        <div className="space-y-5 py-2">
          <div className="relative mx-auto w-full max-w-[15rem] overflow-hidden rounded-[4px] border border-line bg-cream">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Foto que está sendo lida"
                className="max-h-56 w-full object-contain opacity-80"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            ) : null}
            <span className="absolute inset-0 grid place-items-center bg-ink/10">
              <span className="grid size-12 place-items-center rounded-full bg-paper text-terracotta-dark shadow-sm">
                <Loader2 className="size-6 animate-spin" strokeWidth={2.2} />
              </span>
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-ink">
              <span>{progress.status || "Preparando a leitura"}</span>
              <span className="tabular text-muted">
                {Math.round(progress.value * 100)}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.value * 100)}
              className="mt-2 h-2 overflow-hidden rounded-full bg-sand"
            >
              <span
                className="block h-full rounded-full bg-terracotta transition-[width] duration-300"
                style={{ width: `${Math.max(4, progress.value * 100)}%` }}
              />
            </div>
            <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
              A foto é lida no seu aparelho. Na primeira vez, o navegador baixa
              o leitor e isso pode levar alguns segundos.
            </p>
          </div>
        </div>
      </Sheet>
    );
  }

  if (phase === "review") {
    const isManual = !photoFile;
    const readNothing = !isManual && !draft?.rawText;
    const confidenceTone =
      (draft?.confidence ?? 0) >= 0.7
        ? "sage"
        : (draft?.confidence ?? 0) >= 0.45
          ? "mustard"
          : "terracotta";
    const confidenceLabel =
      confidenceTone === "sage"
        ? "Leitura boa"
        : confidenceTone === "mustard"
          ? "Leitura parcial"
          : "Leitura difícil";

    return (
      <Sheet
        title={isManual ? "Complete os dados" : "Confira os dados"}
        description={
          isManual
            ? "Preencha o que aconteceu e confirme para salvar."
            : readNothing
              ? "A foto não rendeu texto. Complete os dados ou tente outra foto."
              : "O app leu a foto. Ajuste o que estiver errado e confirme."
        }
        onClose={onClose}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={changePhoto}
              className="btn btn-secondary h-14 flex-1 text-sm"
            >
              <RefreshCw className="size-4" strokeWidth={2.2} />
              {isManual ? "Usar foto" : "Outra foto"}
            </button>
            <button
              type="submit"
              form="receipt-review-form"
              disabled={saving}
              aria-busy={saving || undefined}
              className="btn btn-primary h-14 flex-[1.5] text-base"
            >
              {saving ? "Salvando…" : isManual ? "Salvar" : "Está correto"}
              <Check className="size-5" strokeWidth={2.4} />
            </button>
          </div>
        }
      >
        <form
          id="receipt-review-form"
          onSubmit={handleSubmit}
          className="space-y-5"
          noValidate
        >
          {!isManual ? (
            <div
              className={cn(
                "rounded-[4px] border p-3",
                confidenceTone === "sage" &&
                  "border-sage/35 bg-sage-soft/70 text-sage-dark",
                confidenceTone === "mustard" &&
                  "border-mustard/45 bg-mustard-soft/70 text-mustard-dark",
                confidenceTone === "terracotta" &&
                  "border-terracotta/35 bg-terracotta-soft/70 text-terracotta-dark",
              )}
            >
              <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em]">
                <Camera className="size-3.5" strokeWidth={2.2} />
                {confidenceLabel}
              </p>
              <p className="mt-1.5 text-[0.75rem] leading-relaxed">
                {confidenceTone === "sage"
                  ? "Os dados principais foram encontrados. Dá uma olhada rápida e confirme."
                  : confidenceTone === "mustard"
                    ? "Alguns dados podem estar incompletos. Confira item, valor e fornecedor."
                    : "A foto estava difícil. Confira tudo com calma antes de salvar."}
              </p>
              {(draft?.warnings.length ?? 0) > 0 ? (
                <ul className="mt-2 space-y-1 text-[0.6875rem] leading-relaxed">
                  {draft?.warnings.slice(0, 3).map((warning) => (
                    <li key={warning} className="flex items-start gap-1.5">
                      <span aria-hidden>•</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {photoUrl ? (
            <div className="flex items-center gap-3 rounded-[4px] border border-line bg-cream p-2">
              <div className="size-14 flex-none overflow-hidden rounded-[3px] border border-line bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Prévia da nota lida"
                  className="h-full w-full object-cover"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-bold text-ink">
                  Foto da nota
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-muted">
                  Leitura feita no aparelho
                </p>
                {draft?.date || draft?.cnpj ? (
                  <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted">
                    {[
                      draft?.date
                        ? `Nota de ${formatReceiptDate(draft.date)}`
                        : null,
                      draft?.cnpj ? `CNPJ ${formatCnpj(draft.cnpj)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={rotatePhoto}
                aria-label="Girar a foto e ler de novo"
                className="btn btn-secondary h-9 px-2.5 text-xs"
              >
                <RotateCw className="size-3.5" strokeWidth={2.2} />
                Girar
              </button>
            </div>
          ) : null}

          <div>
            <span className="field-label">O que é este registro?</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "purchase", label: "Compra" },
                  { value: "sale", label: "Venda" },
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
            <p className="field-hint">
              Compra entra no estoque e no custo. Venda baixa o estoque e entra
              no caixa.
            </p>
          </div>

          {kind === "purchase" ? (
            <>
              <div>
                <label htmlFor="receipt-supplier" className="field-label">
                  Fornecedor
                </label>
                <select
                  id="receipt-supplier"
                  value={supplierId ?? ""}
                  onChange={(event) => {
                    setSupplierId(event.target.value || undefined);
                    setSaveError(null);
                  }}
                  className="text-input"
                >
                  <option value="">Sem fornecedor cadastrado</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {!supplierId ? (
                  <input
                    value={supplierName}
                    onChange={(event) => {
                      setSupplierName(event.target.value);
                      setSaveError(null);
                    }}
                    placeholder="Nome do fornecedor que aparece na nota"
                    className="text-input mt-2"
                    autoComplete="off"
                    aria-label="Nome do fornecedor na nota"
                  />
                ) : null}
                <p className="field-hint">
                  Se o nome não existir ainda, ele é cadastrado ao salvar.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <span className="field-label mb-0">Itens da nota</span>
                    <p className="mt-0.5 text-[0.6875rem] text-muted">
                      {namedItems.length === 1
                        ? "1 item"
                        : `${namedItems.length} itens`}
                      {" · "}
                      {linkedItemCount === 1
                        ? "1 no estoque"
                        : `${linkedItemCount} no estoque`}
                      {" · "}
                      {newItemCount === 1
                        ? "1 novo"
                        : `${newItemCount} novos`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems((current) => [...current, blankItem()])}
                    className="inline-flex flex-none items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
                  >
                    <Plus className="size-3.5" strokeWidth={2.4} />
                    Adicionar item
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, index) => {
                    const unitCostCents = parseMoneyInput(item.unitCostInput);
                    const linkedProduct = item.productId
                      ? products.find(
                          (product) =>
                            product.id === item.productId && product.trackStock,
                        )
                      : undefined;
                    const nextStock = linkedProduct
                      ? linkedProduct.stock + item.quantity
                      : 0;
                    return (
                      <div
                        key={item.key}
                        className="rounded-[4px] border border-line bg-cream p-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            value={item.name}
                            onChange={(event) =>
                              updateItem(item.key, {
                                name: event.target.value,
                                // Ao editar o nome, a identificação anterior
                                // deixa de valer até a próxima conferência.
                                productId: undefined,
                                manualMatch: false,
                              })
                            }
                            onBlur={() => identifyItem(item.key)}
                            placeholder={`Item ${index + 1}`}
                            className="text-input h-11 min-w-0 flex-1"
                            aria-label={`Nome do item ${index + 1}`}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            aria-label={`Remover item ${index + 1}`}
                            className="grid size-10 flex-none place-items-center rounded-[4px] border border-line bg-paper text-muted transition-colors hover:border-terracotta/40 hover:text-terracotta-dark"
                          >
                            <Trash2 className="size-4" strokeWidth={2} />
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[0.625rem] font-bold",
                              linkedProduct
                                ? "bg-sage-soft text-sage-dark"
                                : "bg-terracotta-soft text-terracotta-dark",
                            )}
                          >
                            {linkedProduct ? (
                              <Check className="size-3" strokeWidth={2.6} />
                            ) : (
                              <Plus className="size-3" strokeWidth={2.6} />
                            )}
                            {linkedProduct ? "No estoque" : "Produto novo"}
                          </span>
                          {linkedProduct ? (
                            <span className="text-[0.6875rem] text-muted">
                              Vai somar em{" "}
                              <span className="font-semibold text-ink">
                                {linkedProduct.name}
                              </span>
                              {": "}
                              <span className="tabular">
                                {linkedProduct.stock} → {nextStock}
                              </span>{" "}
                              {productUnit(linkedProduct, nextStock)}
                            </span>
                          ) : (
                            <span className="text-[0.6875rem] text-muted">
                              Vai entrar como um produto novo.
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex items-end gap-2">
                          <div className="flex-none">
                            <span className="mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.08em] text-muted">
                              Qtd.
                            </span>
                            <QuantityStepper
                              value={item.quantity}
                              onChange={(next) =>
                                updateItem(item.key, { quantity: next })
                              }
                              min={1}
                              max={9999}
                              label={`Quantidade do item ${index + 1}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.08em] text-muted">
                              Custo por unidade
                            </span>
                            <MoneyInput
                              id={`receipt-item-cost-${item.key}`}
                              value={item.unitCostInput}
                              onChange={(value) =>
                                updateItem(item.key, {
                                  unitCostInput: value,
                                })
                              }
                              ariaLabel={`Custo do item ${index + 1}`}
                            />
                          </div>
                        </div>

                        <p className="mt-1.5 text-right text-[0.6875rem] font-semibold text-muted">
                          Total do item:{" "}
                          <span className="tabular text-ink">
                            {formatBRL(item.quantity * unitCostCents)}
                          </span>
                        </p>

                        <div className="mt-2">
                          <label
                            htmlFor={`receipt-item-product-${item.key}`}
                            className="mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.08em] text-muted"
                          >
                            {linkedProduct
                              ? "Produto no estoque"
                              : "Produto no estoque (opcional)"}
                          </label>
                          <select
                            id={`receipt-item-product-${item.key}`}
                            value={item.productId ?? ""}
                            onChange={(event) =>
                              chooseItemProduct(item.key, event.target.value)
                            }
                            className="text-input h-11 text-xs"
                            aria-label={`Produto no estoque para o item ${index + 1}`}
                          >
                            <option value="">Criar produto novo</option>
                            {stockProducts.length ? (
                              <optgroup label="Produtos já cadastrados">
                                {stockProducts.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name} · restam {product.stock}{" "}
                                    {productUnit(product, product.stock)}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </select>
                          <p className="mt-1 text-[0.625rem] text-muted">
                            Escolha um produto para somar no estoque. Se não
                            existir, deixe em “Criar produto novo”.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {itemNameError ? (
                  <p className="mt-2 text-xs font-medium text-terracotta-dark">
                    {itemNameError}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[4px] border border-line bg-paper p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-ink">
                    Total da compra
                  </span>
                  <span className="tabular text-lg font-extrabold text-ink">
                    {formatBRL(purchaseTotalCents)}
                  </span>
                </div>
                {totalMismatch ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-mustard-dark">
                    <TriangleAlert
                      className="mt-0.5 size-3.5 flex-none"
                      strokeWidth={2.2}
                    />
                    A nota diz {formatBRL(totalMismatch)}. Confira os itens ou o
                    total antes de salvar.
                  </p>
                ) : null}
              </div>

              <div>
                <span className="field-label">Como ficou o pagamento?</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaidNow(true);
                      setSaveError(null);
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
                      setSaveError(null);
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
                        setSaveError(null);
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
                    <label htmlFor="receipt-due" className="field-label">
                      Vencimento da conta
                    </label>
                    <input
                      id="receipt-due"
                      type="date"
                      value={dueDate}
                      onChange={(event) => {
                        setDueDate(event.target.value);
                        setSaveError(null);
                      }}
                      className="text-input"
                      aria-invalid={Boolean(dateError) || undefined}
                    />
                    {dateError ? (
                      <p className="mt-2 text-xs font-medium text-terracotta-dark">
                        {dateError}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="receipt-product" className="field-label">
                  O que foi vendido?
                </label>
                <select
                  id="receipt-product"
                  value={productId ?? ""}
                  onChange={(event) => chooseSaleProduct(event.target.value)}
                  className="text-input"
                  aria-invalid={Boolean(productError) || undefined}
                >
                  <option value="">Escolha o item</option>
                  {saleProducts.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      disabled={product.trackStock && product.stock < quantity}
                    >
                      {product.name} · {formatBRL(product.priceCents)}
                      {product.trackStock
                        ? ` · restam ${product.stock}`
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

              <div className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3 py-2">
                <span className="text-[0.8125rem] font-semibold">
                  Quantidade
                </span>
                <QuantityStepper
                  value={quantity}
                  onChange={changeSaleQuantity}
                  min={1}
                  max={
                    selectedProduct?.trackStock
                      ? Math.max(1, selectedProduct.stock)
                      : 9999
                  }
                  label="Quantidade vendida"
                />
              </div>

              <div>
                <label htmlFor="receipt-amount" className="field-label">
                  Quanto entrou?
                </label>
                <MoneyInput
                  id="receipt-amount"
                  value={amountInput}
                  onChange={(value) => {
                    setAmountInput(value);
                    setSaveError(null);
                  }}
                  ariaLabel="Quanto entrou"
                  invalid={Boolean(amountError)}
                />
                {amountError ? (
                  <p className="mt-2 text-xs font-medium text-terracotta-dark">
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
                    setSaveError(null);
                  }}
                  invalid={Boolean(paymentError)}
                />
                {paymentError ? (
                  <p className="mt-2 text-xs font-medium text-terracotta-dark">
                    {paymentError}
                  </p>
                ) : null}
              </div>
            </>
          )}

          {draft?.rawText ? (
            <details className="rounded-[4px] border border-line bg-cream p-3">
              <summary className="cursor-pointer text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
                Ver o texto que o app leu
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[0.6875rem] leading-relaxed text-ink/75">
                {draft.rawText}
              </pre>
            </details>
          ) : null}

          {saveError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium leading-relaxed text-terracotta-dark"
            >
              <TriangleAlert
                className="mt-0.5 size-4 flex-none"
                strokeWidth={2.1}
              />
              {saveError}
            </p>
          ) : null}

          <p className="rounded-[4px] border border-line bg-cream p-3 text-[0.6875rem] leading-relaxed text-muted">
            {isManual
              ? "Só os dados que você confirmar entram no caixa e no estoque."
              : "A foto não é enviada nem guardada no servidor. Só os dados que você confirmar entram no caixa e no estoque."}
          </p>
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Foto da nota"
      description="Tire ou escolha a foto. O app lê os dados e mostra tudo para você conferir antes de salvar."
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={startManual}
          className="btn btn-secondary h-12 w-full text-sm"
        >
          Prefiro digitar sem foto
        </button>
      }
    >
      <div className="space-y-5">
        <input
          ref={cameraInputRef}
          id="receipt-camera"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Tirar foto da nota"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            handleFile(file);
          }}
        />
        <input
          ref={galleryInputRef}
          id="receipt-gallery"
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Escolher foto da nota"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            handleFile(file);
          }}
        />

        <div className="grid gap-2.5">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-[7rem] w-full items-center gap-4 rounded-[4px] border border-line bg-terracotta-dark px-4 text-left text-cream transition-colors hover:bg-terracotta-deep"
          >
            <span className="grid size-12 flex-none place-items-center rounded-[4px] bg-cream/15">
              <Camera className="size-6" strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold">Tirar foto agora</span>
              <span className="mt-0.5 block text-xs text-cream/80">
                Abre a câmera do celular
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex min-h-[7rem] w-full items-center gap-4 rounded-[4px] border border-line bg-cream px-4 text-left transition-colors hover:border-terracotta hover:bg-terracotta-soft/40"
          >
            <span className="grid size-12 flex-none place-items-center rounded-[4px] bg-paper text-terracotta-dark">
              <ImagePlus className="size-6" strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-ink">
                Escolher da galeria
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Use uma foto que você já tirou
              </span>
            </span>
          </button>
        </div>

        {ocrError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium leading-relaxed text-terracotta-dark"
          >
            <TriangleAlert
              className="mt-0.5 size-4 flex-none"
              strokeWidth={2.1}
            />
            {ocrError}
          </p>
        ) : null}

        <div className="rounded-[4px] border border-line bg-cream p-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
            Como funciona
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.75rem] leading-relaxed text-ink/80">
            <li>1. Você tira ou escolhe a foto do cupom ou da nota.</li>
            <li>2. O app lê o texto e separa fornecedor, itens e valores.</li>
            <li>3. Você confere, corrige o que precisar e confirma.</li>
          </ul>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
            A leitura acontece no seu aparelho. Funciona melhor com a nota reta,
            inteira e bem iluminada. Se a foto não render, você ainda pode
            digitar sem ela.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
