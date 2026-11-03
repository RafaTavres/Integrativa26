"use client";

import { Eye, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";

export function DemoBanner() {
  const { naLojaWhatsapp, voltarParaMinhaLoja } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!naLojaWhatsapp) return null;

  async function handleBack() {
    if (busy) return;
    setBusy(true);
    try {
      await voltarParaMinhaLoja();
      router.push("/");
      toast("Você voltou para a sua loja.");
    } catch {
      toast("Não conseguimos voltar para a sua loja agora.", "info");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-mustard/30 bg-mustard-soft">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="grid size-7 flex-none place-items-center rounded-[3px] bg-paper text-mustard-dark">
          <Eye className="size-3.5" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 text-[0.6875rem] leading-snug text-ink">
          <strong>Loja de demonstração do WhatsApp.</strong> Os dados são
          compartilhados e somente leitura. Seus registros ficam na sua loja.
        </p>
        <button
          type="button"
          onClick={() => void handleBack()}
          disabled={busy}
          className="inline-flex flex-none items-center gap-1.5 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2 disabled:opacity-60"
        >
          <ShieldCheck className="size-3.5" strokeWidth={2.2} />
          {busy ? "Voltando…" : "Voltar para minha loja"}
        </button>
      </div>
    </div>
  );
}
