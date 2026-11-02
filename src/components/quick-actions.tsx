"use client";

import { Plus } from "lucide-react";
import { useActions } from "./action-provider";

export function QuickActions() {
  const { openRegister } = useActions();

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
          <span className="mt-1 block text-xs font-medium text-cream/80">
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
