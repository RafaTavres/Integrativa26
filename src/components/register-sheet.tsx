"use client";

import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  FileSpreadsheet,
  HandCoins,
  MessageCircle,
  Mic,
  PackagePlus,
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
  hint: string;
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
  hint,
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
        "flex min-h-[6.75rem] flex-col items-start justify-between gap-2.5 rounded-[4px] border border-line bg-paper p-3 text-left transition-colors hover:border-sand-dark hover:bg-cream active:translate-y-[1px] disabled:opacity-60",
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
      <span>
        <span className="block text-[0.8125rem] font-bold leading-tight text-ink">
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
  const { segment } = useApp();
  const {
    openSale,
    openExpense,
    openReceipt,
    openPurchase,
    openWithdrawal,
    openAudio,
    openStock,
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
      description="Escolha o que aconteceu. Pode digitar, fotografar a nota, falar ou importar."
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
            className="col-span-2"
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
            icon={ShoppingBasket}
            label="Compra"
            hint="Mercadoria e fornecedor"
            onClick={() => openPurchase()}
          />
          <Option
            tone="blush"
            icon={HandCoins}
            label="Retirada"
            hint="Dinheiro que você tirou"
            onClick={openWithdrawal}
          />
          <Option
            tone="sand"
            icon={Camera}
            label="Foto da nota"
            hint="Cupom, nota ou comprovante"
            onClick={openReceipt}
          />
          <Option
            tone="sand"
            icon={Mic}
            label="Áudio"
            hint="Fale o que você vendeu"
            onClick={openAudio}
          />
          <Option
            tone="sand"
            icon={PackagePlus}
            label={segment.stockLabel}
            hint="Entrada rápida de mercadoria"
            onClick={() => openStock()}
          />
        </div>

        <button
          type="button"
          onClick={openImport}
          className="flex w-full items-center gap-3 rounded-[4px] border border-line bg-cream p-3 text-left transition-colors hover:border-sand-dark hover:bg-sand/60"
        >
          <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-paper text-sage-dark">
            <FileSpreadsheet className="size-4" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-bold text-ink">
              Importar planilha
            </span>
            <span className="mt-0.5 block text-[0.6875rem] text-muted">
              Traga vendas, gastos e compras de uma vez
            </span>
          </span>
          <span className="badge bg-ink text-cream">CSV ou XLSX</span>
        </button>

        <button
          type="button"
          onClick={openIntegrations}
          className="flex w-full items-center gap-3 rounded-[4px] border border-line bg-cream p-3 text-left transition-colors hover:border-sand-dark hover:bg-sand/60"
        >
          <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-sage-soft text-sage-dark">
            <MessageCircle className="size-4" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-bold text-ink">
              WhatsApp e integrações
            </span>
            <span className="mt-0.5 block text-[0.6875rem] text-muted">
              Prepare o número e veja o que já entra sozinho
            </span>
          </span>
          <span className="badge bg-mustard-soft text-mustard-dark">
            Não conectado
          </span>
        </button>

        <div className="rounded-[4px] border border-line bg-cream p-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
            Como funciona
          </p>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink/80">
            Digitar e fotografar já salvam na hora. Compra a prazo cria a conta
            a pagar sem tirar dinheiro do caixa. No áudio, você grava e confere
            a transcrição antes de confirmar. O WhatsApp ainda não está
            conectado — a tela de integrações só prepara o número.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
