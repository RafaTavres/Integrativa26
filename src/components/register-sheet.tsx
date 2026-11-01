"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";

interface RegisterSheetProps {
  onClose: () => void;
}

interface OptionProps {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
  tone: "sage" | "terracotta" | "mustard" | "sand";
  disabled?: boolean;
}

const TONES: Record<OptionProps["tone"], string> = {
  sage: "bg-sage-soft text-sage-dark",
  terracotta: "bg-terracotta-soft text-terracotta-dark",
  mustard: "bg-mustard-soft text-mustard-dark",
  sand: "bg-sand text-ink",
};

function Option({ icon: Icon, label, hint, onClick, tone, disabled }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[7.25rem] flex-col items-start justify-between gap-3 rounded-[4px] border border-line bg-paper p-3.5 text-left transition-colors hover:border-sand-dark hover:bg-cream active:translate-y-[1px] disabled:opacity-60"
    >
      <span
        className={cn(
          "grid size-10 flex-none place-items-center rounded-[4px]",
          TONES[tone],
        )}
      >
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <span>
        <span className="block text-sm font-bold leading-tight text-ink">
          {label}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted">
          {hint}
        </span>
      </span>
    </button>
  );
}

export function RegisterSheet({ onClose }: RegisterSheetProps) {
  const { segment, simulatePending } = useApp();
  const { openSale, openExpense, openReceipt } = useActions();
  const { toast } = useToast();
  const router = useRouter();
  const [sendingAudio, setSendingAudio] = useState(false);

  async function handleAudio() {
    if (sendingAudio) return;
    setSendingAudio(true);
    try {
      const pending = await simulatePending();
      if (!pending) {
        toast("Cadastre um item com estoque primeiro.", "info");
        return;
      }
      onClose();
      router.push("/");
      toast("Áudio recebido. Confira na tela inicial.", "info");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Não conseguimos registrar o áudio.",
        "info",
      );
    } finally {
      setSendingAudio(false);
    }
  }

  return (
    <Sheet
      title="Registrar"
      description="Escolha como quer lançar. Pode digitar, fotografar a nota ou falar."
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2.5">
          <Option
            tone="sage"
            icon={ArrowDownLeft}
            label={segment.saleAction}
            hint="Entrou dinheiro no caixa"
            onClick={openSale}
          />
          <Option
            tone="terracotta"
            icon={ArrowUpRight}
            label="Gasto"
            hint="Saiu dinheiro do caixa"
            onClick={openExpense}
          />
          <Option
            tone="mustard"
            icon={Camera}
            label="Foto da nota"
            hint="Cupom, nota ou comprovante"
            onClick={openReceipt}
          />
          <Option
            tone="sand"
            icon={Mic}
            label={sendingAudio ? "Ouvindo…" : "Áudio"}
            hint="Conte o que vendeu ou comprou"
            onClick={() => void handleAudio()}
            disabled={sendingAudio}
          />
        </div>

        <div className="rounded-[4px] border border-line bg-cream p-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
            Como funciona
          </p>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink/80">
            Digitar e fotografar já salvam na hora. Áudio entra como rascunho
            para você conferir antes de confirmar.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
