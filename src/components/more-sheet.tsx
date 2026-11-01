"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CakeSlice,
  Check,
  Cloud,
  CloudOff,
  Mic,
  RefreshCw,
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
    mode,
    cloudStatus,
    cloudMessage,
    ready,
    retryCloud,
    setSegment,
    simulatePending,
    resetDemo,
  } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<"segment" | "reset" | "audio" | null>(null);

  async function chooseSegment(segmentId: SegmentId) {
    if (segmentId === segment.id || busy) return;
    const next = segments.find((item) => item.id === segmentId);
    setBusy("segment");
    try {
      await setSegment(segmentId);
      onClose();
      router.push("/");
      toast(`Exemplo de ${next?.label.toLowerCase() ?? "loja"} carregado.`);
    } catch {
      toast("Não conseguimos trocar o ramo agora.", "info");
    } finally {
      setBusy(null);
    }
  }

  async function handleSimulate() {
    if (busy) return;
    setBusy("audio");
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
          : "Não conseguimos simular o áudio.",
        "info",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    if (busy) return;
    setBusy("reset");
    try {
      await resetDemo();
      onClose();
      router.push("/");
      toast("Exemplo restaurado.");
    } catch {
      toast("Não conseguimos restaurar agora.", "info");
    } finally {
      setBusy(null);
    }
  }

  const connectionTitle =
    mode === "cloud"
      ? "Salvo na nuvem"
      : cloudStatus === "connecting"
        ? "Conectando…"
        : cloudStatus === "error"
          ? "Só neste navegador"
          : "Salvo neste navegador";

  const connectionMessage =
    mode === "cloud"
      ? "Uma sessão anônima do Supabase guarda suas vendas, gastos e estoque no banco."
      : cloudStatus === "connecting"
        ? "Falando com o Supabase para abrir seu caixa."
        : cloudStatus === "error"
          ? (cloudMessage ??
            "Não conseguimos conectar ao Supabase. Os dados ficam neste navegador.")
          : (cloudMessage ??
            "O Supabase não está configurado. Os dados ficam neste navegador.");

  const canRetry =
    ready && cloudStatus !== "ready" && cloudStatus !== "connecting";

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
                  onClick={() => void chooseSegment(item.id)}
                  aria-pressed={selected}
                  disabled={busy !== null}
                  aria-busy={(busy === "segment" && !selected) || undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition-colors disabled:opacity-60",
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
              onClick={() => void handleSimulate()}
              disabled={busy !== null}
              aria-busy={busy === "audio" || undefined}
              className="btn btn-secondary h-auto flex-col items-start gap-2 px-3 py-3 text-left text-xs disabled:opacity-60"
            >
              <Mic className="size-4 text-mustard-dark" strokeWidth={2} />
              {busy === "audio" ? "Enviando…" : "Simular áudio"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={busy !== null}
              className="btn btn-secondary h-auto flex-col items-start gap-2 px-3 py-3 text-left text-xs disabled:opacity-60"
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
                  onClick={() => void handleReset()}
                  disabled={busy !== null}
                  aria-busy={busy === "reset" || undefined}
                  className="btn h-10 flex-1 bg-terracotta-dark text-xs text-cream disabled:opacity-60"
                >
                  {busy === "reset" ? "Restaurando…" : "Restaurar"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <div
          className={cn(
            "rounded-[4px] border p-3",
            mode === "cloud"
              ? "border-sage/35 bg-sage-soft"
              : cloudStatus === "error"
                ? "border-terracotta/30 bg-terracotta-soft"
                : "border-line bg-cream",
          )}
        >
          <p className="flex items-center gap-2 text-xs font-bold text-ink">
            {mode === "cloud" ? (
              <Cloud className="size-3.5 flex-none text-sage-dark" strokeWidth={2} />
            ) : (
              <CloudOff className="size-3.5 flex-none text-muted" strokeWidth={2} />
            )}
            {connectionTitle}
          </p>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">
            {connectionMessage}
          </p>
          {canRetry ? (
            <button
              type="button"
              onClick={() => void retryCloud()}
              className="mt-2 inline-flex items-center gap-1.5 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2 transition-colors hover:text-ink"
            >
              <RefreshCw className="size-3" strokeWidth={2.4} />
              Tentar conectar de novo
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
