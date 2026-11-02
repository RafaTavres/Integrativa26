"use client";

import { useState } from "react";
import { ArrowRight, Trash2, Undo2 } from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";

interface SupplierSheetProps {
  supplierId?: string;
  onClose: () => void;
}

export function SupplierSheet({ supplierId, onClose }: SupplierSheetProps) {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useApp();
  const { toast } = useToast();
  const existing = supplierId
    ? suppliers.find((supplier) => supplier.id === supplierId)
    : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const nameError = attempted && !name.trim() ? "Diga o nome do fornecedor." : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (submitting || !name.trim()) return;

    setSubmitting(true);
    try {
      if (existing) {
        await updateSupplier(existing.id, { name, phone, email, notes });
        toast("Fornecedor atualizado.");
      } else {
        await addSupplier({ name, phone, email, notes });
        toast("Fornecedor salvo.");
      }
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não conseguimos salvar.",
      );
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existing || deleting) return;
    setDeleting(true);
    try {
      await deleteSupplier(existing.id);
      toast("Fornecedor apagado.", "info");
      onClose();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não conseguimos apagar.",
        "info",
      );
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Sheet
      title={existing ? "Editar fornecedor" : "Novo fornecedor"}
      description="Com o fornecedor salvo, você compara preços e acompanha o que falta pagar."
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="supplier-form"
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
        id="supplier-form"
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <label htmlFor="supplier-name" className="field-label">
            Nome do fornecedor
          </label>
          <input
            id="supplier-name"
            autoFocus={!existing}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSubmitError(null);
            }}
            placeholder="Ex.: Atacadão do Doce"
            className="text-input"
            autoComplete="off"
            aria-invalid={Boolean(nameError) || undefined}
          />
          {nameError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="supplier-phone" className="field-label">
              Telefone <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id="supplier-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(11) 90000-0000"
              className="text-input"
              inputMode="tel"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="supplier-email" className="field-label">
              E-mail <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id="supplier-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="pedidos@fornecedor.com"
              className="text-input"
              inputMode="email"
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label htmlFor="supplier-notes" className="field-label">
            Observações <span className="font-normal text-muted">(opcional)</span>
          </label>
          <textarea
            id="supplier-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Dia de entrega, pedido mínimo, forma de pagamento…"
            className="text-input min-h-[5.5rem] resize-y"
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

        {existing ? (
          <div className="border-t border-line pt-4">
            {confirmingDelete ? (
              <div className="animate-rise rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3">
                <p className="text-sm font-semibold text-terracotta-dark">
                  Apagar {existing.name}?
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink/75">
                  Compras e contas antigas continuam no histórico, só perdem o
                  vínculo com este fornecedor.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="btn btn-secondary h-10 flex-1 text-xs"
                  >
                    <Undo2 className="size-4" strokeWidth={2} />
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    aria-busy={deleting || undefined}
                    className="btn h-10 flex-1 bg-terracotta-dark text-xs text-cream"
                  >
                    <Trash2 className="size-4" strokeWidth={2} />
                    {deleting ? "Apagando…" : "Apagar"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="btn btn-ghost h-10 px-2 text-xs font-semibold text-terracotta-dark"
              >
                <Trash2 className="size-4" strokeWidth={2} />
                Apagar fornecedor
              </button>
            )}
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
