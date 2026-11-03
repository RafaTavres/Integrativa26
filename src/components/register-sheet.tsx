"use client";

import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  HandCoins,
  Mic,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { cn } from "@/lib/cn";

interface RegisterSheetProps {
  onClose: () => void;
}

interface OptionProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone: "sage" | "terracotta" | "mustard" | "sand" | "blush";
  disabled?: boolean;
  className?: string;
}

const TONES: Record<OptionProps["tone"], string> = {
  sage: "bg-sage-soft text-sage-dark",
  terracotta: "bg-terracotta-soft text-terracotta-dark",
  mustard: "bg-mustard-soft text-mustard-dark",
  sand: "bg-sand text-ink",
  blush: "bg-blush text-terracotta-dark",
};

function Option({
  icon: Icon,
  label,
  onClick,
  tone,
  disabled,
  className,
}: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[4.25rem] items-center gap-2.5 rounded-[4px] border border-line bg-paper p-3 text-left transition-colors hover:border-sand-dark hover:bg-cream active:translate-y-[1px] disabled:opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-9 flex-none place-items-center rounded-[4px]",
          TONES[tone],
        )}
      >
        <Icon className="size-[1.1rem]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 text-[0.8125rem] font-bold leading-tight text-ink">
        {label}
      </span>
    </button>
  );
}

export function RegisterSheet({ onClose }: RegisterSheetProps) {
  const { segment } = useApp();
  const {
    openSale,
    openExpense,
    openReceipt,
    openPurchase,
    openWithdrawal,
    openAudio,
  } = useActions();
  const router = useRouter();

  function openImport() {
    onClose();
    router.push("/importar");
  }

  function openIntegrations() {
    onClose();
    router.push("/integracoes");
  }

  return (
    <Sheet
      title="Registrar"
      description="O que aconteceu?"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Option
            tone="sage"
            icon={ArrowDownLeft}
            label={segment.saleAction}
            onClick={openSale}
            className="col-span-2"
          />
          <Option
            tone="terracotta"
            icon={ArrowUpRight}
            label="Gasto"
            onClick={openExpense}
          />
          <Option
            tone="mustard"
            icon={ShoppingBasket}
            label="Compra"
            onClick={() => openPurchase()}
          />
          <Option
            tone="blush"
            icon={HandCoins}
            label="Retirada"
            onClick={openWithdrawal}
          />
          <Option
            tone="sand"
            icon={Camera}
            label="Foto da nota"
            onClick={openReceipt}
          />
          <Option
            tone="sand"
            icon={Mic}
            label="Áudio"
            onClick={openAudio}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.6875rem] font-semibold text-muted">
          <button
            type="button"
            onClick={openImport}
            className="underline underline-offset-2 hover:text-ink"
          >
            Importar planilha/XML
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={openIntegrations}
            className="underline underline-offset-2 hover:text-ink"
          >
            Integrações
          </button>
        </div>
      </div>
    </Sheet>
  );
}
