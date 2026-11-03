"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CakeSlice,
  Cloud,
  CloudOff,
  MessageCircle,
  RefreshCw,
  Scissors,
  Shirt,
  Store,
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
    ready,
    retryCloud,
    setSegment,
    simulatePending,
    resetDemo,
    naLojaWhatsapp,
    entrarNaLojaWhatsapp,
    voltarParaMinhaLoja,
  } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<
    "segment" | "reset" | "audio" | "loja" | null
  >(null);

  async function trocarLoja() {
    if (busy) return;
    setBusy("loja");
    try {
      if (naLojaWhatsapp) {
        await voltarParaMinhaLoja();
        toast("Você voltou para a sua loja.");
      } else {
        await entrarNaLojaWhatsapp();
        toast("Loja conectada ao WhatsApp aberta.");
      }
      onClose();
      router.push(naLojaWhatsapp ? "/" : "/whatsapp");
    } catch {
      toast("Não conseguimos trocar de loja agora.", "info");
    } finally {
      setBusy(null);
    }
  }

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

  const canRetry =
    ready && cloudStatus !== "ready" && cloudStatus !== "connecting";

  return (
    <Sheet title="Sua loja" onClose={onClose}>
      <div className="space-y-4">
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

        <button
          type="button"
          onClick={() => void trocarLoja()}
          disabled={busy !== null || mode !== "cloud"}
          aria-busy={busy === "loja" || undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-[4px] border px-3 py-3 text-left transition-colors disabled:opacity-60",
            naLojaWhatsapp
              ? "border-line bg-paper hover:border-sand-dark hover:bg-cream"
              : "border-sage/35 bg-sage-soft hover:border-sage",
          )}
        >
          <span className="grid size-8 flex-none place-items-center rounded-[3px] bg-sage-soft text-sage-dark">
            {naLojaWhatsapp ? (
              <Store className="size-4" strokeWidth={2} />
            ) : (
              <MessageCircle className="size-4" strokeWidth={2} />
            )}
          </span>
          <span className="min-w-0 flex-1 text-[0.8125rem] font-bold text-ink">
            {busy === "loja"
              ? "Abrindo…"
              : naLojaWhatsapp
                ? "Voltar para a minha loja"
                : "Loja de roupa (WhatsApp)"}
          </span>
          {naLojaWhatsapp ? null : (
            <span className="badge flex-none bg-sage-soft text-sage-dark">
              Conectada
            </span>
          )}
        </button>

        {naLojaWhatsapp ? null : (
          <section>
            <p className="eyebrow mb-2">Ramo do negócio</p>
            <div className="grid grid-cols-3 gap-2">
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
                      "flex flex-col items-center gap-1.5 rounded-[4px] border p-2.5 text-center transition-colors disabled:opacity-60",
                      selected
                        ? "border-terracotta bg-terracotta-soft"
                        : "border-line bg-paper hover:border-sand-dark hover:bg-cream",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4",
                        selected ? "text-terracotta-dark" : "text-ink",
                      )}
                      strokeWidth={2}
                    />
                    <span className="text-[0.6875rem] font-semibold leading-tight text-ink">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <p className="eyebrow mb-2">Atalhos</p>
          <div className="divide-y divide-line rounded-[4px] border border-line bg-paper">
            {[
              { label: "Fornecedores", href: "/fornecedores" },
              { label: "Contas a pagar", href: "/contas" },
              { label: "Análises", href: "/analises" },
              { label: "Importar planilha/XML", href: "/importar" },
              {
                label: "WhatsApp e integrações",
                href: naLojaWhatsapp ? "/whatsapp" : "/integracoes",
                status: naLojaWhatsapp ? "Conectado" : "Não conectado",
              },
            ].map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  onClose();
                  router.push(item.href);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-cream"
              >
                <span>{item.label}</span>
                {item.status ? (
                  <span
                    className={cn(
                      "text-[0.625rem] font-bold",
                      item.status === "Conectado"
                        ? "text-sage-dark"
                        : "text-mustard-dark",
                    )}
                  >
                    {item.status}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="eyebrow mb-2">Testar</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-semibold text-muted">
            <button
              type="button"
              onClick={() => void handleSimulate()}
              disabled={busy !== null}
              className="underline underline-offset-2 hover:text-ink disabled:opacity-60"
            >
              {busy === "audio" ? "Enviando…" : "Simular áudio"}
            </button>
            {naLojaWhatsapp ? null : (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={busy !== null}
                  className="underline underline-offset-2 hover:text-ink disabled:opacity-60"
                >
                  Restaurar exemplo
                </button>
              </>
            )}
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-muted">
          <span className="flex items-center gap-1.5">
            {mode === "cloud" ? (
              <Cloud className="size-3.5 text-sage-dark" strokeWidth={2} />
            ) : (
              <CloudOff className="size-3.5" strokeWidth={2} />
            )}
            {connectionTitle}
          </span>
          {canRetry ? (
            <button
              type="button"
              onClick={() => void retryCloud()}
              className="inline-flex items-center gap-1 font-bold text-terracotta-dark underline underline-offset-2"
            >
              <RefreshCw className="size-3" strokeWidth={2.4} />
              Tentar de novo
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
