"use client";

import { Eye, Plus } from "lucide-react";
import { useActions } from "./action-provider";
import { useApp } from "@/lib/store";

export function QuickActions() {
  const { openRegister } = useActions();
  const { readOnly, naLojaWhatsapp, cloudStatus } = useApp();

  if (readOnly) {
    return (
      <section
        aria-label="Modo somente leitura"
        className="flex min-h-[5rem] items-center gap-3 rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 text-left"
      >
        <span className="grid size-9 flex-none place-items-center rounded-[3px] bg-cream text-muted">
          <Eye className="size-4" strokeWidth={2} />
        </span>
        <span>
          <span className="block text-sm font-bold text-ink">
            {naLojaWhatsapp ? "Demonstração somente leitura" : "Sem conexão"}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {naLojaWhatsapp
              ? "Volte para a sua loja para registrar."
              : cloudStatus === "error"
                ? "Reconecte para voltar a registrar."
                : "Aguarde a conexão."}
          </span>
        </span>
      </section>
    );
  }

  return (
    <section aria-label="Registro rápido" className="grid gap-2.5">
      <button
        type="button"
        onClick={openRegister}
        className="flex min-h-[5rem] items-center justify-between gap-4 rounded-[4px] border-b-[3px] border-terracotta-deep bg-terracotta-dark px-5 text-left text-cream transition-colors hover:bg-terracotta-deep active:translate-y-[1px]"
      >
        <span>
          <span className="display block text-[1.75rem] leading-none">
            Registrar
          </span>
          <span className="mt-1 block text-xs font-medium text-cream">
            Venda, gasto, compra, retirada ou foto
          </span>
        </span>
        <span className="grid size-11 flex-none place-items-center rounded-[4px] border border-cream/35 bg-cream/10">
          <Plus className="size-6" strokeWidth={2.4} />
        </span>
      </button>
    </section>
  );
}
