"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CakeSlice,
  Check,
  Lock,
  Mic,
  RotateCcw,
  Scissors,
  Shirt,
} from "lucide-react";
import { Sheet } from "./sheet";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SegmentId } from "@/lib/types";

const SEGMENT_ICONS = {
  confeitaria: CakeSlice,
  barbearia: Scissors,
  roupas: Shirt,
};

interface MoreSheetProps {
  onClose: () => void;
}

export function MoreSheet({ onClose }: MoreSheetProps) {
  const {
    business,
    segment,
    segments,
    setSegment,
    simulatePending,
    resetDemo,
  } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);

  function chooseSegment(segmentId: SegmentId) {
    if (segmentId === segment.id) return;
    const next = segments.find((item) => item.id === segmentId);
    setSegment(segmentId);
    onClose();
    router.push("/");
    toast(`Exemplo de ${next?.label.toLowerCase() ?? "loja"} carregado.`);
  }

  function handleSimulate() {
    const pending = simulatePending();
    if (!pending) {
      toast("Cadastre um item com estoque primeiro.", "info");
      return;
    }
    onClose();
    router.push("/");
    toast("Áudio recebido. Confira na tela inicial.", "info");
  }

  function handleReset() {
    resetDemo();
    onClose();
    router.push("/");
    toast("Exemplo restaurado.");
  }

  return (
    <Sheet
      title="Sua loja"
      description="Troque o ramo para ver o mesmo caixa com outra cara."
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-[4px] border border-line bg-cream p-3">
          <span className="display grid size-11 flex-none place-items-center rounded-[4px] bg-ink text-lg text-cream">
            {initials(business.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">
              {business.name}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {segment.label} · {business.city}
            </p>
          </div>
        </div>

        <section>
          <p className="eyebrow mb-2">Ramo do negócio</p>
          <div className="space-y-2">
            {segments.map((item) => {
              const Icon = SEGMENT_ICONS[item.id];
              const selected = item.id === segment.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseSegment(item.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition-colors",
                    selected
                      ? "border-terracotta bg-terracotta-soft"
                      : "border-line bg-paper hover:border-sand-dark hover:bg-cream",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 flex-none place-items-center rounded-[4px]",
                      selected
                        ? "bg-terracotta text-cream"
                        : "bg-sand text-ink",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {item.description}
                    </span>
                  </span>
                  {selected ? (
                    <span className="grid size-6 flex-none place-items-center rounded-[3px] bg-terracotta text-cream">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[0.6875rem] leading-snug text-muted">
            Trocar de ramo recomeça os dados deste exemplo.
          </p>
        </section>

        <section>
          <p className="eyebrow mb-2">Testar</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSimulate}
              className="btn btn-secondary h-auto flex-col items-start gap-2 px-3 py-3 text-left text-xs"
            >
              <Mic className="size-4 text-mustard-dark" strokeWidth={2} />
              Simular áudio
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="btn btn-secondary h-auto flex-col items-start gap-2 px-3 py-3 text-left text-xs"
            >
              <RotateCcw className="size-4 text-muted" strokeWidth={2} />
              Restaurar exemplo
            </button>
          </div>

          {confirmReset ? (
            <div className="animate-rise mt-2 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3">
              <p className="text-sm font-semibold text-ink">
                Restaurar os dados?
              </p>
              <p className="mt-1 text-xs text-muted">
                O que você registrou nesta demo será apagado.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="btn btn-secondary h-10 flex-1 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn h-10 flex-1 bg-terracotta-dark text-xs text-cream"
                >
                  Restaurar
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <p className="flex items-start gap-2 border-t border-line pt-4 text-[0.6875rem] leading-relaxed text-muted">
          <Lock className="mt-0.5 size-3.5 flex-none" strokeWidth={1.9} />
          Os dados ficam só neste navegador. Nenhuma conta é criada.
        </p>
      </div>
    </Sheet>
  );
}
